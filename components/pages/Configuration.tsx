import React, { useState, useContext, useEffect } from 'react';
import { AppConfig, UserRole } from '../../types';
import { getConfig, saveConfig, resetApp, isFirebaseConfigured, restoreBackup, validateConfig } from '../../services/storage';
import { Save, Check, AlertTriangle, Cloud, Download, Upload, HardDriveDownload, QrCode, Copy, X, Zap, Settings, Building2, Users, Printer, Scale, ShieldAlert, Loader2, Link, CloudOff, LogOut, Smartphone, Code, Edit3, HelpCircle, ExternalLink } from 'lucide-react';
import { AuthContext } from '../../App';
import { useLocation, useNavigate } from 'react-router-dom';

const Configuration: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [saved, setSaved] = useState(false);
  const { user } = useContext(AuthContext);
  const [isConnected, setIsConnected] = useState(false);
  
  // Connection Form State
  const [isConnecting, setIsConnecting] = useState(false);
  const [testError, setTestError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  
  // Mode Toggle: 'SMART' (Paste) or 'MANUAL' (Fields)
  const [connectMode, setConnectMode] = useState<'SMART' | 'MANUAL'>('SMART');

  // Smart Input
  const [smartInput, setSmartInput] = useState('');
  
  // Manual Inputs
  const [manualForm, setManualForm] = useState({
      apiKey: '',
      projectId: '',
      authDomain: '',
      databaseURL: '',
      appId: '',
      storageBucket: '',
      messagingSenderId: ''
  });

  const [orgIdInput, setOrgIdInput] = useState(config.organizationId || '');

  // Linking (Output) State
  const [showQR, setShowQR] = useState(false);
  const [connectionToken, setConnectionToken] = useState('');
  
  // Backup State
  const [showBackupInput, setShowBackupInput] = useState(false);
  const [backupString, setBackupString] = useState('');
  
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
      setIsConnected(isFirebaseConfigured());
      // Pre-fill manual form if config exists but we want to edit
      if (config.firebaseConfig) {
          setManualForm({
              apiKey: config.firebaseConfig.apiKey || '',
              projectId: config.firebaseConfig.projectId || '',
              authDomain: config.firebaseConfig.authDomain || '',
              databaseURL: config.firebaseConfig.databaseURL || '',
              appId: config.firebaseConfig.appId || '',
              storageBucket: config.firebaseConfig.storageBucket || '',
              messagingSenderId: config.firebaseConfig.messagingSenderId || ''
          });
      }
  }, [config]);

  // Handle Import Link (URL Param)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const importToken = params.get('import');
    if (importToken) {
         setSmartInput(importToken);
         setConnectMode('SMART');
    }
  }, [location]);
  
  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    setIsConnected(isFirebaseConfigured());
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

  const handleDisconnect = () => {
      if(confirm('¿Desconectar este dispositivo de la nube?\n\nVolverá a modo Offline/Local.')) {
          const newConfig = { ...config, firebaseConfig: undefined };
          setConfig(newConfig);
          saveConfig(newConfig);
          window.location.reload();
      }
  };

  // --- CONNECT LOGIC ---
  const handleConnect = async () => {
    setTestError('');
    setIsConnecting(true);

    try {
        let firebaseConfig: any = {};

        if (connectMode === 'SMART') {
            // --- SMART PASTE LOGIC ---
            const input = smartInput.trim();
            if (!input) throw new Error("Por favor, pega el código de configuración.");

            // 1. Try Base64 Token
            try {
                const decoded = atob(input);
                if (decoded.includes('{')) {
                    const parsed = JSON.parse(decoded);
                    if (parsed.apiKey) firebaseConfig = parsed;
                }
            } catch (e) { /* Not base64, continue */ }

            // 2. Try JSON Parsing directly
            if (!firebaseConfig.apiKey) {
                try { firebaseConfig = JSON.parse(input); } catch(e) { /* Not JSON, continue */ }
            }

            // 3. Smart Regex Extraction
            if (!firebaseConfig.apiKey) {
                const extract = (key: string) => {
                    const regex = new RegExp(`['"]?${key}['"]?\\s*:\\s*['"]([^'"]+)['"]`, 'i');
                    const match = input.match(regex);
                    return match ? match[1].trim() : undefined;
                };

                firebaseConfig = {
                    apiKey: extract('apiKey'),
                    authDomain: extract('authDomain'),
                    projectId: extract('projectId'),
                    storageBucket: extract('storageBucket'),
                    messagingSenderId: extract('messagingSenderId'),
                    appId: extract('appId'),
                    databaseURL: extract('databaseURL')
                };
            }
        } else {
            // --- MANUAL ENTRY LOGIC ---
            if (!manualForm.apiKey || !manualForm.projectId) {
                throw new Error("API Key y Project ID son obligatorios.");
            }
            firebaseConfig = {
                apiKey: manualForm.apiKey.trim(),
                authDomain: manualForm.authDomain.trim(),
                projectId: manualForm.projectId.trim(),
                storageBucket: manualForm.storageBucket.trim(),
                messagingSenderId: manualForm.messagingSenderId.trim(),
                appId: manualForm.appId.trim(),
                databaseURL: manualForm.databaseURL.trim()
            };
            
            // Clean undefined/empty values
            Object.keys(firebaseConfig).forEach(key => {
                if (!firebaseConfig[key]) delete firebaseConfig[key];
            });
        }

        // 4. Validate Found Data
        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
             throw new Error("Configuración incompleta. Se requiere al menos API Key y Project ID.");
        }

        // 5. Test Connection
        const validation = await validateConfig(firebaseConfig);
        if (!validation.valid) {
            throw new Error("Datos correctos pero conexión fallida: " + validation.error);
        }

        // 6. Save
        const newConfig = {
            ...config,
            organizationId: orgIdInput.trim(),
            firebaseConfig
        };

        saveConfig(newConfig);
        
        alert("✅ ¡Conectado con éxito!\n\nEl sistema ahora está en línea.");
        window.location.reload();

    } catch (error: any) {
        console.error("Connection Error:", error);
        setTestError(error.message);
    } finally {
        setIsConnecting(false);
    }
  };

  // --- OUTPUT LINKING LOGIC ---
  const generateConnectionData = () => {
      if (!config.firebaseConfig?.apiKey) return;
      try {
          const jsonStr = JSON.stringify(config.firebaseConfig);
          const token = btoa(jsonStr); 
          setConnectionToken(token);
          setShowQR(true);
      } catch (e) {
          alert("Error al generar el código.");
      }
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(connectionToken).then(() => alert("Copiado!"));
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
      a.download = `RESPALDO_${new Date().toISOString().split('T')[0]}.json`;
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
            <p className="text-slate-500">Ajustes generales del sistema</p>
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
              
              {/* 1. CLOUD CONNECTION SECTION */}
              {user?.role === UserRole.ADMIN && (
                <div className={`rounded-xl shadow-sm border overflow-hidden transition-all ${isConnected ? 'bg-white border-emerald-200' : 'bg-gradient-to-br from-white to-slate-50 border-blue-200'}`}>
                    
                    {/* Header */}
                    <div className={`p-5 flex justify-between items-center ${isConnected ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                        <div className="flex items-center">
                            {isConnected ? <Cloud className="mr-3 text-emerald-600" size={24}/> : <Zap className="mr-3 text-blue-600" size={24}/>}
                            <div>
                                <h3 className={`font-black text-lg ${isConnected ? 'text-emerald-900' : 'text-blue-900'}`}>
                                    {isConnected ? 'SISTEMA ONLINE' : 'CONECTAR A LA NUBE'}
                                </h3>
                                <p className={`text-xs font-bold ${isConnected ? 'text-emerald-600' : 'text-blue-600'}`}>
                                    {isConnected ? 'Sincronización activa' : 'Habilitar acceso remoto'}
                                </p>
                            </div>
                        </div>
                        {isConnected ? (
                            <button onClick={handleDisconnect} className="text-xs bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg font-bold hover:bg-red-50">
                                Desconectar
                            </button>
                        ) : (
                             <button onClick={() => setShowHelp(true)} className="text-xs flex items-center bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200">
                                <HelpCircle size={14} className="mr-1"/> ¿Problemas?
                            </button>
                        )}
                    </div>

                    <div className="p-6">
                        {isConnected ? (
                             // CONNECTED STATE
                             <div className="space-y-4">
                                 <p className="text-sm text-slate-600">
                                     El sistema está conectado a <strong>{config.firebaseConfig?.projectId}</strong>. Utiliza el código QR para conectar otros dispositivos.
                                 </p>
                                 <div className="flex flex-wrap gap-3">
                                     <button 
                                         onClick={generateConnectionData}
                                         className="bg-slate-900 text-white px-5 py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg flex items-center text-sm"
                                     >
                                         <QrCode size={18} className="mr-2"/> MOSTRAR CÓDIGO QR
                                     </button>
                                     <button onClick={() => navigate('/usuarios')} className="bg-white border border-slate-300 text-slate-700 px-5 py-3 rounded-xl font-bold hover:bg-slate-50 flex items-center text-sm">
                                         <Users size={18} className="mr-2"/> GESTIONAR ACCESOS
                                     </button>
                                 </div>
                             </div>
                        ) : (
                             // DISCONNECTED STATE - TABS
                             <div className="animate-fade-in">
                                 {/* TABS SWITCHER */}
                                 <div className="flex mb-5 bg-slate-100 p-1 rounded-xl">
                                     <button 
                                        onClick={() => setConnectMode('SMART')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center ${connectMode === 'SMART' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                     >
                                         <Code size={14} className="mr-2"/> Pegado Rápido (JSON)
                                     </button>
                                     <button 
                                        onClick={() => setConnectMode('MANUAL')}
                                        className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center ${connectMode === 'MANUAL' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                     >
                                         <Edit3 size={14} className="mr-2"/> Entrada Manual
                                     </button>
                                 </div>

                                 {/* COMMON: ORG ID */}
                                 <div className="mb-4">
                                     <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">ID Organización (Sede)</label>
                                     <input 
                                         value={orgIdInput}
                                         onChange={e => setOrgIdInput(e.target.value)}
                                         placeholder="Ej. SEDE-PRINCIPAL"
                                         className="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:border-blue-500 outline-none"
                                     />
                                 </div>

                                 {connectMode === 'SMART' ? (
                                    // SMART INPUT
                                    <div className="mb-4 relative">
                                        <textarea 
                                          value={smartInput}
                                          onChange={e => setSmartInput(e.target.value)}
                                          className="w-full h-40 bg-white border-2 border-dashed border-blue-200 rounded-xl p-4 text-xs font-mono outline-none focus:border-blue-500 focus:bg-blue-50/30 transition-all placeholder-slate-400"
                                          placeholder={`Ejemplo:\nconst firebaseConfig = {\n  apiKey: "AIzaSyD...",\n  projectId: "mi-avicola-app",\n  ...\n};`}
                                        />
                                        <div className="absolute top-2 right-2 bg-blue-50 text-blue-600 text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider">
                                            Auto-Detect
                                        </div>
                                    </div>
                                 ) : (
                                    // MANUAL INPUTS GRID
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                        <div className="col-span-1 md:col-span-2">
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Project ID <span className="text-red-500">*</span></label>
                                            <input 
                                                value={manualForm.projectId}
                                                onChange={e => setManualForm({...manualForm, projectId: e.target.value})}
                                                placeholder="my-project-id"
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-700 focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                        <div className="col-span-1 md:col-span-2">
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">API Key <span className="text-red-500">*</span></label>
                                            <input 
                                                value={manualForm.apiKey}
                                                onChange={e => setManualForm({...manualForm, apiKey: e.target.value})}
                                                placeholder="AIzaSy..."
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-700 focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Auth Domain</label>
                                            <input 
                                                value={manualForm.authDomain}
                                                onChange={e => setManualForm({...manualForm, authDomain: e.target.value})}
                                                placeholder="app.firebaseapp.com"
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Database URL</label>
                                            <input 
                                                value={manualForm.databaseURL}
                                                onChange={e => setManualForm({...manualForm, databaseURL: e.target.value})}
                                                placeholder="https://..."
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">App ID</label>
                                            <input 
                                                value={manualForm.appId}
                                                onChange={e => setManualForm({...manualForm, appId: e.target.value})}
                                                placeholder="1:123456:web:..."
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Storage Bucket</label>
                                            <input 
                                                value={manualForm.storageBucket}
                                                onChange={e => setManualForm({...manualForm, storageBucket: e.target.value})}
                                                placeholder="app.appspot.com"
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-700 focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                 )}
                                 
                                 {testError && (
                                     <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs border border-red-100 rounded-xl flex items-center font-bold">
                                         <ShieldAlert size={16} className="mr-2"/> {testError}
                                     </div>
                                 )}

                                 <button 
                                     onClick={handleConnect}
                                     disabled={isConnecting}
                                     className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-wide flex justify-center items-center shadow-lg transition-all transform active:scale-95 ${isConnecting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                                 >
                                     {isConnecting ? <Loader2 className="animate-spin mr-2"/> : <Link className="mr-2" size={18}/>}
                                     {isConnecting ? 'CONECTANDO...' : 'VINCULAR AHORA'}
                                 </button>
                             </div>
                        )}
                    </div>
                </div>
              )}

              {/* 2. GENERAL INFO */}
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

               {/* 3. HARDWARE & PERIPHERALS */}
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

      {/* QR CODE MODAL */}
      {showQR && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl relative">
                  <button onClick={() => setShowQR(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X/></button>
                  
                  <div className="bg-blue-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 text-blue-600">
                      <Smartphone size={32}/>
                  </div>

                  <h3 className="text-xl font-black text-slate-900 mb-1">Conectar Dispositivo</h3>
                  <p className="text-slate-500 text-sm mb-6 px-4">Escanea esto con la cámara de otro celular para vincularlo automáticamente.</p>
                  
                  <div className="bg-white p-4 rounded-xl border-2 border-slate-100 inline-block mb-6 shadow-inner">
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(connectionToken)}`} 
                        alt="QR Code" 
                        className="w-48 h-48 object-contain"
                      />
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 text-left">
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Token de Texto (Alternativo)</p>
                      <div className="flex gap-2">
                          <input readOnly value={connectionToken} className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-600 truncate focus:outline-none" />
                          <button onClick={copyToClipboard} className="bg-blue-100 text-blue-600 p-1.5 rounded hover:bg-blue-200 transition-colors"><Copy size={16}/></button>
                      </div>
                  </div>

                  <button onClick={() => setShowQR(false)} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800">Listo, Cerrar</button>
              </div>
          </div>
      )}

      {/* HELP MODAL */}
      {showHelp && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
                  <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X/></button>
                  <h3 className="text-xl font-black text-slate-900 mb-4 flex items-center">
                      <HelpCircle className="mr-2 text-blue-600"/> Guía de Conexión Firebase
                  </h3>
                  
                  <div className="space-y-4 text-sm text-slate-600">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                          <h4 className="font-bold text-slate-800 mb-2">1. Crear Proyecto y Base de Datos</h4>
                          <p className="mb-2">Entra a <a href="https://console.firebase.google.com" target="_blank" className="text-blue-600 underline font-bold">console.firebase.google.com</a>, crea un proyecto y ve a <strong>Firestore Database</strong>.</p>
                          <p>Haz clic en <strong>Crear base de datos</strong>. Selecciona una ubicación (ej. us-central1) e inicia en <strong>Modo de prueba</strong>.</p>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                          <h4 className="font-bold text-slate-800 mb-2">2. Configurar Reglas de Seguridad</h4>
                          <p className="mb-2">Si te sale "Permisos denegados", ve a la pestaña <strong>Reglas</strong> en Firestore y pega esto:</p>
                          <pre className="bg-slate-800 text-slate-100 p-3 rounded-lg font-mono text-xs overflow-x-auto">
                              {`rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`}
                          </pre>
                          <p className="mt-2 text-xs text-amber-600 font-bold flex items-center"><AlertTriangle size={12} className="mr-1"/> Esto hace la base de datos pública (ideal para pruebas o uso interno simple).</p>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                           <h4 className="font-bold text-slate-800 mb-2">3. Obtener Credenciales</h4>
                           <p>Ve a <strong>Configuración del Proyecto (rueda dentada)</strong> {'>'} <strong>General</strong>.</p>
                           <p>Baja hasta "Tus apps", selecciona el ícono de Web (<code>&lt;/&gt;</code>), registra la app y copia el objeto <code>firebaseConfig</code>.</p>
                      </div>
                  </div>

                  <div className="mt-6 flex justify-end">
                      <button onClick={() => setShowHelp(false)} className="bg-blue-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-800">Entendido</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Configuration;