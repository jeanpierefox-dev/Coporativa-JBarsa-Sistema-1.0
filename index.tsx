import React, { ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AlertTriangle, Trash2 } from 'lucide-react';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Root element not found");

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

// Error Boundary to prevent "White Screen of Death"
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Critical Error:", error, errorInfo);
  }

  handleHardReset = () => {
    if (confirm("¿Estás seguro? Esto borrará todos los datos locales para recuperar el sistema.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error instanceof Error 
        ? this.state.error.message 
        : typeof this.state.error === 'string' 
            ? this.state.error 
            : JSON.stringify(this.state.error);

      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full text-center border-2 border-red-100">
            <div className="bg-red-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={40} className="text-red-600"/>
            </div>
            <h1 className="text-2xl font-black text-slate-900 mb-2">Error Crítico del Sistema</h1>
            <p className="text-slate-500 mb-6 text-sm">El sistema ha encontrado un error irrecuperable (posiblemente conflicto de versiones o datos).</p>
            
            <div className="bg-slate-50 p-3 rounded-lg text-left text-xs font-mono text-red-500 mb-6 overflow-auto max-h-32 border border-slate-200 break-words whitespace-pre-wrap">
                {errorMessage || "Error Desconocido"}
            </div>

            <button 
              onClick={this.handleHardReset}
              className="w-full bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg flex items-center justify-center"
            >
              <Trash2 size={20} className="mr-2"/> RESTABLECER DATOS
            </button>
            <p className="mt-4 text-xs text-slate-400">Esto eliminará los datos locales y reiniciará la aplicación.</p>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
  </React.StrictMode>
);