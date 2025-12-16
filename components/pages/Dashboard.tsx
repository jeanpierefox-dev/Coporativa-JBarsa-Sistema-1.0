import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Calculator, Users, FileText, Settings, ArrowRight, Bird, Box } from 'lucide-react';
import { AuthContext } from '../../App';
import { UserRole, WeighingType } from '../../types';
import { getConfig } from '../../services/storage';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const config = getConfig();
  const [refreshKey, setRefreshKey] = useState(0);

  // Force re-render when data comes from cloud
  useEffect(() => {
    const handleDataUpdate = () => setRefreshKey(prev => prev + 1);
    window.addEventListener('avi_data_batches', handleDataUpdate);
    window.addEventListener('avi_data_orders', handleDataUpdate);
    return () => {
        window.removeEventListener('avi_data_batches', handleDataUpdate);
        window.removeEventListener('avi_data_orders', handleDataUpdate);
    };
  }, []);

  const MenuCard = ({ title, desc, icon, onClick, color, roles, compact = false, mode }: any) => {
    if (!roles.includes(user?.role)) return null;
    
    // Check specific weighing permissions
    if (mode && user?.allowedModes && !user.allowedModes.includes(mode)) return null;

    return (
      <button
        onClick={onClick}
        className={`relative overflow-hidden bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-xl hover:border-slate-400 transition-all duration-300 text-left group ${compact ? 'p-4' : 'p-6'}`}
      >
        <div className={`absolute top-0 right-0 w-24 h-24 transform translate-x-8 -translate-y-8 rounded-full opacity-5 ${color}`}></div>
        <div className="relative z-10 flex items-start space-x-4">
          <div className={`p-3 rounded-lg flex items-center justify-center ${color} text-white shadow-md`}>
            {icon}
          </div>
          <div className="flex-1">
            <h3 className={`font-bold text-slate-900 ${compact ? 'text-lg' : 'text-xl'}`}>{title}</h3>
            {!compact && <p className="text-sm text-gray-500 mt-1 mb-3 leading-snug">{desc}</p>}
            <div className={`flex items-center font-bold text-sm mt-2 ${color.replace('bg-', 'text-')} group-hover:translate-x-1 transition-transform`}>
              Acceder <ArrowRight size={16} className="ml-1" />
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center space-x-4">
            {config.logoUrl && <img src={config.logoUrl} alt="Logo" className="h-16 w-16 object-contain" />}
            <div>
                <h2 className="text-2xl font-black text-slate-900">Hola, {user?.name.split(' ')[0]}</h2>
                <p className="text-slate-500 font-medium">Panel de Control General</p>
            </div>
        </div>
        <div className="text-right bg-slate-50 px-4 py-2 rounded-lg border border-gray-100">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Fecha del Sistema</p>
            <p className="font-mono font-bold text-lg text-slate-800">{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {/* Operaciones Principales */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-gray-200 pb-2 flex items-center"><Package size={20} className="mr-2"/> Módulos de Pesaje</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MenuCard
              title="Pesaje por Lote"
              desc="Gestión completa de lotes, clientes, tara y merma."
              icon={<Package size={28} />}
              onClick={() => navigate('/lotes')}
              color="bg-blue-600"
              roles={[UserRole.ADMIN, UserRole.GENERAL, UserRole.OPERATOR]}
              mode={WeighingType.BATCH}
            />
            <MenuCard
              title="Solo Pollo"
              desc="Venta directa. Pesaje rápido sin gestión de lote."
              icon={<Bird size={28} />}
              onClick={() => navigate(`/weigh/${WeighingType.SOLO_POLLO}`)}
              color="bg-amber-500"
              roles={[UserRole.ADMIN, UserRole.GENERAL, UserRole.OPERATOR]}
              mode={WeighingType.SOLO_POLLO}
            />
            <MenuCard
              title="Solo Jabas"
              desc="Venta de jabas llenas con cálculo automático."
              icon={<Box size={28} />}
              onClick={() => navigate(`/weigh/${WeighingType.SOLO_JABAS}`)}
              color="bg-emerald-600"
              roles={[UserRole.ADMIN, UserRole.GENERAL, UserRole.OPERATOR]}
              mode={WeighingType.SOLO_JABAS}
            />
        </div>
      </div>

      {/* Administración */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-gray-200 pb-2 flex items-center"><Settings size={20} className="mr-2"/> Administración</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MenuCard
              title="Cobranza"
              icon={<Calculator size={24} />}
              onClick={() => navigate('/cobranza')}
              color="bg-indigo-600"
              roles={[UserRole.ADMIN, UserRole.GENERAL]}
              compact
            />
            <MenuCard
              title="Reportes"
              icon={<FileText size={24} />}
              onClick={() => navigate('/reportes')}
              color="bg-purple-600"
              roles={[UserRole.ADMIN, UserRole.GENERAL]}
              compact
            />
            <MenuCard
              title="Usuarios"
              icon={<Users size={24} />}
              onClick={() => navigate('/usuarios')}
              color="bg-pink-600"
              roles={[UserRole.ADMIN, UserRole.GENERAL]}
              compact
            />
            <MenuCard
              title="Configuración"
              icon={<Settings size={24} />}
              onClick={() => navigate('/config')}
              color="bg-slate-600"
              roles={[UserRole.ADMIN]}
              compact
            />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;