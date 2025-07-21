import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Auth from './pages/Auth';
import AdminDashboard from './pages/AdminDashboard';
import ClientDashboard from './pages/ClientDashboard';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import MobileScanPage from './components/orders/components/MobileScanPage';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toaster } from "@/components/ui/toaster";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <div className="min-h-screen bg-background text-foreground">
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/admin-dashboard" element={<AdminDashboard />} />
                <Route path="/client-dashboard" element={<ClientDashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/mobile-scan/:sessionId/:orderId/:fileType" element={<MobileScanPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <Toaster />
            </div>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
