import React, { useState, useContext } from 'react';
import { AppConfig, UserRole } from '../../types';
import { getConfig, saveConfig, resetApp, restoreBackup } from '../../services/storage';
import { Save, Check, AlertTriangle, Download, Upload, HardDriveDownload, Settings, Building2, Printer, Scale, ShieldAlert, Loader2 } from 'lucide-react';
import { AuthContext } from '../../App';
import { useNavigate } from 'react-router-dom';

const Configuration: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [saved, setSaved] = useState(false);
  const { user } = useContext(AuthContext);
  
  // Backup State
  const [showBackupInput, setShowBackupInput] = useState(false);
  const [backupString, setBackupString] = useState('');
  
  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setConfig({ ...config, logoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReset = () => {
    if (confirm('¡ADVERTENCIA CRÍTICA!\n\nEsto borrará TODOS los datos locales (usuarios, lotes, ventas) y restablecerá la aplicación.\n\n¿Estás seguro?')) {
        if(confirm('Confirma por segunda vez: ¿Restablecer dispositivo?')) {
            resetApp();
        }
    }
  };

  // --- BACKUP LOGIC ---
  const handleDownloadBackup = () => {
      const data = {
          users: localStorage.getItem('avi_users'),
          batches: localStorage.getItem('avi_batches'),
          orders: localStorage.getItem('avi_orders'),
          config: localStorage.getItem('avi_config'),
          backupDate: new Date().toISOString()
      };
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], {type : 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RESPALDO_LOCAL_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleRestoreBackup = () => {
      if (!backupString.trim()) { alert("Pegue el JSON."); return; }
      try {
          const parsed = JSON.parse(backupString);
          if (parsed.users && parsed.config) {
              if (confirm("¿Restaurar respaldo? Esto sobrescribirá datos.")) restoreBackup(parsed);
          } else { alert("Respaldo inválido."); }
      } catch (e: any) { alert("Error JSON: " + e.message); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-black text-slate-900">Configuración</h2>
            <p className="text-slate-500">Ajustes generales del sistema local</p>
          </div>
          <button 
            onClick={handleSave}
            className={`flex items-center px-6 py-3 rounded-xl font-bold shadow-lg transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-blue-900 text-white hover:bg-blue-800'}`}
          >
            {saved ? <Check className="mr-2"/> : <Save className="mr-2" />}
            {saved ? 'Guardado' : 'Guardar Cambios'}
          </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN */}
          <div className="lg:col-span-2 space-y-6">
              
              {/* 1. GENERAL INFO */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                <h3 className="font-bold text-base text-slate-800 border-b pb-2 flex items-center"><Building2 size={18} className="mr-2 text-slate-400"/> Datos de la Empresa</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Nombre Comercial</label>
                        <input 
                            value={config.companyName}
                            onChange={e => setConfig({...config, companyName: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 font-bold text-gray-800 focus:border-blue-500 outline-none text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Logo</label>
                        <div className="flex items-center space-x-3">
                            {config.logoUrl ? (
                                <img src={config.logoUrl} alt="Logo" className="h-10 w-10 object-contain border rounded bg-white" />
                            ) : (
                                <div className="h-10 w-10 bg-gray-50 rounded border border-dashed border-gray-300 flex items-center justify-center text-[10px] text-gray-400">Sin Logo</div>
                            )}
                            <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                Cambiar
                                <input type="file" onChange={handleLogoUpload} className="hidden" accept="image/*" />
                            </label>
                        </div>
                    </div>
                </div>
              </div>

               {/* 2. HARDWARE & PERIPHERALS */}
               <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
                <h3 className="font-bold text-base text-slate-800 border-b pb-2 flex items-center"><Settings size={18} className="mr-2 text-slate-400"/> Hardware y Periféricos</h3>
                
                <div className="space-y-3">
                    <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                          <div className="flex items-center">
                              <div className={`p-2 rounded-lg mr-3 ${config.printerConnected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                  <Printer size={20}/>
                              </div>
                              <div>
                                  <span className="block font-bold text-slate-700 text-sm">Impresora Térmica (Ticket)</span>
                                  <span className="text-[10px] text-slate-400">Conexión vía Bluetooth / USB</span>
                              </div>
                          </div>
                          <div className={`w-10 h-5 flex items-center rounded-full p-1 duration-300 ease-in-out ${config.printerConnected ? 'bg-blue-600' : 'bg-slate-300'}`}>
                              <input type="checkbox" className="hidden" 
                                checked={config.printerConnected}
                                onChange={() => setConfig({...config, printerConnected: !config.printerConnected})}
                              /> 
                              <div className={`bg-white w-3 h-3 rounded-full shadow-md transform duration-300 ease-in-out ${config.printerConnected ? 'translate-x-5' : ''}`}></div>
                          </div>
                    </label>

                    <label className="flex items-center justify-between p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                          <div className="flex items-center">
                              <div className={`p-2 rounded-lg mr-3 ${config.scaleConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                  <Scale size={20}/>
                              </div>
                              <div>
                                  <span className="block font-bold text-slate-700 text-sm">Balanza Digital (Serial)</span>
                                  <span className="text-[10px] text-slate-400">Lectura automática de peso (Simulado)</span>
                              </div>
                          </div>
                          <div className={`w-10 h-5 flex items-center rounded-full p-1 duration-300 ease-in-out ${config.scaleConnected ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                              <input type="checkbox" className="hidden" 
                                checked={config.scaleConnected}
                                onChange={() => setConfig({...config, scaleConnected: !config.scaleConnected})}
                              /> 
                              <div className={`bg-white w-3 h-3 rounded-full shadow-md transform duration-300 ease-in-out ${config.scaleConnected ? 'translate-x-5' : ''}`}></div>
                          </div>
                    </label>
                </div>
              </div>

          </div>

          {/* RIGHT COLUMN: TOOLS */}
          <div className="space-y-6">
              {/* BACKUP TOOLS */}
              {user?.role === UserRole.ADMIN && (
                 <div className="bg-amber-50 rounded-xl shadow-sm border border-amber-200 p-5">
                     <h3 className="font-bold text-sm text-amber-900 mb-3 flex items-center"><HardDriveDownload size={16} className="mr-2"/> Respaldo Local</h3>
                     
                     <div className="grid grid-cols-2 gap-2 mb-3">
                         <button onClick={handleDownloadBackup} className="bg-white border border-amber-300 text-amber-800 p-2 rounded-lg text-xs font-bold hover:bg-amber-100 flex flex-col items-center justify-center gap-1">
                             <Download size={16}/> Descargar
                         </button>
                         <button onClick={() => setShowBackupInput(!showBackupInput)} className="bg-white border border-amber-300 text-amber-800 p-2 rounded-lg text-xs font-bold hover:bg-amber-100 flex flex-col items-center justify-center gap-1">
                             <Upload size={16}/> Cargar
                         </button>
                     </div>
                     
                     {showBackupInput && (
                         <div className="mt-2">
                             <textarea 
                                 value={backupString}
                                 onChange={e => setBackupString(e.target.value)}
                                 className="w-full h-16 p-2 text-[10px] rounded border border-amber-300 mb-2 font-mono"
                                 placeholder='Pegar JSON aquí...'
                             />
                             <button onClick={handleRestoreBackup} className="w-full bg-amber-600 text-white py-1.5 rounded text-xs font-bold hover:bg-amber-700">RESTAURAR</button>
                         </div>
                     )}
                 </div>
              )}
              
              <div className="pt-2">
                  <button onClick={handleReset} className="w-full text-red-500 hover:text-red-700 text-xs font-bold flex items-center justify-center gap-1 p-2 rounded hover:bg-red-50 transition-colors border border-transparent hover:border-red-100">
                      <AlertTriangle size={14}/> RESTABLECER FÁBRICA
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};

export default Configuration;