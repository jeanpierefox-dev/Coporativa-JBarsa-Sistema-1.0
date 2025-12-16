import React, { useState, useContext, useEffect } from 'react';
import { AuthContext } from '../../App';
import { User, UserRole, WeighingType } from '../../types';
import { getUsers, saveUser, deleteUser } from '../../services/storage';
import { Trash2, Plus, Shield, Edit, User as UserIcon, Database } from 'lucide-react';

const UserManagement: React.FC = () => {
  const { user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [newUser, setNewUser] = useState<Partial<User>>({ 
      role: UserRole.OPERATOR,
      allowedModes: [WeighingType.BATCH, WeighingType.SOLO_POLLO, WeighingType.SOLO_JABAS]
  });

  useEffect(() => {
    refreshUsers();
  }, [currentUser]);

  const refreshUsers = () => {
    const all = getUsers();
    if (currentUser?.role === UserRole.ADMIN) {
      setUsers(all);
    } else {
      setUsers(all.filter(u => u.parentId === currentUser?.id || u.id === currentUser?.id));
    }
  };

  const handleEdit = (u: User) => {
    setNewUser(u);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!newUser.username || !newUser.name || !newUser.password) return;
    
    const u: User = {
      id: newUser.id || Date.now().toString(),
      username: newUser.username,
      password: newUser.password,
      name: newUser.name,
      role: newUser.role as UserRole,
      parentId: newUser.parentId || currentUser?.id,
      allowedModes: newUser.allowedModes || []
    };
    saveUser(u);
    setIsModalOpen(false);
    setNewUser({ role: UserRole.OPERATOR, allowedModes: [WeighingType.BATCH, WeighingType.SOLO_POLLO, WeighingType.SOLO_JABAS] });
    refreshUsers();
  };

  const toggleMode = (mode: WeighingType) => {
      const current = newUser.allowedModes || [];
      if (current.includes(mode)) {
          setNewUser({ ...newUser, allowedModes: current.filter(m => m !== mode) });
      } else {
          setNewUser({ ...newUser, allowedModes: [...current, mode] });
      }
  };

  const canDelete = (target: User) => {
    if (target.id === currentUser?.id) return false;
    if (currentUser?.role === UserRole.ADMIN) return true;
    if (currentUser?.role === UserRole.GENERAL && target.parentId === currentUser.id) return true;
    return false;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-black text-gray-900">Usuarios del Sistema</h2>
            <p className="text-gray-500 text-sm flex items-center">
                <Database size={14} className="text-slate-400 mr-1"/>
                Almacenamiento Local • {users.length} Usuarios Activos
            </p>
        </div>
        <button 
          onClick={() => { 
              setNewUser({ role: UserRole.OPERATOR, allowedModes: [WeighingType.BATCH, WeighingType.SOLO_POLLO, WeighingType.SOLO_JABAS] }); 
              setIsModalOpen(true); 
          }}
          className="bg-blue-900 text-white px-5 py-3 rounded-xl flex items-center hover:bg-blue-800 shadow-lg font-bold text-sm transition-all"
        >
          <Plus size={18} className="mr-2" /> CREAR USUARIO
        </button>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {users.map(u => (
          <div key={u.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex flex-col justify-between h-full relative overflow-hidden group">
            
            {/* Role Badge */}
            <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-black uppercase tracking-wider ${u.role === UserRole.ADMIN ? 'bg-purple-600 text-white' : u.role === UserRole.GENERAL ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {u.role === UserRole.ADMIN ? 'ADMIN' : u.role === UserRole.GENERAL ? 'SUPERVISOR' : 'OPERADOR'}
            </div>

            <div className="flex items-start space-x-4 mb-4">
              <div className={`p-3 rounded-full mt-1 ${u.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                {u.role === UserRole.ADMIN ? <Shield size={24} /> : <UserIcon size={24} />}
              </div>
              <div>
                <p className="font-bold text-gray-900 text-lg leading-tight">{u.name}</p>
                <p className="text-sm text-gray-500 font-mono">@{u.username}</p>
              </div>
            </div>
            
            <div className="border-t border-gray-100 pt-3 mt-auto">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-2">Permisos de Acceso</p>
                <div className="flex gap-2 mb-4 flex-wrap">
                    {u.allowedModes?.includes(WeighingType.BATCH) && <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded font-bold border border-blue-100">Lotes</span>}
                    {u.allowedModes?.includes(WeighingType.SOLO_POLLO) && <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded font-bold border border-amber-100">Pollo</span>}
                    {u.allowedModes?.includes(WeighingType.SOLO_JABAS) && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded font-bold border border-emerald-100">Jabas</span>}
                </div>

                <div className="flex justify-end space-x-2">
                    {(currentUser?.role === UserRole.ADMIN || u.parentId === currentUser?.id) && (
                        <button onClick={() => handleEdit(u)} className="flex items-center text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors">
                            <Edit size={14} className="mr-1"/> EDITAR
                        </button>
                    )}
                    {canDelete(u) && (
                        <button onClick={() => { if(confirm('¿Eliminar usuario del sistema?')) { deleteUser(u.id); refreshUsers(); }}} className="flex items-center text-xs font-bold text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
                            <Trash2 size={14} className="mr-1"/> ELIMINAR
                        </button>
                    )}
                </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-100">
            <h3 className="font-black mb-6 text-2xl text-slate-900">{newUser.id ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
            <div className="space-y-4">
              <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Nombre Completo</label>
                  <input 
                    className="w-full border-2 border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" 
                    placeholder="Ej. Juan Pérez"
                    value={newUser.name || ''}
                    onChange={e => setNewUser({...newUser, name: e.target.value})}
                  />
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Usuario (Login)</label>
                      <input 
                        className="w-full border-2 border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" 
                        placeholder="juanp"
                        value={newUser.username || ''}
                        onChange={e => setNewUser({...newUser, username: e.target.value})}
                      />
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Contraseña</label>
                      <input 
                        type="text" 
                        className="w-full border-2 border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all" 
                        placeholder="***"
                        value={newUser.password || ''}
                        onChange={e => setNewUser({...newUser, password: e.target.value})}
                      />
                  </div>
              </div>
              
              <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Rol / Nivel</label>
                  <select 
                    className="w-full border-2 border-slate-200 bg-slate-50 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}
                  >
                    <option value={UserRole.OPERATOR}>Operador / Vendedor (Básico)</option>
                    {currentUser?.role === UserRole.ADMIN && <option value={UserRole.GENERAL}>Supervisor (Control)</option>}
                    {currentUser?.role === UserRole.ADMIN && <option value={UserRole.ADMIN}>Administrador Total</option>}
                  </select>
              </div>

              <div className="pt-4 border-t border-slate-100 mt-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Permisos de Módulos</p>
                  <div className="flex flex-col gap-3">
                      <label className="flex items-center p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                          <input type="checkbox" className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" 
                            checked={newUser.allowedModes?.includes(WeighingType.BATCH)}
                            onChange={() => toggleMode(WeighingType.BATCH)}
                          /> 
                          <span className="ml-3 font-bold text-slate-700">Módulo de Lotes</span>
                      </label>
                      <label className="flex items-center p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                          <input type="checkbox" className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" 
                            checked={newUser.allowedModes?.includes(WeighingType.SOLO_POLLO)}
                            onChange={() => toggleMode(WeighingType.SOLO_POLLO)}
                          /> 
                          <span className="ml-3 font-bold text-slate-700">Módulo Solo Pollo</span>
                      </label>
                      <label className="flex items-center p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                          <input type="checkbox" className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500" 
                            checked={newUser.allowedModes?.includes(WeighingType.SOLO_JABAS)}
                            onChange={() => toggleMode(WeighingType.SOLO_JABAS)}
                          /> 
                          <span className="ml-3 font-bold text-slate-700">Módulo Solo Jabas</span>
                      </label>
                  </div>
              </div>
            </div>
            <div className="mt-8 flex justify-end space-x-3">
              <button onClick={() => setIsModalOpen(false)} className="px-5 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
              <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg transition-colors">Guardar Usuario</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;