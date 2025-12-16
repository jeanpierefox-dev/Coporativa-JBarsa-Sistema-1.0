import React, { useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { User } from './types';
import { LogOut, ArrowLeft, Settings, Database } from 'lucide-react';

// Pages
import LoginPage from './components/pages/Login';
import Dashboard from './components/pages/Dashboard';
import UserManagement from './components/pages/UserManagement';
import BatchList from './components/pages/BatchList';
import WeighingStation from './components/pages/WeighingStation';
import Collections from './components/pages/Collections';
import Reports from './components/pages/Reports';
import Configuration from './components/pages/Configuration';

// Context
export const AuthContext = React.createContext<{
  user: User | null;
  setUser: (u: User | null) => void;
  logout: () => void;
}>({ user: null, setUser: () => {}, logout: () => {} });

// Simple Container Layout without Sidebar
const Container: React.FC<{ children: React.ReactNode; title?: string; showBack?: boolean }> = ({ children, title, showBack }) => {
  const { user, logout } = React.useContext(AuthContext);
  const navigate = useNavigate();

  if (!user) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* App Bar - Navy Blue */}
      <header className="bg-blue-950 text-white shadow-lg p-4 sticky top-0 z-50 border-b border-blue-900">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
            {showBack && (
              <button onClick={() => navigate(-1)} className="p-1 hover:bg-blue-900 rounded-full transition-colors">
                <ArrowLeft size={24} />
              </button>
            )}
            <h1 className="text-xl font-bold tracking-tight">{title || 'SISTEMA BARSA'}</h1>
          </div>
          <div className="flex items-center space-x-4">
            
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-blue-100">{user.name}</p>
              <p className="text-xs text-blue-300">{user.role}</p>
            </div>
            <button
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 p-2 rounded-lg transition-colors shadow-md"
              title="Cerrar Sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-6xl mx-auto w-full p-4">
        {children}
      </main>
    </div>
  );
};

const App: React.FC = () => {
    // Simple Session Persistence
    const [user, setUserState] = useState<User | null>(() => {
        try {
            const saved = localStorage.getItem('avi_session_user');
            return saved ? JSON.parse(saved) : null;
        } catch { return null; }
    });

    const setUser = (u: User | null) => {
        if (u) localStorage.setItem('avi_session_user', JSON.stringify(u));
        else localStorage.removeItem('avi_session_user');
        setUserState(u);
    };

    const logout = () => setUser(null);

    return (
        <AuthContext.Provider value={{ user, setUser, logout }}>
            <HashRouter>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    
                    <Route path="/" element={<Container><Dashboard /></Container>} />
                    <Route path="/usuarios" element={<Container title="Gestión de Usuarios" showBack><UserManagement /></Container>} />
                    <Route path="/lotes" element={<Container title="Lotes de Producción" showBack><BatchList /></Container>} />
                    <Route path="/weigh/:mode/:batchId?" element={<Container title="Estación de Pesaje" showBack><WeighingStation /></Container>} />
                    <Route path="/cobranza" element={<Container title="Cobranza y Caja" showBack><Collections /></Container>} />
                    <Route path="/reportes" element={<Container title="Reportes y Estadísticas" showBack><Reports /></Container>} />
                    <Route path="/config" element={<Container title="Configuración" showBack><Configuration /></Container>} />
                    
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </HashRouter>
        </AuthContext.Provider>
    );
};

export default App;