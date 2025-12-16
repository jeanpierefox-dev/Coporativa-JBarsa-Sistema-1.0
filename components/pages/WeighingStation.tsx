import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { WeighingType, ClientOrder, WeighingRecord, Payment, UserRole } from '../../types';
import { getOrders, saveOrder, getConfig, getBatches, saveConfig } from '../../services/storage';
import { ArrowLeft, Save, Printer, DollarSign, List, Home, Trash2, Plus, Bluetooth, Share2, X, Eye, Package, PackageOpen, AlertOctagon, RotateCcw, Bird, User, CheckCircle, Lock, FileText, Ban } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthContext } from '../../App';

const WeighingStation: React.FC = () => {
  const { mode, batchId } = useParams<{ mode: string; batchId?: string }>();
  const navigate = useNavigate();
  const [config, setLocalConfig] = useState(getConfig());
  const { user } = useContext(AuthContext);

  const [activeOrder, setActiveOrder] = useState<ClientOrder | null>(null);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [targetCrates, setTargetCrates] = useState(0); 
  const [chickensPerCrate, setChickensPerCrate] = useState(9); 

  // Weighing Inputs
  const [weightInput, setWeightInput] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [activeTab, setActiveTab] = useState<'FULL' | 'EMPTY' | 'MORTALITY'>('FULL');
  
  const weightInputRef = useRef<HTMLInputElement>(null);

  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pricePerKg, setPricePerKg] = useState<number>(0);
  const [payAmount, setPayAmount] = useState('');
  const [payType, setPayType] = useState<'CASH' | 'CREDIT'>('CASH');

  // Scale simulation
  const [isScaleSearching, setIsScaleSearching] = useState(false);

  useEffect(() => {
    loadOrders();
    // Listen for Cloud Updates
    const handleUpdate = () => {
        loadOrders();
        // If an order is active, refresh it from the updated list
        if (activeOrder) {
            const updatedList = getOrders();
            const found = updatedList.find(o => o.id === activeOrder.id);
            if (found) setActiveOrder(found);
        }
    };
    window.addEventListener('avi_data_orders', handleUpdate);
    
    setDefaultQuantity();
    setTimeout(() => weightInputRef.current?.focus(), 100);

    return () => window.removeEventListener('avi_data_orders', handleUpdate);
  }, [mode, batchId]);

  useEffect(() => {
    setDefaultQuantity();
    setTimeout(() => weightInputRef.current?.focus(), 100);
  }, [activeTab]);

  const setDefaultQuantity = () => {
    if (mode === WeighingType.SOLO_POLLO) {
      setQtyInput('10'); 
    } else if (mode === WeighingType.SOLO_JABAS) {
      setQtyInput('1'); 
    } else {
      if (activeTab === 'FULL') setQtyInput(config.defaultFullCrateBatch.toString());
      if (activeTab === 'EMPTY') setQtyInput(config.defaultEmptyCrateBatch.toString());
      if (activeTab === 'MORTALITY') setQtyInput('1');
    }
  };

  const loadOrders = () => {
    const all = getOrders();
    // Filter: Admin sees all, User sees own (plus if batchId matches)
    let filtered = [];
    if (mode === WeighingType.BATCH && batchId) {
      filtered = all.filter(o => o.batchId === batchId);
    } else {
      filtered = all.filter(o => !o.batchId && o.weighingMode === mode);
    }

    if (user?.role !== UserRole.ADMIN) {
        // Only show created by me
        filtered = filtered.filter(o => !o.createdBy || o.createdBy === user?.id);
    }
    // Sort: Open first, then Closed
    filtered.sort((a, b) => (a.status === 'OPEN' ? -1 : 1));
    setOrders(filtered);
  };

  const connectScale = () => {
      setIsScaleSearching(true);
      setTimeout(() => {
          setIsScaleSearching(false);
          const newConfig = {...config, scaleConnected: true};
          saveConfig(newConfig);
          setLocalConfig(newConfig);
          alert("Balanza conectada");
      }, 1500);
  };

  // KEYBOARD SHORTCUTS
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === WeighingType.SOLO_POLLO) return; 
      if (e.key === 'F1') { e.preventDefault(); setActiveTab('FULL'); }
      if (e.key === 'F2') { e.preventDefault(); setActiveTab('EMPTY'); }
      if (e.key === 'F3') { e.preventDefault(); setActiveTab('MORTALITY'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  const handleCreateClient = () => {
    if (!newClientName) return;
    
    if (batchId) {
        const batch = getBatches().find(b => b.id === batchId);
        if (batch) {
            const currentTotalCrates = orders.flatMap(o => o.records)
                                        .filter(r => r.type === 'FULL')
                                        .reduce((a,b) => a + b.quantity, 0);
            if (currentTotalCrates >= batch.totalCratesLimit) {
                alert(`LOTE LLENO: Capacidad ${batch.totalCratesLimit} jabas alcanzada.`);
                return;
            }
        }
    }

    let wMode = WeighingType.BATCH;
    if (mode === 'SOLO_POLLO') wMode = WeighingType.SOLO_POLLO;
    if (mode === 'SOLO_JABAS') wMode = WeighingType.SOLO_JABAS;

    const newOrder: ClientOrder = {
      id: Date.now().toString(),
      clientName: newClientName,
      targetCrates: targetCrates, 
      pricePerKg: 0,
      status: 'OPEN',
      records: [],
      batchId: batchId,
      weighingMode: wMode,
      paymentStatus: 'PENDING',
      payments: [],
      createdBy: user?.id
    };
    saveOrder(newOrder);
    setOrders(prev => [...prev, newOrder]);
    setActiveOrder(newOrder);
    setPricePerKg(0);
    setShowClientModal(false);
    setNewClientName('');
    setTargetCrates(0);
  };

  const getTotals = (order: ClientOrder) => {
    const full = order.records.filter(r => r.type === 'FULL');
    const empty = order.records.filter(r => r.type === 'EMPTY');
    const mort = order.records.filter(r => r.type === 'MORTALITY');

    const totalFullWeight = full.reduce((a, b) => a + b.weight, 0);
    const totalEmptyWeight = empty.reduce((a, b) => a + b.weight, 0);
    const totalMortWeight = mort.reduce((a, b) => a + b.weight, 0);
    
    const fullCratesCount = full.reduce((a, b) => a + b.quantity, 0);
    const emptyCratesCount = empty.reduce((a, b) => a + b.quantity, 0);
    const mortCount = mort.reduce((a, b) => a + b.quantity, 0);
    
    let estimatedChickens = 0;
    if (mode === WeighingType.SOLO_POLLO) {
        estimatedChickens = fullCratesCount; 
    } else if (mode === WeighingType.SOLO_JABAS) {
        estimatedChickens = fullCratesCount * chickensPerCrate;
    } else {
        estimatedChickens = fullCratesCount * 9; 
    }

    const netWeight = totalFullWeight - totalEmptyWeight - totalMortWeight;
    const avgWeight = estimatedChickens > 0 ? (netWeight / estimatedChickens) : 0;

    return { totalFullWeight, totalEmptyWeight, totalMortWeight, fullCratesCount, emptyCratesCount, mortCount, netWeight, estimatedChickens, avgWeight };
  };

  const addWeight = () => {
    if (!activeOrder || !weightInput || !qtyInput) return;
    
    const totals = getTotals(activeOrder);
    const qty = parseInt(qtyInput);

    // BLOCKING LOGIC (GRANULAR)
    if (activeOrder.targetCrates > 0) {
         if (activeTab === 'FULL' && totals.fullCratesCount + qty > activeOrder.targetCrates) {
             alert(`BLOQUEO: El cliente solicitó máximo ${activeOrder.targetCrates} jabas llenas.`);
             return;
         }
         if (activeTab === 'EMPTY' && totals.emptyCratesCount + qty > activeOrder.targetCrates) {
             alert(`BLOQUEO: Ya se pesaron todas las ${activeOrder.targetCrates} jabas vacías correspondientes.`);
             return;
         }
    }

    const record: WeighingRecord = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      weight: parseFloat(weightInput),
      quantity: qty,
      type: activeTab
    };

    const updatedOrder = { ...activeOrder, records: [record, ...activeOrder.records] };
    saveOrder(updatedOrder);
    setActiveOrder(updatedOrder);
    setWeightInput('');
    weightInputRef.current?.focus();
  };

  const deleteRecord = (id: string) => {
    if(!activeOrder) return;
    if(!confirm('¿Eliminar esta pesada?')) return;
    const updatedRecords = activeOrder.records.filter(r => r.id !== id);
    const updatedOrder = { ...activeOrder, records: updatedRecords };
    saveOrder(updatedOrder);
    setActiveOrder(updatedOrder);
  };

  // --- CORPORATE TICKET STYLE ---
  const printTicket = (isPreview: boolean = false) => {
    if (!activeOrder) return;
    const totals = getTotals(activeOrder);
    
    const currentPrice = isPreview || activeOrder.pricePerKg === 0 ? pricePerKg : activeOrder.pricePerKg;
    const totalPay = (mode === WeighingType.SOLO_POLLO ? totals.totalFullWeight : totals.netWeight) * currentPrice;

    const doc = new jsPDF({ unit: 'mm', format: [80, 220] });
    
    // --- STYLING CONSTANTS ---
    const pageWidth = 80;
    const centerX = pageWidth / 2;
    let y = 10;

    // 1. HEADER LOGO & COMPANY
    if (config.logoUrl) {
        try { doc.addImage(config.logoUrl, 'PNG', centerX - 10, y, 20, 20); y+= 22; } catch {}
    } else {
        y += 5;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(config.companyName.toUpperCase() || 'AVICOLA', centerX, y, { align: 'center' });
    y += 5;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("RUC: 20601234567 | Lima, Perú", centerX, y, { align: 'center' }); // Example place
    y += 5;
    doc.text("TICKET DE VENTA ELECTRONICO", centerX, y, { align: 'center' });
    y += 6;

    // 2. INFO BOX
    doc.setDrawColor(0);
    doc.setLineWidth(0.1);
    doc.line(5, y, 75, y);
    y += 4;
    
    doc.setFontSize(9);
    doc.text(`FECHA: ${new Date().toLocaleString()}`, 5, y);
    y += 4;
    doc.text(`CLIENTE: ${activeOrder.clientName}`, 5, y);
    y += 4;
    doc.text(`ID TICKET: #${activeOrder.id.slice(-6)}`, 5, y);
    y += 5;
    doc.line(5, y, 75, y);
    y += 5;

    // 3. DETAILS TABLE
    doc.setFont("helvetica", "bold");
    doc.text("DESCRIPCIÓN", 5, y);
    doc.text("CANT.", 45, y, { align: 'center' });
    doc.text("TOTAL", 75, y, { align: 'right' });
    y += 3;
    doc.setFont("helvetica", "normal");

    const row = (label: string, qty: number, weight: number) => {
        if(qty === 0 && weight === 0) return;
        doc.text(label, 5, y);
        doc.text(qty.toString(), 45, y, { align: 'center' });
        doc.text(`${weight.toFixed(2)} kg`, 75, y, { align: 'right' });
        y += 4;
    };

    if(mode === WeighingType.SOLO_POLLO) {
        row('Pollos (Bruto)', totals.fullCratesCount, totals.totalFullWeight);
    } else {
        row('Jabas Llenas', totals.fullCratesCount, totals.totalFullWeight);
        row('Jabas Vacías', totals.emptyCratesCount, totals.totalEmptyWeight);
        row('Merma', totals.mortCount, totals.totalMortWeight);
    }
    
    y += 2;
    doc.setLineDash([1, 1], 0);
    doc.line(5, y, 75, y);
    doc.setLineDash([], 0);
    y += 5;

    // 4. TOTALS SECTION
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("PESO NETO:", 5, y);
    doc.text(`${totals.netWeight.toFixed(2)} kg`, 75, y, { align: 'right' });
    y += 5;
    
    doc.text(`PRECIO UNIT.:`, 5, y);
    doc.text(`S/. ${currentPrice.toFixed(2)}`, 75, y, { align: 'right' });
    y += 6;

    // Big Total Box
    doc.setFillColor(0); // Black fill
    doc.roundedRect(5, y, 70, 14, 2, 2, 'F');
    y += 9;
    doc.setTextColor(255); // White text
    doc.setFontSize(16);
    doc.text("TOTAL A PAGAR", centerX, y - 2, { align: 'center' });
    doc.text(`S/. ${totalPay.toFixed(2)}`, centerX, y + 4, { align: 'center' });
    doc.setTextColor(0);
    y += 12;

    // 5. STATUS & FOOTER
    if (activeOrder.paymentStatus === 'PAID') {
         doc.setFontSize(14);
         doc.setTextColor(100);
         doc.text("[ CANCELADO ]", centerX, y + 5, { align: 'center' });
    } else if (payType === 'CREDIT') {
         doc.setFontSize(14);
         doc.setTextColor(100);
         doc.text("[ CRÉDITO ]", centerX, y + 5, { align: 'center' });
    }
    
    y += 15;
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.text("Gracias por su preferencia.", centerX, y, { align: 'center' });
    doc.text("Conserve este ticket para reclamos.", centerX, y + 3, { align: 'center' });

    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  const handlePayment = () => {
    if (!activeOrder) return;
    const totals = getTotals(activeOrder);
    const weightToPay = mode === WeighingType.SOLO_POLLO ? totals.totalFullWeight : totals.netWeight;
    const totalCost = weightToPay * pricePerKg; 

    // LOGIC FIX FOR CREDIT:
    let amountToRecord = 0;
    
    if (payAmount !== '') {
        amountToRecord = parseFloat(payAmount);
    } else {
        // If empty, auto-fill based on type
        amountToRecord = payType === 'CASH' ? totalCost : 0;
    }

    const newPayments = [...activeOrder.payments];
    
    // Only add a payment record if there is actual money moving
    if (amountToRecord > 0) {
        newPayments.push({
            id: Date.now().toString(),
            amount: amountToRecord,
            timestamp: Date.now(),
            note: payType === 'CASH' ? 'Pago Contado' : 'Abono Inicial Crédito'
        });
    }

    // Determine status
    const totalPaidSoFar = newPayments.reduce((acc, p) => acc + p.amount, 0);
    const isFullyPaid = (totalCost - totalPaidSoFar) <= 0.1;

    const updatedOrder: ClientOrder = { 
        ...activeOrder, 
        pricePerKg: pricePerKg,
        payments: newPayments,
        paymentStatus: isFullyPaid ? 'PAID' : 'PENDING',
        paymentMethod: payType, // Save the intention
        status: 'CLOSED' 
    };
    
    saveOrder(updatedOrder);
    setActiveOrder(updatedOrder);
    setShowPaymentModal(false);
    loadOrders(); 
    
    // Auto Generate Ticket
    setTimeout(() => printTicket(), 300);
  };
  
  const generateDetailPDF = () => {
    if(!activeOrder) return;
    const totals = getTotals(activeOrder);
    const doc = new jsPDF();
    
    // Config Data
    const company = config.companyName || 'AVICOLA';
    const logo = config.logoUrl;
    const date = new Date().toLocaleString();
    const batchInfo = batchId ? getBatches().find(b => b.id === batchId)?.name : 'N/A';
    
    // Styles & Colors
    const blueColor = [23, 37, 84]; // Navy Blue
    const orangeColor = [194, 65, 12]; // Orange
    const redColor = [185, 28, 28]; // Red
    
    // --- HEADER ---
    if (logo) {
        try { doc.addImage(logo, 'PNG', 14, 10, 20, 20); } catch (e) {}
    }
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(blueColor[0], blueColor[1], blueColor[2]);
    doc.text(company.toUpperCase(), 105, 18, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text("REPORTE DETALLADO DE PESAJE", 105, 24, { align: 'center' });
    
    // --- INFO CARD ---
    autoTable(doc, {
        startY: 35,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 1: { cellWidth: 70 }, 2: { fontStyle: 'bold', cellWidth: 30 } },
        body: [
            ['Cliente:', activeOrder.clientName, 'Fecha:', date],
            ['Lote/Ref:', batchInfo || 'Venta Directa', 'Operador:', user?.name || 'Admin'],
            ['Estado:', activeOrder.status === 'CLOSED' ? 'CERRADO' : 'ABIERTO', 'Ticket ID:', activeOrder.id.slice(-6)]
        ]
    });

    // --- EXECUTIVE SUMMARY (Horizontal) ---
    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 6,
        theme: 'grid',
        headStyles: { fillColor: blueColor, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 1.5, halign: 'center' },
        columnStyles: { 
            0: { fontStyle: 'bold' }, 
            3: { fontStyle: 'bold', textColor: blueColor }
        },
        head: [['JABAS LLENAS (Bruto)', 'JABAS VACÍAS (Tara)', 'MERMA (Kg)', 'PESO NETO (Kg)']],
        body: [
            [
                `${totals.fullCratesCount} und | ${totals.totalFullWeight.toFixed(2)} kg`,
                `${totals.emptyCratesCount} und | ${totals.totalEmptyWeight.toFixed(2)} kg`,
                `${totals.mortCount} und | ${totals.totalMortWeight.toFixed(2)} kg`,
                totals.netWeight.toFixed(2)
            ]
        ]
    });

    const summaryY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(11);
    doc.setTextColor(blueColor[0], blueColor[1], blueColor[2]);
    doc.setFont("helvetica", "bold");
    doc.text("DETALLE DE MOVIMIENTOS", 14, summaryY);
    
    // --- SIDE-BY-SIDE TABLES LOGIC (COMPACT) ---
    const getTableData = (type: 'FULL' | 'EMPTY' | 'MORTALITY') => {
        return activeOrder.records
            .filter(r => r.type === type)
            .sort((a,b) => a.timestamp - b.timestamp)
            .map((r, i) => [
                (i + 1).toString(),
                r.quantity,
                r.weight.toFixed(2)
            ]);
    };

    const fullData = getTableData('FULL');
    const emptyData = getTableData('EMPTY');
    const mortData = getTableData('MORTALITY');

    // Add Totals Row to Data
    if (fullData.length > 0) fullData.push(['TOT', totals.fullCratesCount, totals.totalFullWeight.toFixed(2)]);
    if (emptyData.length > 0) emptyData.push(['TOT', totals.emptyCratesCount, totals.totalEmptyWeight.toFixed(2)]);
    
    let currentY = summaryY + 5;
    
    // ADJUST DIMENSIONS FOR COMPACT 2-COLUMN LAYOUT
    const pageWidth = doc.internal.pageSize.getWidth(); // ~210mm
    const margin = 12; // 12mm Margin
    const gutter = 6;  // 6mm Gutter
    const availableWidth = pageWidth - (margin * 2);
    const tableWidth = (availableWidth - gutter) / 2;

    let finalYFull = currentY;
    let finalYEmpty = currentY;

    // --- LEFT TABLE: JABAS LLENAS ---
    if (fullData.length > 0) {
        autoTable(doc, {
            startY: currentY,
            head: [['#', 'Cant.', 'Peso (kg)']],
            body: fullData,
            theme: 'grid',
            headStyles: { fillColor: blueColor, halign: 'center', fontSize: 8 },
            styles: { fontSize: 7, halign: 'center', cellPadding: 1 }, // COMPACT FONT & PADDING
            columnStyles: { 
                0: { cellWidth: 8 }, 
                1: { cellWidth: 15, fontStyle: 'bold' },
                2: { halign: 'right' } 
            },
            margin: { left: margin },
            tableWidth: tableWidth,
            didParseCell: function(data) {
                if (data.section === 'body' && data.row.index === fullData.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [241, 245, 249];
                }
            }
        });
        finalYFull = (doc as any).lastAutoTable.finalY;
    }

    // --- RIGHT TABLE: JABAS VACIAS ---
    if (emptyData.length > 0) {
        autoTable(doc, {
            startY: currentY, // Align top with Left Table
            head: [['#', 'Cant.', 'Peso (kg)']],
            body: emptyData,
            theme: 'grid',
            headStyles: { fillColor: orangeColor, halign: 'center', fontSize: 8 },
            styles: { fontSize: 7, halign: 'center', cellPadding: 1 }, // COMPACT FONT & PADDING
            columnStyles: { 
                0: { cellWidth: 8 }, 
                1: { cellWidth: 15, fontStyle: 'bold' },
                2: { halign: 'right' } 
            },
            margin: { left: margin + tableWidth + gutter }, // Offset to right column
            tableWidth: tableWidth,
            didParseCell: function(data) {
                if (data.section === 'body' && data.row.index === emptyData.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [255, 237, 213];
                }
            }
        });
        finalYEmpty = (doc as any).lastAutoTable.finalY;
    }
    
    // --- BOTTOM TABLE: MORTALITY ---
    if (mortData.length > 0) {
        // Position below the longest table
        const nextY = Math.max(finalYFull, finalYEmpty) + 8;
        
        // Check Page Break
        if (nextY > 260) {
             doc.addPage();
             currentY = 20;
        } else {
             currentY = nextY;
        }

        doc.setFontSize(9);
        doc.setTextColor(redColor[0], redColor[1], redColor[2]);
        doc.setFont("helvetica", "bold");
        doc.text("Registro de Merma / Mortalidad", margin, currentY - 2);

        mortData.push(['TOT', totals.mortCount, totals.totalMortWeight.toFixed(2)]);

        autoTable(doc, {
            startY: currentY,
            head: [['#', 'Cantidad Aves', 'Peso (kg)']],
            body: mortData,
            theme: 'striped',
            headStyles: { fillColor: redColor, halign: 'center', fontSize: 8 },
            styles: { fontSize: 7, halign: 'center', cellPadding: 1 }, // COMPACT
            columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
            margin: { left: margin, right: margin },
            tableWidth: 'auto', // Auto fill available width
            didParseCell: function(data) {
                if (data.section === 'body' && data.row.index === mortData.length - 1) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });
    }

    const pageCount = (doc as any).internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Generado por Sistema Barsa - ${new Date().toLocaleString()}`, 10, 285);
        doc.text(`Página ${i} de ${pageCount}`, 190, 285, { align: 'right' });
    }

    doc.save(`Reporte_${activeOrder.clientName.replace(/\s+/g, '_')}.pdf`);
  };

  const ConsolidatedDetail = () => {
    const totals = getTotals(activeOrder!);
    
    const renderMiniTable = (type: 'FULL'|'EMPTY'|'MORTALITY', title: string, colorClass: string, lightColorClass: string) => {
        const records = activeOrder!.records.filter(r => r.type === type).sort((a,b) => b.timestamp - a.timestamp);
        return (
            <div className="flex flex-col h-full border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className={`p-2 font-bold text-white text-center text-xs uppercase ${colorClass}`}>
                    {title} ({records.length})
                </div>
                <div className="flex-1 overflow-y-auto max-h-60 bg-white">
                    <table className="w-full text-xs">
                        <thead className={`${lightColorClass} text-slate-700 sticky top-0 font-bold`}>
                            <tr>
                                <th className="p-2 text-left">Hora</th>
                                <th className="p-2 text-center">Cant.</th>
                                <th className="p-2 text-right">Peso</th>
                                <th className="p-2 text-center w-8"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {records.map(r => (
                                <tr key={r.id}>
                                    <td className="p-2 text-slate-600 font-mono">{new Date(r.timestamp).toLocaleTimeString()}</td>
                                    <td className="p-2 text-center font-bold text-slate-700">{r.quantity}</td>
                                    <td className="p-2 text-right font-bold text-slate-900 font-mono">{r.weight.toFixed(2)}</td>
                                    <td className="p-2 text-center">
                                        {activeOrder?.status !== 'CLOSED' && (
                                            <button onClick={() => deleteRecord(r.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded p-1">
                                                <Trash2 size={14}/>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-2 bg-slate-50 flex justify-between text-xs font-black border-t border-slate-200 text-slate-800">
                     <span>Tot: {records.reduce((a,b)=>a+b.quantity,0)} und</span>
                     <span>{records.reduce((a,b)=>a+b.weight,0).toFixed(2)} kg</span>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-blue-950 bg-opacity-90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col border border-blue-800">
                <div className="p-4 border-b border-blue-900 flex justify-between items-center bg-blue-950 text-white rounded-t-2xl shadow-lg">
                    <div>
                        <h3 className="text-xl font-bold tracking-tight">Detalle de Pesaje</h3>
                        <p className="text-sm opacity-70 font-mono">{activeOrder?.clientName}</p>
                    </div>
                    <button onClick={() => setShowDetailModal(false)} className="hover:bg-blue-900 p-2 rounded-full transition-colors"><X/></button>
                </div>
                
                <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 bg-white border-b border-slate-200 shadow-sm">
                     {/* Summary Boxes */}
                     <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-center">
                         <p className="text-[10px] text-slate-400 font-bold uppercase">Jabas</p>
                         <p className="font-black text-slate-800 text-lg">{totals.fullCratesCount}</p>
                     </div>
                     <div className="bg-blue-50 p-2 rounded-lg border border-blue-100 text-center">
                         <p className="text-[10px] text-blue-400 font-bold uppercase">Bruto</p>
                         <p className="font-black text-blue-900 text-lg">{totals.totalFullWeight.toFixed(2)}</p>
                     </div>
                     <div className="bg-orange-50 p-2 rounded-lg border border-orange-100 text-center">
                         <p className="text-[10px] text-orange-400 font-bold uppercase">Tara</p>
                         <p className="font-black text-orange-900 text-lg">{totals.totalEmptyWeight.toFixed(2)}</p>
                     </div>
                     <div className="bg-red-50 p-2 rounded-lg border border-red-100 text-center">
                         <p className="text-[10px] text-red-400 font-bold uppercase">Merma</p>
                         <p className="font-black text-red-900 text-lg">{totals.totalMortWeight.toFixed(2)}</p>
                     </div>
                     <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-100 text-center">
                         <p className="text-[10px] text-emerald-600 font-bold uppercase">Neto</p>
                         <p className="font-black text-emerald-700 text-lg">{totals.netWeight.toFixed(2)}</p>
                     </div>
                </div>

                <div className="flex-1 overflow-hidden p-4 bg-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full">
                         {renderMiniTable('FULL', 'JABAS LLENAS', 'bg-blue-800', 'bg-blue-50')}
                         {renderMiniTable('EMPTY', 'JABAS VACÍAS', 'bg-orange-700', 'bg-orange-50')}
                         {renderMiniTable('MORTALITY', 'MERMA', 'bg-red-700', 'bg-red-50')}
                    </div>
                </div>

                <div className="p-4 border-t border-slate-300 flex justify-end gap-3 bg-white rounded-b-2xl">
                    <button onClick={generateDetailPDF} className="bg-slate-100 text-blue-900 px-6 py-3 rounded-xl font-bold flex items-center hover:bg-slate-200 border border-slate-300 shadow-lg">
                        <FileText size={20} className="mr-2"/> Reporte PDF Corporativo
                    </button>
                    {/* Removed Print Ticket Button as requested */}
                </div>
            </div>
        </div>
    );
  };

  // CLIENT SELECTION SCREEN
  if (!activeOrder) {
    const title = mode === WeighingType.BATCH ? 'Selección de Cliente' : mode === WeighingType.SOLO_POLLO ? 'Venta Directa: Solo Pollo' : 'Venta Directa: Solo Jabas';
    const batchInfo = batchId ? getBatches().find(b => b.id === batchId) : null;
    
    return (
      <div className="p-4">
        {/* Header with Return to Batch */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
            <div>
                <h2 className="text-xl md:text-3xl font-black text-blue-950 tracking-tight">{title}</h2>
                {batchInfo && <p className="text-sm md:text-lg text-blue-700 font-bold">{batchInfo.name}</p>}
                <p className="text-slate-500 text-xs md:text-sm mt-1">Seleccione un cliente para iniciar el pesaje</p>
            </div>
            <div className="flex gap-2 md:gap-3">
                 {batchId && (
                     <button onClick={() => navigate('/lotes')} className="bg-blue-50 border border-blue-200 text-blue-800 px-3 md:px-5 py-2 md:py-3 rounded-xl flex items-center font-bold shadow-sm hover:bg-blue-100 transition-colors text-xs md:text-base">
                        <RotateCcw size={16} className="mr-1 md:mr-2"/> Regresar
                     </button>
                 )}
                 <button onClick={() => navigate('/')} className="bg-white border border-gray-300 text-slate-700 px-3 md:px-5 py-2 md:py-3 rounded-xl flex items-center font-bold shadow-sm hover:bg-gray-50 transition-colors text-xs md:text-base">
                      <Home size={16} className="mr-1 md:mr-2"/> Menú
                 </button>
            </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <button 
            onClick={() => setShowClientModal(true)}
            className="flex flex-col items-center justify-center h-full min-h-[200px] bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl hover:bg-white hover:border-blue-600 hover:shadow-xl transition-all group"
          >
            <div className="bg-white p-4 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform text-blue-600">
                <Plus size={32} />
            </div>
            <span className="font-bold text-slate-600 text-lg group-hover:text-blue-700">Nuevo Cliente</span>
          </button>
          
          {orders.map(order => {
             const totals = getTotals(order);
             const isCompleted = order.targetCrates > 0 && totals.fullCratesCount >= order.targetCrates;
             const isClosed = order.status === 'CLOSED';
             const percent = order.targetCrates > 0 ? Math.min((totals.fullCratesCount / order.targetCrates) * 100, 100) : 0;

             return (
                <div key={order.id} 
                     onClick={() => setActiveOrder(order)} 
                     className={`bg-white rounded-2xl shadow-md transition-all border overflow-hidden relative group flex flex-col 
                     ${isClosed ? 'border-gray-300 opacity-80 cursor-pointer' : 
                       isCompleted ? 'border-emerald-200 cursor-pointer bg-emerald-50' : 
                       'border-slate-200 hover:border-blue-400 hover:shadow-2xl hover:-translate-y-1 cursor-pointer'}`}
                >
                  {/* Card Header */}
                  <div className={`p-4 flex justify-between items-start ${isClosed ? 'bg-gray-700' : isCompleted ? 'bg-emerald-600' : 'bg-blue-950'}`}>
                     <div className="flex items-center space-x-2 overflow-hidden">
                         <div className="bg-white/10 p-1.5 rounded-lg text-white">
                             {isClosed ? <Lock size={18}/> : isCompleted ? <CheckCircle size={18}/> : <User size={18} />}
                         </div>
                         <h3 className="font-black text-white truncate text-lg">{order.clientName}</h3>
                     </div>
                     {isClosed && <span className="text-xs bg-white text-gray-800 px-2 py-1 rounded font-bold">CERRADO</span>}
                     {!isClosed && isCompleted && <span className="text-xs bg-emerald-800 text-white px-2 py-1 rounded font-bold">COMPLETO</span>}
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                      {order.targetCrates > 0 && (
                          <div className="mb-4">
                             <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-1">
                                 <span className="text-slate-500">Progreso</span>
                                 <span className={isCompleted ? 'text-emerald-600' : 'text-blue-600'}>{totals.fullCratesCount} / {order.targetCrates}</span>
                             </div>
                             <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                 <div className={`h-full rounded-full transition-all ${isClosed ? 'bg-gray-400' : isCompleted ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${percent}%` }}></div>
                             </div>
                          </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 text-center mt-auto">
                          <div className="bg-blue-50 p-2 rounded-xl border border-blue-100">
                              <p className="text-[9px] font-bold text-blue-500 uppercase">Jabas</p>
                              <p className="font-black text-slate-800 text-xl">{totals.fullCratesCount}</p>
                          </div>
                          <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
                              <p className="text-[9px] font-bold text-emerald-600 uppercase">Neto</p>
                              {/* CHANGED: 2 decimals for net weight in card */}
                              <p className="font-black text-slate-800 text-xl">{totals.netWeight.toFixed(2)}</p>
                          </div>
                      </div>
                      
                      {/* Hint for blocked/completed cards */}
                      {(isCompleted || isClosed) && (
                         <div className="absolute inset-0 bg-white/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <div className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center">
                                 <Eye size={18} className="mr-2"/> Ver Detalle
                             </div>
                         </div>
                      )}
                  </div>
                </div>
             );
          })}
        </div>

        {showClientModal && (
           <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
             <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
                <h3 className="font-black text-2xl mb-6 text-slate-900">Registrar Cliente</h3>
                <input 
                  className="w-full border-2 border-gray-200 rounded-xl mb-4 p-4 font-bold text-slate-900 outline-none focus:border-blue-500 transition-colors" 
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  placeholder="Nombre del Cliente"
                  autoFocus
                />
                <input 
                   type="number"
                   className="w-full border-2 border-gray-200 rounded-xl mb-4 p-4 font-bold text-slate-900 outline-none focus:border-blue-500 transition-colors" 
                   value={targetCrates || ''}
                   onChange={e => setTargetCrates(Number(e.target.value))}
                   placeholder="Límite Jabas (Opcional)"
                />
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={() => setShowClientModal(false)} className="text-slate-500 font-bold px-4 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button onClick={handleCreateClient} className="bg-blue-900 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-800">Crear Cliente</button>
                </div>
             </div>
           </div>
        )}
      </div>
    );
  }

  const totals = getTotals(activeOrder);
  const isLocked = activeOrder.status === 'CLOSED';
  
  // GRANULAR BLOCKING: Limit is only considered reached if target > 0 and current >= target
  const isFullLimitReached = activeOrder.targetCrates > 0 && totals.fullCratesCount >= activeOrder.targetCrates;
  const isEmptyLimitReached = activeOrder.targetCrates > 0 && totals.emptyCratesCount >= activeOrder.targetCrates;
  
  // Specific Tab Blocking Logic
  let isTabBlocked = false;
  let blockMessage = '';

  if (activeTab === 'FULL' && isFullLimitReached && mode !== WeighingType.SOLO_POLLO) {
      isTabBlocked = true;
      blockMessage = 'META DE JABAS LLENAS ALCANZADA';
  } else if (activeTab === 'EMPTY' && isEmptyLimitReached && mode !== WeighingType.SOLO_POLLO) {
      isTabBlocked = true;
      blockMessage = 'META DE JABAS VACÍAS ALCANZADA';
  }

  // WEIGHING UI
  return (
    <div className="h-full flex flex-col space-y-4 max-w-7xl mx-auto">
      {/* 1. Header Info (COMPACT DIGITAL NAVY - RESPONSIVE) */}
      <div className="bg-blue-950 p-2 md:p-3 rounded-2xl shadow-lg border border-blue-900 text-white flex flex-col lg:flex-row justify-between items-center gap-3 relative overflow-hidden">
          
          <div className="flex items-center z-10 w-full lg:w-auto">
             <button onClick={() => setActiveOrder(null)} className="p-2 bg-blue-900 rounded-xl mr-3 hover:bg-blue-800 transition-colors border border-blue-800 shadow-sm">
                 <ArrowLeft size={20} className="text-white" />
             </button>
             <div>
                 <h1 className="text-base md:text-lg font-black text-white tracking-tight leading-none flex items-center">
                    {activeOrder?.clientName} 
                    {isLocked && <Lock size={16} className="ml-2 text-yellow-400"/>}
                    {(isFullLimitReached || isEmptyLimitReached) && !isLocked && <CheckCircle size={16} className="ml-2 text-emerald-400" />}
                 </h1>
                 <div className="flex items-center space-x-2 mt-1 text-[10px] md:text-xs font-mono text-blue-200 opacity-80">
                     <span>{mode === WeighingType.SOLO_POLLO ? 'SOLO POLLO' : mode === WeighingType.SOLO_JABAS ? 'SOLO JABAS' : 'LOTE'}</span>
                     <span>|</span>
                     <span>LIMITE: <span className={`${isFullLimitReached ? 'text-emerald-400' : 'text-white'} font-bold`}>{activeOrder?.targetCrates > 0 ? activeOrder.targetCrates : '∞'}</span></span>
                 </div>
             </div>
          </div>
          
          <div className="flex-1 w-full flex justify-center z-10">
              <div className="grid grid-cols-4 gap-2 w-full max-w-3xl">
                  <div className="bg-blue-900/50 px-2 py-1.5 rounded-lg border border-blue-800 text-center backdrop-blur-sm">
                      <p className="text-[8px] md:text-[9px] text-blue-300 uppercase font-bold tracking-widest">Jabas</p>
                      <p className="font-mono text-sm md:text-xl font-bold text-yellow-400 leading-none">{totals.fullCratesCount}</p>
                  </div>
                  <div className="bg-blue-900/50 px-2 py-1.5 rounded-lg border border-blue-800 text-center backdrop-blur-sm">
                      <p className="text-[8px] md:text-[9px] text-blue-300 uppercase font-bold tracking-widest">Bruto</p>
                      <p className="font-mono text-sm md:text-xl font-bold text-blue-300 leading-none">{totals.totalFullWeight.toFixed(1)}</p>
                  </div>
                  <div className="bg-blue-900/50 px-2 py-1.5 rounded-lg border border-blue-800 text-center backdrop-blur-sm">
                      <p className="text-[8px] md:text-[9px] text-blue-300 uppercase font-bold tracking-widest">Prom.</p>
                      <p className="font-mono text-sm md:text-xl font-bold text-purple-300 leading-none">{totals.avgWeight.toFixed(2)}</p>
                  </div>
                   <div className="bg-blue-900 px-2 py-1.5 rounded-lg border border-emerald-800 text-center shadow-inner shadow-black/20">
                      <p className="text-[8px] md:text-[9px] text-emerald-400 uppercase font-bold tracking-widest">Neto</p>
                      <p className="font-mono text-lg md:text-2xl font-bold text-emerald-400 leading-none">{totals.netWeight.toFixed(1)}</p>
                  </div>
              </div>
          </div>

          <div className="flex gap-2 w-full lg:w-auto z-10">
              <button onClick={() => setShowDetailModal(true)} className="flex-1 lg:flex-none bg-blue-900 text-white p-2.5 rounded-xl font-bold hover:bg-blue-800 shadow border border-blue-800 transition-all" title="Ver Detalle">
                  <Eye size={20}/>
              </button>
              {/* Show COBRAR button even if locked to allow reprinting/viewing, just logic inside modal will restrict */}
              <button onClick={() => { setPricePerKg(activeOrder?.pricePerKg || 0); setShowPaymentModal(true); }} className="flex-1 lg:flex-none bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-emerald-500 shadow-lg flex items-center justify-center transition-all text-xs md:text-sm">
                  <span className="mr-1">S/.</span> COBRAR
              </button>
          </div>
      </div>

      {/* 2. Input Area (Hidden if locked) */}
      {!isLocked ? (
        <div className="bg-white p-4 rounded-2xl shadow-md border border-slate-200 relative overflow-hidden">
            {/* ALERT OVERLAY FOR BLOCKED TAB */}
            {isTabBlocked && (
                <div className="absolute top-0 left-0 right-0 z-20 bg-red-50/90 backdrop-blur-sm flex items-center justify-center h-full border-b-4 border-red-500">
                    <div className="text-center">
                        <Ban size={32} className="mx-auto text-red-500 mb-2"/>
                        <p className="font-black text-red-700 text-lg">{blockMessage}</p>
                        <p className="text-sm text-red-600 font-bold">Seleccione otra pestaña para continuar.</p>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                {/* Type Tabs - Always visible to allow switching */}
                {mode !== WeighingType.SOLO_POLLO && (
                    <div className="flex flex-col sm:flex-row bg-slate-100 p-1.5 rounded-xl gap-2 w-full lg:w-auto relative z-30">
                        <button onClick={() => setActiveTab('FULL')} className={`px-2 py-3 md:px-4 rounded-lg font-bold text-xs md:text-sm transition-all flex-1 flex items-center justify-center gap-2 ${activeTab === 'FULL' ? 'bg-blue-800 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>
                            <Package size={16}/> LLENAS
                        </button>
                        <button onClick={() => setActiveTab('EMPTY')} className={`px-2 py-3 md:px-4 rounded-lg font-bold text-xs md:text-sm transition-all flex-1 flex items-center justify-center gap-2 ${activeTab === 'EMPTY' ? 'bg-orange-700 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>
                            <PackageOpen size={16}/> VACÍAS
                        </button>
                        <button onClick={() => setActiveTab('MORTALITY')} className={`px-2 py-3 md:px-4 rounded-lg font-bold text-xs md:text-sm transition-all flex-1 flex items-center justify-center gap-2 ${activeTab === 'MORTALITY' ? 'bg-red-700 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>
                            <AlertOctagon size={16}/> MERMA
                        </button>
                    </div>
                )}

                {/* Inputs */}
                <div className="flex gap-2 md:gap-3 flex-1 items-stretch">
                    <div className="w-20 md:w-24 bg-slate-50 rounded-xl border-2 border-slate-200 p-1 flex flex-col justify-center">
                        <label className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Cant.</label>
                        <input 
                            type="number"
                            value={qtyInput}
                            onChange={e => setQtyInput(e.target.value)}
                            disabled={isTabBlocked}
                            className="w-full bg-transparent text-slate-900 text-2xl md:text-3xl font-black text-center outline-none disabled:text-gray-300"
                        />
                    </div>
                    {mode === WeighingType.SOLO_JABAS && (
                        <div className="w-20 md:w-24 bg-slate-50 rounded-xl border-2 border-slate-200 p-1 flex flex-col justify-center">
                            <label className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Pollos/J</label>
                            <input 
                                type="number"
                                value={chickensPerCrate}
                                onChange={e => setChickensPerCrate(Number(e.target.value))}
                                disabled={isTabBlocked}
                                className="w-full bg-transparent text-slate-900 text-2xl md:text-3xl font-black text-center outline-none disabled:text-gray-300"
                            />
                        </div>
                    )}
                    <div className="flex-1 relative bg-slate-50 rounded-xl border-2 border-slate-200 p-1 flex flex-col justify-center group focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                        <label className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">Peso (KG)</label>
                        <input 
                            ref={weightInputRef}
                            type="number"
                            value={weightInput}
                            onChange={e => setWeightInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !isTabBlocked && addWeight()}
                            disabled={isTabBlocked}
                            className="w-full bg-transparent text-slate-900 text-3xl md:text-4xl font-black text-center outline-none disabled:text-gray-300"
                            placeholder="0.00"
                        />
                        <button onClick={connectScale} disabled={isTabBlocked} className={`absolute right-1 md:right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full ${config.scaleConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-400'}`}>
                            <Bluetooth size={16} className="md:w-5 md:h-5"/>
                        </button>
                    </div>
                    <button onClick={addWeight} disabled={isTabBlocked} className={`w-16 md:w-20 rounded-xl shadow-lg flex items-center justify-center transition-all active:scale-95 ${isTabBlocked ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-900 text-white hover:bg-blue-800 shadow-blue-200'}`}>
                        <Save size={24} className="md:w-8 md:h-8" />
                    </button>
                </div>
            </div>
        </div>
      ) : (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center">
              <Lock size={48} className="mx-auto text-slate-300 mb-2"/>
              <h3 className="text-xl font-bold text-slate-700">Pesaje Cerrado</h3>
              <p className="text-slate-500">Este cliente ha sido cerrado. Solo lectura.</p>
          </div>
      )}

      {/* 3. Three Columns Layout - INCREASED DELETE BUTTON VISIBILITY & SIZE */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0 pb-2">
          {mode === WeighingType.SOLO_POLLO ? (
              <div className="md:col-span-3 h-full">
                  <div className="bg-white rounded-xl shadow border border-slate-200 flex flex-col h-full overflow-hidden">
                     <div className="p-3 bg-amber-500 text-white font-black text-center text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                        <Bird size={16}/> PESAJE DE POLLOS
                     </div>
                     <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
                        {activeOrder.records.filter(r => r.type === 'FULL').map(r => (
                           <div key={r.id} className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-amber-300 transition-colors group">
                               <span className="font-mono font-bold text-slate-900 text-xl">{r.weight.toFixed(2)}</span>
                               <span className="text-slate-400 font-bold bg-slate-100 px-2 py-1 rounded text-xs">x{r.quantity}</span>
                               {!isLocked && (
                                   <button onClick={() => deleteRecord(r.id)} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white p-2.5 rounded-lg transition-all shadow-sm flex items-center justify-center ml-4">
                                       <Trash2 size={22} />
                                   </button>
                               )}
                           </div>
                        ))}
                     </div>
                  </div>
              </div>
          ) : (
              <>
                 <div className="bg-white rounded-xl shadow border border-slate-200 flex flex-col h-full overflow-hidden">
                     <div className="p-3 bg-blue-800 text-white font-black text-center text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                         <Package size={16}/> JABAS LLENAS
                     </div>
                     <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-50">
                        {activeOrder.records.filter(r => r.type === 'FULL').map(r => (
                           <div key={r.id} className="flex justify-between items-center p-2 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-blue-300 transition-colors group">
                               <div className="flex items-baseline gap-2">
                                   <span className="font-mono font-bold text-slate-900 text-lg">{r.weight.toFixed(2)}</span>
                                   <span className="text-slate-400 font-bold text-xs bg-slate-100 px-2 py-0.5 rounded">x{r.quantity}</span>
                               </div>
                               {!isLocked && (
                                   <button onClick={() => deleteRecord(r.id)} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white p-2 rounded-lg transition-all shadow-sm flex items-center justify-center">
                                       <Trash2 size={18} />
                                   </button>
                               )}
                           </div>
                        ))}
                     </div>
                  </div>
                  <div className="bg-white rounded-xl shadow border border-slate-200 flex flex-col h-full overflow-hidden">
                     <div className="p-3 bg-orange-700 text-white font-black text-center text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                         <PackageOpen size={16}/> JABAS VACÍAS
                     </div>
                     <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-50">
                        {activeOrder.records.filter(r => r.type === 'EMPTY').map(r => (
                           <div key={r.id} className="flex justify-between items-center p-2 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-orange-300 transition-colors group">
                               <div className="flex items-baseline gap-2">
                                   <span className="font-mono font-bold text-slate-900 text-lg">{r.weight.toFixed(2)}</span>
                                   <span className="text-slate-400 font-bold text-xs bg-slate-100 px-2 py-0.5 rounded">x{r.quantity}</span>
                               </div>
                               {!isLocked && (
                                   <button onClick={() => deleteRecord(r.id)} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white p-2 rounded-lg transition-all shadow-sm flex items-center justify-center">
                                       <Trash2 size={18} />
                                   </button>
                               )}
                           </div>
                        ))}
                     </div>
                  </div>
                  <div className="bg-white rounded-xl shadow border border-slate-200 flex flex-col h-full overflow-hidden">
                     <div className="p-3 bg-red-700 text-white font-black text-center text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                         <AlertOctagon size={16}/> MERMA
                     </div>
                     <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-50">
                        {activeOrder.records.filter(r => r.type === 'MORTALITY').map(r => (
                           <div key={r.id} className="flex justify-between items-center p-2 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-red-300 transition-colors group">
                               <div className="flex items-baseline gap-2">
                                   <span className="font-mono font-bold text-slate-900 text-lg">{r.weight.toFixed(2)}</span>
                                   <span className="text-slate-400 font-bold text-xs bg-slate-100 px-2 py-0.5 rounded">x{r.quantity}</span>
                               </div>
                               {!isLocked && (
                                   <button onClick={() => deleteRecord(r.id)} className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white p-2 rounded-lg transition-all shadow-sm flex items-center justify-center">
                                       <Trash2 size={18} />
                                   </button>
                               )}
                           </div>
                        ))}
                     </div>
                  </div>
              </>
          )}
      </div>
      
      {showDetailModal && <ConsolidatedDetail />}

      {/* Payment Modal - IMPROVED LAYOUT */}
      {showPaymentModal && (
          <div className="fixed inset-0 bg-blue-950 bg-opacity-90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-6 border border-slate-200 flex flex-col h-[80vh]">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-black text-slate-900 flex items-center"><DollarSign className="mr-2 text-emerald-600"/> CERRAR CUENTA</h3>
                    <button onClick={() => setShowPaymentModal(false)} className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full"><X size={20}/></button>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
                    {/* LEFT: LARGE TICKET PREVIEW */}
                    <div className="hidden md:flex flex-1 bg-yellow-50 border-2 border-dashed border-yellow-200 p-6 rounded-xl overflow-y-auto font-mono text-slate-700 shadow-inner h-full flex-col">
                         <div className="flex-1">
                            <div className="text-center font-bold text-lg mb-4">{config.companyName || 'AVICOLA'}</div>
                            <div className="flex justify-between mb-2 text-sm"><span>Fecha:</span> <span>{new Date().toLocaleDateString()}</span></div>
                            <div className="flex justify-between mb-2 text-lg"><span>Cliente:</span> <span className="font-bold">{activeOrder.clientName}</span></div>
                            <div className="border-b-2 border-yellow-200 my-4"></div>
                            
                            <div className="space-y-2 text-base">
                                <div className="flex justify-between"><span>Peso Bruto:</span> <span>{totals.totalFullWeight.toFixed(2)} kg</span></div>
                                <div className="flex justify-between"><span>Peso Tara:</span> <span>{totals.totalEmptyWeight.toFixed(2)} kg</span></div>
                                <div className="flex justify-between text-red-500"><span>Merma:</span> <span>{totals.totalMortWeight.toFixed(2)} kg</span></div>
                                <div className="border-b border-yellow-200 my-2"></div>
                                <div className="flex justify-between font-bold text-lg"><span>Peso Neto:</span> <span>{totals.netWeight.toFixed(2)} kg</span></div>
                            </div>
                            
                            <div className="mt-6 space-y-2">
                                <div className="flex justify-between items-center">
                                    <span>Precio Unitario:</span> 
                                    <span className="font-bold">S/. {(pricePerKg || 0).toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="border-t-4 border-double border-yellow-300 pt-4 mt-4">
                            <div className="flex justify-between font-black text-3xl text-slate-900">
                                <span>TOTAL:</span> 
                                <span>S/. {(( (mode===WeighingType.SOLO_POLLO ? totals.totalFullWeight : totals.netWeight) * (pricePerKg || 0) )).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: CONTROLS */}
                    <div className="w-full md:w-1/3 space-y-4 flex flex-col justify-center">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Precio por KG (S/.)</label>
                            <input 
                                type="number" 
                                value={pricePerKg === 0 ? '' : pricePerKg} 
                                onFocus={(e) => e.target.select()}
                                onChange={e => setPricePerKg(Number(e.target.value))}
                                className={`w-full text-3xl font-black p-4 border-4 border-slate-100 rounded-2xl text-center focus:border-blue-600 outline-none text-slate-900`}
                                disabled={activeOrder?.paymentStatus === 'PAID'}
                                placeholder="0.00"
                                autoFocus
                            />
                        </div>

                        {activeOrder?.paymentStatus !== 'PAID' ? (
                            <div className="space-y-4 pt-4">
                                <div className="flex gap-3">
                                    <button onClick={() => setPayType('CASH')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${payType === 'CASH' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 text-slate-400 hover:border-slate-300'}`}>CONTADO</button>
                                    <button onClick={() => setPayType('CREDIT')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${payType === 'CREDIT' ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : 'border-slate-100 text-slate-400 hover:border-slate-300'}`}>CRÉDITO</button>
                                </div>
                                <button onClick={handlePayment} className="w-full bg-blue-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-800 shadow-lg transition-all hover:-translate-y-1 flex items-center justify-center">
                                    CONFIRMAR Y CERRAR <CheckCircle className="ml-2"/>
                                </button>
                            </div>
                        ) : (
                            <div className="text-center text-emerald-600 font-black text-2xl py-6 border-4 border-double border-emerald-500 rounded-xl bg-emerald-50">
                                YA PAGADO
                            </div>
                        )}
                        
                        <div className="pt-4 text-center">
                             <p className="text-xs text-slate-400">El ticket se imprimirá automáticamente al confirmar.</p>
                        </div>
                    </div>
                </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default WeighingStation;