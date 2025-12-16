import React, { useEffect, useState, useContext } from 'react';
import { getBatches, getOrders, getConfig } from '../../services/storage';
import { Batch, ClientOrder, WeighingType, UserRole } from '../../types';
import { ChevronDown, ChevronUp, Package, ShoppingCart, List, Printer, AlertOctagon } from 'lucide-react';
import { AuthContext } from '../../App';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Reports: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [showDetailOrder, setShowDetailOrder] = useState<string | null>(null);
  const { user } = useContext(AuthContext);
  const config = getConfig();

  useEffect(() => {
    refresh();
  }, [user]);

  const refresh = () => {
      const allBatches = getBatches();
      const allOrders = getOrders();
      if (user?.role === UserRole.ADMIN) {
          setBatches(allBatches);
          setOrders(allOrders);
      } else {
          setBatches(allBatches.filter(b => !b.createdBy || b.createdBy === user?.id));
          setOrders(allOrders.filter(o => !o.createdBy || o.createdBy === user?.id));
      }
  }

  const getStats = (filterFn: (o: ClientOrder) => boolean) => {
    const filteredOrders = orders.filter(filterFn);
    let totalFull = 0, totalEmpty = 0, totalNet = 0, totalMort = 0;
    
    filteredOrders.forEach(o => {
      const wFull = o.records.filter(r => r.type === 'FULL').reduce((a, b) => a + b.weight, 0);
      const wEmpty = o.records.filter(r => r.type === 'EMPTY').reduce((a, b) => a + b.weight, 0);
      const wMort = o.records.filter(r => r.type === 'MORTALITY').reduce((a, b) => a + b.weight, 0);
      totalFull += wFull;
      totalEmpty += wEmpty;
      totalMort += wMort;
      
      let net = wFull - wEmpty - wMort;
      if (o.weighingMode === WeighingType.SOLO_POLLO) net = wFull;

      totalNet += net;
    });

    return { totalFull, totalEmpty, totalMort, totalNet, orderCount: filteredOrders.length, batchOrders: filteredOrders };
  };

  const printBatchReport = (batchName: string, stats: any) => {
      const doc = new jsPDF();
      const company = config.companyName || 'SISTEMA BARSA';
      const logo = config.logoUrl;
      const primaryColor = [23, 37, 84]; // Navy Blue
      const accentColor = [22, 163, 74]; // Green

      // 1. Header
      if (logo) {
        try { doc.addImage(logo, 'PNG', 14, 10, 20, 20); } catch {}
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(company.toUpperCase(), 105, 18, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text("REPORTE INTEGRAL DE LOTE", 105, 24, { align: 'center' });
      doc.text(`Lote: ${batchName} | Fecha: ${new Date().toLocaleDateString()}`, 105, 29, { align: 'center' });

      // --- SECTION 1: GENERAL WEIGHT SUMMARY (CUADRO PRINCIPAL) ---
      autoTable(doc, {
        startY: 35,
        theme: 'grid',
        headStyles: { fillColor: primaryColor, textColor: 255, fontStyle: 'bold', halign: 'center', fontSize: 11 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 }, 1: { halign: 'right', fontSize: 11 } },
        head: [['BALANCE DE MASA - TOTAL LOTE', 'PESO (kg)']],
        body: [
            ['PESO BRUTO TOTAL (Llenas)', stats.totalFull.toFixed(2)],
            ['PESO TARA TOTAL (Vacías)', stats.totalEmpty.toFixed(2)],
            ['MERMA TOTAL', stats.totalMort.toFixed(2)],
            [{ content: 'PESO NETO TOTAL', styles: { fillColor: [240, 253, 244], textColor: accentColor } }, { content: stats.totalNet.toFixed(2), styles: { fillColor: [240, 253, 244], textColor: accentColor, fontStyle: 'bold' } }]
        ]
      });

      // --- SECTION 2: PHYSICAL DETAILS PER CLIENT ---
      doc.setFontSize(11);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("1. DETALLE DE PRODUCCIÓN (PESOS)", 14, (doc as any).lastAutoTable.finalY + 10);

      const physicalData = stats.batchOrders.map((o: ClientOrder, index: number) => {
          const wFull = o.records.filter(r => r.type === 'FULL').reduce((a, b) => a + b.weight, 0);
          const wEmpty = o.records.filter(r => r.type === 'EMPTY').reduce((a, b) => a + b.weight, 0);
          const wMort = o.records.filter(r => r.type === 'MORTALITY').reduce((a, b) => a + b.weight, 0);
          let net = wFull - wEmpty - wMort;
          if (o.weighingMode === WeighingType.SOLO_POLLO) net = wFull;

          return [
              index + 1, 
              o.clientName, 
              wFull.toFixed(2), 
              wEmpty.toFixed(2), 
              wMort.toFixed(2),
              net.toFixed(2)
          ];
      });

      autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 12,
          head: [['#', 'Cliente', 'Bruto', 'Tara', 'Merma', 'Neto']],
          body: physicalData,
          theme: 'striped',
          headStyles: { fillColor: [71, 85, 105], halign: 'center' }, // Slate Header
          columnStyles: {
              0: { halign: 'center', cellWidth: 10 },
              2: { halign: 'right' },
              3: { halign: 'right' },
              4: { halign: 'right' },
              5: { halign: 'right', fontStyle: 'bold' }
          }
      });

      // --- SECTION 3: FINANCIAL DETAILS PER CLIENT ---
      // Check for page break
      if ((doc as any).lastAutoTable.finalY > 200) doc.addPage();
      
      const startYFin = (doc as any).lastAutoTable.finalY > 200 ? 20 : (doc as any).lastAutoTable.finalY + 10;

      doc.setFontSize(11);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text("2. RESUMEN FINANCIERO DE CUENTAS", 14, startYFin);

      let totalBatchSale = 0;
      let totalBatchPaid = 0;

      const financialData = stats.batchOrders.map((o: ClientOrder, index: number) => {
          const wFull = o.records.filter(r => r.type === 'FULL').reduce((a, b) => a + b.weight, 0);
          const wEmpty = o.records.filter(r => r.type === 'EMPTY').reduce((a, b) => a + b.weight, 0);
          const wMort = o.records.filter(r => r.type === 'MORTALITY').reduce((a, b) => a + b.weight, 0);
          let net = wFull - wEmpty - wMort;
          if (o.weighingMode === WeighingType.SOLO_POLLO) net = wFull;

          const saleAmount = net * o.pricePerKg;
          const paidAmount = o.payments.reduce((a,b)=>a+b.amount, 0);
          const debt = saleAmount - paidAmount;
          
          totalBatchSale += saleAmount;
          totalBatchPaid += paidAmount;

          return [
              index + 1,
              o.clientName,
              `S/. ${o.pricePerKg.toFixed(2)}`,
              `S/. ${saleAmount.toFixed(2)}`,
              `S/. ${paidAmount.toFixed(2)}`,
              debt > 0.1 ? `S/. ${debt.toFixed(2)}` : '-'
          ];
      });

      autoTable(doc, {
          startY: startYFin + 5,
          head: [['#', 'Cliente', 'Precio/Kg', 'Venta Total', 'Abonado', 'Por Cobrar']],
          body: financialData,
          theme: 'striped',
          headStyles: { fillColor: [30, 58, 138], halign: 'center' }, // Dark Blue
          columnStyles: {
              0: { halign: 'center', cellWidth: 10 },
              2: { halign: 'right' },
              3: { halign: 'right', fontStyle: 'bold' },
              4: { halign: 'right', textColor: [22, 163, 74] },
              5: { halign: 'right', textColor: [220, 38, 38], fontStyle: 'bold' }
          }
      });

      const totalBatchDebt = totalBatchSale - totalBatchPaid;

      // --- SECTION 4: GRAND TOTALS ---
      // Check for page break
      if ((doc as any).lastAutoTable.finalY > 230) doc.addPage();
      const startYTotal = (doc as any).lastAutoTable.finalY > 230 ? 20 : (doc as any).lastAutoTable.finalY + 10;

      doc.text("RESUMEN DE LIQUIDACIÓN", 14, startYTotal);

      autoTable(doc, {
          startY: startYTotal + 5,
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center' },
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { halign: 'right', fontStyle: 'bold', fontSize: 11 } },
          head: [['CONCEPTO', 'MONTO (S/.)']],
          body: [
              ['VALORIZACIÓN TOTAL DEL LOTE', `S/. ${totalBatchSale.toFixed(2)}`],
              ['DINERO RECAUDADO (CAJA)', `S/. ${totalBatchPaid.toFixed(2)}`],
              [{ content: 'CARTERA POR COBRAR (CREDITOS)', styles: { textColor: [220, 38, 38], fillColor: [254, 242, 242] } }, { content: `S/. ${totalBatchDebt.toFixed(2)}`, styles: { textColor: [220, 38, 38], fontSize: 13, fillColor: [254, 242, 242] } }]
          ],
          tableWidth: 150
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for(let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(`Sistema de Gestión Barsa - ${new Date().toLocaleString()}`, 10, 285);
          doc.text(`Página ${i} de ${pageCount}`, 190, 285, { align: 'right' });
      }

      doc.save(`Reporte_Lote_${batchName}.pdf`);
  };

  // Modified Chart: Only Mortality
  const MortalityChart = ({ orders }: { orders: ClientOrder[] }) => {
      // Flatten all records but filter ONLY for MORTALITY
      const data = orders.flatMap(o => o.records
          .filter(r => r.type === 'MORTALITY')
          .map(r => ({ ...r, client: o.clientName }))
      ).sort((a,b) => a.timestamp - b.timestamp);

      if (data.length < 2) return (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-center text-red-400 text-xs font-bold">
              Insuficientes datos de merma para graficar.
          </div>
      );

      const points = data.map((d, i) => {
          return { x: i, y: d.weight };
      });
      const max = Math.max(...points.map(p => p.y), 1);
      const h = 60; const w = 300;
      const polyline = points.map((p, i) => {
          const x = (i / (points.length - 1)) * w;
          const y = h - (p.y / max) * h;
          return `${x},${y}`;
      }).join(' ');

      return (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                 <AlertOctagon size={16} className="text-red-500"/>
                 <h4 className="text-xs font-bold text-red-700 uppercase">Gráfico de Mermas (Kg)</h4>
              </div>
              <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20 overflow-visible">
                   <polyline fill="none" stroke="#dc2626" strokeWidth="2" points={polyline} />
                   {points.map((p, i) => (
                       <circle key={i} cx={(i / (points.length - 1)) * w} cy={h - (p.y / max) * h} r="2" fill="#991b1b" />
                   ))}
              </svg>
          </div>
      );
  };

  const ReportCard = ({ id, title, subtitle, icon, stats }: any) => {
      const isExpanded = expandedBatch === id;
      return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-4">
            <div 
            className="p-4 md:p-6 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
            onClick={() => setExpandedBatch(isExpanded ? null : id)}
            >
            <div className="flex items-center space-x-3 md:space-x-5">
                <div className={`p-2 md:p-4 rounded-xl ${id === 'direct-sales' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-800'}`}>
                   {icon}
                </div>
                <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-900">{title}</h3>
                    <p className="text-xs md:text-sm text-slate-500 font-medium">{subtitle} • {stats.orderCount} Clientes</p>
                </div>
            </div>
            
            <div className="flex items-center space-x-10">
                <div className="text-right hidden md:block">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Peso Total</p>
                    <p className="text-2xl font-black text-slate-800">{stats.totalNet.toFixed(2)} kg</p>
                </div>
                {isExpanded ? <ChevronUp className="text-slate-400" /> : <ChevronDown className="text-slate-400" />}
            </div>
            </div>

            {isExpanded && (
            <div className="bg-slate-50 border-t border-slate-200 p-4 md:p-6 animate-fade-in">
                
                <div className="flex justify-end mb-4">
                    <button onClick={() => printBatchReport(title, stats)} className="flex items-center text-sm font-bold text-blue-800 bg-white border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-50">
                        <Printer size={16} className="mr-2"/> Imprimir Reporte Lote
                    </button>
                </div>

                <MortalityChart orders={stats.batchOrders} />

                {/* Batch Summary - Grid Responsive */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 text-center">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                        <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-wider">Bruto</p>
                        <p className="font-black text-lg md:text-xl text-blue-900">{stats.totalFull.toFixed(2)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                        <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-wider">Tara</p>
                        <p className="font-black text-lg md:text-xl text-orange-600">{stats.totalEmpty.toFixed(2)}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                        <p className="text-[10px] md:text-xs text-slate-400 uppercase font-bold tracking-wider">Merma</p>
                        <p className="font-black text-lg md:text-xl text-red-600">{stats.totalMort.toFixed(2)}</p>
                    </div>
                    <div className="bg-blue-950 p-4 rounded-xl shadow-sm border border-blue-900">
                        <p className="text-[10px] md:text-xs text-blue-300 uppercase font-bold tracking-wider">Neto</p>
                        <p className="font-black text-lg md:text-xl text-white">{stats.totalNet.toFixed(2)}</p>
                    </div>
                </div>

                {/* Clients Detail List - Expanded Breakdown */}
                <h4 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-widest border-b border-slate-200 pb-2">Desglose por Cliente</h4>
                <div className="space-y-3">
                    {stats.batchOrders.map((order: ClientOrder) => {
                        // Calculations for Weight
                        const wFull = order.records.filter(r => r.type === 'FULL').reduce((a, b) => a + b.weight, 0);
                        const wEmpty = order.records.filter(r => r.type === 'EMPTY').reduce((a, b) => a + b.weight, 0);
                        const wMort = order.records.filter(r => r.type === 'MORTALITY').reduce((a, b) => a + b.weight, 0);
                        
                        // Calculations for Count/Quantity
                        const qFull = order.records.filter(r => r.type === 'FULL').reduce((a, b) => a + b.quantity, 0);
                        const qEmpty = order.records.filter(r => r.type === 'EMPTY').reduce((a, b) => a + b.quantity, 0);
                        const qMort = order.records.filter(r => r.type === 'MORTALITY').reduce((a, b) => a + b.quantity, 0);

                        let net = wFull - wEmpty - wMort;
                        if (order.weighingMode === WeighingType.SOLO_POLLO) net = wFull;

                        const isDetailOpen = showDetailOrder === order.id;

                        const renderMiniBox = (title: string, weight: number, count: number, bgClass: string, textClass: string) => (
                             <div className={`p-2 rounded text-center border ${bgClass} border-opacity-50`}>
                                 <p className="text-[9px] md:text-[10px] uppercase font-bold opacity-60">{title}</p>
                                 <p className={`font-bold text-sm md:text-base ${textClass}`}>{weight.toFixed(2)} <span className="text-[9px] opacity-70">({count})</span></p>
                             </div>
                        );

                        return (
                            <div key={order.id} className="bg-white rounded-xl border border-slate-200 hover:border-blue-300 transition-colors overflow-hidden">
                                <div className="p-4 flex flex-col md:flex-row justify-between items-center bg-white gap-4">
                                    <div className="w-full md:w-auto">
                                        <p className="font-bold text-slate-900 text-lg">{order.clientName}</p>
                                        <div className="flex space-x-2 mt-1">
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${order.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {order.paymentStatus === 'PAID' ? 'PAGADO' : 'PENDIENTE'}
                                            </span>
                                            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold uppercase">
                                                {order.weighingMode === WeighingType.SOLO_POLLO ? 'SOLO POLLO' : 'LOTE/JABAS'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-6">
                                        <div className="grid grid-cols-4 gap-2 md:gap-4 text-right flex-1 md:flex-none">
                                            <div>
                                                <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase">Bruto</p>
                                                <p className="font-bold text-slate-700 text-sm">{wFull.toFixed(2)}</p>
                                                <p className="text-[8px] md:text-[9px] text-slate-500 font-bold hidden md:block">{qFull} und</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase">Tara</p>
                                                <p className="font-bold text-slate-700 text-sm">{wEmpty.toFixed(2)}</p>
                                                <p className="text-[8px] md:text-[9px] text-slate-500 font-bold hidden md:block">{qEmpty} und</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase">Merma</p>
                                                <p className="font-bold text-red-500 text-sm">{wMort.toFixed(2)}</p>
                                                <p className="text-[8px] md:text-[9px] text-red-400 font-bold hidden md:block">{qMort} und</p>
                                            </div>
                                            <div className="pl-4 border-l border-slate-100 flex flex-col justify-center">
                                                <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase">Total</p>
                                                <p className="font-black text-slate-900 text-base">{net.toFixed(2)}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setShowDetailOrder(isDetailOpen ? null : order.id)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-600">
                                            <List size={16} />
                                        </button>
                                    </div>
                                </div>
                                
                                {isDetailOpen && (
                                    <div className="bg-slate-50 p-4 border-t border-slate-100">
                                        <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4">
                                            {renderMiniBox("Llenas", wFull, qFull, 'bg-blue-50', 'text-blue-900')}
                                            {renderMiniBox("Vacías", wEmpty, qEmpty, 'bg-orange-50', 'text-orange-800')}
                                            {renderMiniBox("Merma", wMort, qMort, 'bg-red-50', 'text-red-800')}
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {['FULL', 'EMPTY', 'MORTALITY'].map(type => {
                                                const records = order.records.filter(r => r.type === type).sort((a,b) => b.timestamp - a.timestamp);
                                                if(records.length === 0) return <div key={type} className="border border-slate-200 rounded bg-white h-16 md:h-24 flex items-center justify-center text-xs text-slate-300 uppercase">Sin Datos</div>;
                                                return (
                                                    <div key={type} className="border border-slate-200 rounded bg-white overflow-hidden">
                                                        <div className="bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 uppercase border-b border-slate-200">
                                                            {type === 'FULL' ? 'Detalle Llenas' : type === 'EMPTY' ? 'Detalle Vacías' : 'Detalle Merma'}
                                                        </div>
                                                        <div className="max-h-32 overflow-y-auto">
                                                            <table className="w-full text-xs">
                                                                <tbody className="divide-y divide-slate-50">
                                                                    {records.map(r => (
                                                                        <tr key={r.id}>
                                                                            <td className="p-1.5 text-slate-500">{new Date(r.timestamp).toLocaleTimeString()}</td>
                                                                            <td className="p-1.5 text-right font-bold">{r.weight.toFixed(2)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            )}
        </div>
      );
  }

  const directSalesStats = getStats(o => !o.batchId);

  return (
    <div className="space-y-8">
      <div>
          <h2 className="text-3xl font-black text-blue-950">Reporte Corporativo</h2>
          <p className="text-slate-500 font-medium">Resumen de producción y ventas</p>
      </div>
      
      <div>
        {/* Direct Sales Card */}
        {directSalesStats.orderCount > 0 && (
            <ReportCard 
                id="direct-sales" 
                title="Ventas Directas" 
                subtitle="Sin Asignación de Lote" 
                icon={<ShoppingCart size={28}/>}
                stats={directSalesStats}
            />
        )}

        {/* Batch Cards */}
        {batches.map(batch => {
          const stats = getStats(o => o.batchId === batch.id);
          return (
             <ReportCard 
                key={batch.id} 
                id={batch.id} 
                title={batch.name} 
                subtitle={`Creado: ${new Date(batch.createdAt).toLocaleDateString()}`}
                icon={<Package size={28}/>}
                stats={stats}
             />
          );
        })}
      </div>
    </div>
  );
};

export default Reports;