import React, { useState, useEffect, useContext } from 'react';
import { getOrders, saveOrder, getConfig } from '../../services/storage';
import { ClientOrder, WeighingType, UserRole } from '../../types';
import { Search, Clock, History, Printer, Filter, CheckCircle, FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthContext } from '../../App';

const Collections: React.FC = () => {
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<ClientOrder | null>(null);
  const [viewHistoryOrder, setViewHistoryOrder] = useState<ClientOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'BATCH' | 'SOLO_POLLO' | 'SOLO_JABAS'>('ALL');
  const { user } = useContext(AuthContext);
  
  const config = getConfig();

  useEffect(() => {
    refresh();
  }, [user]);

  const refresh = () => {
      const all = getOrders();
      if (user?.role === UserRole.ADMIN) {
          setOrders(all);
      } else {
          setOrders(all.filter(o => !o.createdBy || o.createdBy === user?.id));
      }
  }

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.clientName.toLowerCase().includes(searchTerm.toLowerCase());
    let matchesFilter = true;
    
    if (filterMode === 'BATCH') matchesFilter = !!o.batchId;
    if (filterMode === 'SOLO_POLLO') matchesFilter = o.weighingMode === WeighingType.SOLO_POLLO;
    if (filterMode === 'SOLO_JABAS') matchesFilter = o.weighingMode === WeighingType.SOLO_JABAS;

    return matchesSearch && matchesFilter;
  });

  const calculateBalance = (order: ClientOrder) => {
    const full = order.records.filter(r => r.type === 'FULL').reduce((a,b)=>a+b.weight,0);
    const empty = order.records.filter(r => r.type === 'EMPTY').reduce((a,b)=>a+b.weight,0);
    const mort = order.records.filter(r => r.type === 'MORTALITY').reduce((a,b)=>a+b.weight,0);
    
    let net = full - empty - mort;
    if (order.weighingMode === WeighingType.SOLO_POLLO) net = full; 

    const totalDue = net * order.pricePerKg;
    const totalPaid = order.payments.reduce((a,b) => a + b.amount, 0);
    
    return { totalDue, totalPaid, balance: totalDue - totalPaid };
  };

  const handlePay = () => {
    if (!selectedOrder) return;
    const amount = parseFloat(payAmount);
    if (!amount) return;

    const updatedOrder = { ...selectedOrder };
    updatedOrder.payments.push({
        id: Date.now().toString(),
        amount: amount,
        timestamp: Date.now(),
        note: 'Abono Manual'
    });
    
    // Calculate new balance based on the updated order
    const bal = calculateBalance(updatedOrder);
    
    // If the remaining balance is effectively zero, mark as PAID
    if (bal.balance <= 0.1) {
        updatedOrder.paymentStatus = 'PAID';
    }

    saveOrder(updatedOrder);
    refresh(); 
    setSelectedOrder(null);
    setPayAmount('');
    
    // Generate receipt for this specific payment (original balance before this pay - amount)
    generateReceipt(updatedOrder, amount, bal.balance);
  };

  const generateReceipt = (order: ClientOrder, amountPaid: number, remaining: number) => {
    const doc = new jsPDF({
        unit: 'mm',
        format: [80, 150] 
    });

    const pageWidth = 80;
    const centerX = pageWidth / 2;
    let y = 10;

    // Header
    if (config.logoUrl) {
        try { doc.addImage(config.logoUrl, 'PNG', centerX - 10, y, 20, 20); y+= 22; } catch {}
    } else {
        y += 5;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(config.companyName.toUpperCase() || "AVICOLA", centerX, y, { align: 'center' });
    y += 5;
    doc.setFontSize(10);
    doc.text("RECIBO DE ABONO", centerX, y, { align: 'center' });
    y += 5;
    
    doc.setLineWidth(0.1);
    doc.line(5, y, 75, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`FECHA: ${new Date().toLocaleString()}`, 5, y);
    y += 4;
    doc.text(`CLIENTE: ${order.clientName}`, 5, y);
    y += 4;
    doc.text(`ID REF: #${order.id.slice(-6)}`, 5, y);
    y += 5;
    doc.line(5, y, 75, y);
    y += 6;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("MONTO ABONADO:", 5, y);
    doc.text(`S/. ${amountPaid.toFixed(2)}`, 75, y, { align: 'right' });
    y += 8;

    doc.setFontSize(10);
    doc.text("SALDO RESTANTE:", 5, y);
    doc.text(`S/. ${Math.max(0, remaining).toFixed(2)}`, 75, y, { align: 'right' });
    y += 8;

    if (remaining <= 0.1) {
        doc.setFontSize(14);
        doc.setTextColor(100);
        doc.text("[ CUENTA SALDADA ]", centerX, y + 5, { align: 'center' });
        y += 15;
    } else {
        y += 5;
    }
    
    doc.setTextColor(0);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.text("Gracias por su pago.", centerX, y, { align: 'center' });
    
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  const generateAccountStatement = (order: ClientOrder) => {
    const { totalDue, totalPaid, balance } = calculateBalance(order);
    const doc = new jsPDF();
    const company = config.companyName || 'SISTEMA BARSA';
    const primaryColor = [23, 37, 84]; // Navy Blue

    // Header Background
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, 0, 210, 40, 'F');

    // Logo & Title
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("ESTADO DE CUENTA", 14, 25);
    doc.setFontSize(12);
    doc.text(company, 200, 25, { align: 'right' });

    // Client Info Card
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Cliente: ${order.clientName}`, 14, 50);
    doc.setFont("helvetica", "normal");
    doc.text(`ID Transacción: #${order.id.slice(-8)}`, 14, 56);
    doc.text(`Fecha Emisión: ${new Date().toLocaleDateString()}`, 14, 62);
    
    // Balance Big Number
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Saldo Pendiente:", 200, 50, { align: 'right' });
    doc.setFontSize(20);
    doc.setTextColor(220, 38, 38); // Red
    doc.setFont("helvetica", "bold");
    doc.text(`S/. ${balance.toFixed(2)}`, 200, 60, { align: 'right' });

    // 1. Transaction Summary
    autoTable(doc, {
        startY: 70,
        theme: 'grid',
        headStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: 'bold' },
        body: [
            ['Monto Total Venta (Deuda Inicial)', `S/. ${totalDue.toFixed(2)}`],
            ['Total Pagado a la Fecha', `S/. ${totalPaid.toFixed(2)}`],
        ],
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    doc.setFontSize(11);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text("Historial de Abonos", 14, (doc as any).lastAutoTable.finalY + 15);

    // 2. Payment History Table
    const paymentRows = order.payments.map((p, i) => [
        i + 1,
        new Date(p.timestamp).toLocaleDateString() + ' ' + new Date(p.timestamp).toLocaleTimeString(),
        p.note || '-',
        `S/. ${p.amount.toFixed(2)}`
    ]);

    if (paymentRows.length === 0) {
        paymentRows.push(['-', '-', 'Sin abonos registrados', 'S/. 0.00']);
    }

    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['#', 'Fecha', 'Concepto', 'Monto']],
        body: paymentRows,
        theme: 'striped',
        headStyles: { fillColor: primaryColor },
        columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
    });

    // Footer
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Este documento es un resumen de cuenta y no representa un comprobante fiscal.", 105, pageHeight - 10, { align: 'center' });

    doc.save(`EstadoCuenta_${order.clientName}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Cobranza Corporativa</h2>
            <p className="text-gray-500 text-sm">Gestión de cuentas por cobrar</p>
          </div>
          <div className="flex bg-white rounded-lg border border-gray-200 p-1">
              <button onClick={() => setFilterMode('ALL')} className={`px-3 py-1 text-xs font-bold rounded ${filterMode === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>TODOS</button>
              <button onClick={() => setFilterMode('BATCH')} className={`px-3 py-1 text-xs font-bold rounded ${filterMode === 'BATCH' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>LOTES</button>
              <button onClick={() => setFilterMode('SOLO_POLLO')} className={`px-3 py-1 text-xs font-bold rounded ${filterMode === 'SOLO_POLLO' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>POLLO</button>
              <button onClick={() => setFilterMode('SOLO_JABAS')} className={`px-3 py-1 text-xs font-bold rounded ${filterMode === 'SOLO_JABAS' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>JABAS</button>
          </div>
      </div>

      <div className="relative">
        <input 
          type="text" 
          placeholder="Buscar cliente..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl shadow-sm focus:border-blue-500 outline-none font-bold text-gray-900"
        />
        <Search className="absolute left-3 top-3.5 text-gray-400" size={20} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead className="bg-gray-100 text-gray-600 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="p-4">Cliente</th>
                <th className="p-4 text-center">Modo</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4 text-right">Pagado</th>
                <th className="p-4 text-right">Pendiente</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOrders.map(order => {
                const { totalDue, totalPaid, balance } = calculateBalance(order);
                const isPaid = balance <= 0.1 || order.paymentStatus === 'PAID';
                return (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="p-4 font-bold text-gray-900">{order.clientName}</td>
                    <td className="p-4 text-center">
                        <span className="text-[10px] font-bold text-gray-400 border border-gray-200 px-2 py-1 rounded">
                            {order.batchId ? 'LOTE' : order.weighingMode === WeighingType.SOLO_POLLO ? 'POLLO' : 'JABAS'}
                        </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {isPaid ? 'PAGADO' : 'PENDIENTE'}
                      </span>
                    </td>
                    <td className="p-4 text-right font-bold text-gray-900">S/. {totalDue.toFixed(2)}</td>
                    <td className="p-4 text-right text-emerald-600 font-bold">S/. {totalPaid.toFixed(2)}</td>
                    <td className="p-4 text-right font-black text-red-600">S/. {balance.toFixed(2)}</td>
                    <td className="p-4 text-center flex justify-center space-x-2">
                      <button 
                         onClick={() => generateAccountStatement(order)}
                         className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg border border-transparent hover:border-indigo-200 transition-all"
                         title="Estado de Cuenta (PDF)"
                      >
                          <FileText size={18} />
                      </button>
                      <button 
                         onClick={() => setViewHistoryOrder(order)}
                         className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 transition-all"
                         title="Historial de Pagos"
                      >
                          <History size={18} />
                      </button>
                      {!isPaid && (
                          <button 
                              onClick={() => { setSelectedOrder(order); setPayAmount(balance.toFixed(2)); }}
                              className="bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-800 flex items-center text-xs font-bold shadow-sm"
                          >
                              S/. ABONAR
                          </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {selectedOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
              <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl">
                  <h3 className="text-xl font-black mb-4 text-gray-900">Registrar Abono</h3>
                  <div className="mb-4 bg-red-50 p-4 rounded-xl text-center border border-red-100">
                      <p className="text-xs text-red-600 uppercase font-bold tracking-widest">Deuda Actual</p>
                      <p className="text-3xl font-black text-red-700">S/. {calculateBalance(selectedOrder).balance.toFixed(2)}</p>
                  </div>
                  
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Monto a Abonar</label>
                  <input 
                    type="number" 
                    className="w-full border-2 border-gray-300 rounded-xl p-3 text-2xl font-bold text-gray-900 text-center mb-6 focus:border-blue-500 outline-none"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                  />

                  <button 
                    onClick={handlePay}
                    className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 mb-3 shadow-lg"
                  >
                      CONFIRMAR ABONO
                  </button>
                  <button 
                    onClick={() => setSelectedOrder(null)} 
                    className="w-full text-slate-400 py-2 hover:text-slate-600 font-bold text-sm"
                  >
                      Cancelar
                  </button>
              </div>
          </div>
      )}

      {/* History Modal */}
      {viewHistoryOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
               <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
                   <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                       <div>
                           <h3 className="text-xl font-black text-gray-900">Historial de Pagos</h3>
                           <p className="text-sm text-gray-500 font-medium">{viewHistoryOrder.clientName}</p>
                       </div>
                       <button onClick={() => setViewHistoryOrder(null)} className="text-gray-400 hover:text-gray-600 font-bold">X</button>
                   </div>
                   
                   <div className="max-h-80 overflow-y-auto space-y-3 mb-6">
                       {viewHistoryOrder.payments.filter(p => p.amount > 0).length === 0 && <p className="text-center text-gray-400 py-6">Sin pagos registrados.</p>}
                       {viewHistoryOrder.payments.filter(p => p.amount > 0).map(p => (
                           <div key={p.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                               <div>
                                   <p className="font-black text-gray-900 text-lg">S/. {p.amount.toFixed(2)}</p>
                                   <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wide">{p.note}</p>
                               </div>
                               <div className="text-right flex items-center gap-3">
                                   <div>
                                       <div className="text-xs text-gray-500 font-bold">{new Date(p.timestamp).toLocaleDateString()}</div>
                                       <div className="text-xs text-gray-400">{new Date(p.timestamp).toLocaleTimeString()}</div>
                                   </div>
                                   <button 
                                      onClick={() => {
                                          const { balance } = calculateBalance(viewHistoryOrder);
                                          generateReceipt(viewHistoryOrder, p.amount, balance); 
                                      }}
                                      className="p-2 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900"
                                      title="Reimprimir Recibo"
                                   >
                                       <Printer size={16} />
                                   </button>
                               </div>
                           </div>
                       ))}
                   </div>
               </div>
          </div>
      )}
    </div>
  );
};

export default Collections;