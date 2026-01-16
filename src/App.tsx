import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Toaster } from "@/components/ui/toaster";
import { FloatingUploadButton } from './components/FloatingUploadButton';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import AdminDashboard from './pages/AdminDashboard';

// Lazy load heavy components for better Speed Index
const Auth = lazy(() => import('./pages/Auth'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

// Create QueryClient outside component to prevent recreation on renders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

// Loading fallback component
const PageFallback = () => (
  <div className="min-h-screen bg-background p-8 space-y-4">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-4 w-96" />
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  </div>
);

function App() {
  console.log('App component loaded, current path:', window.location.pathname);
  console.log('Full URL:', window.location.href);
  
  // Capture reset password parameters before router processes them
  if (window.location.pathname === '/reset-password' && window.location.hash) {
    const hashParams = window.location.hash.substring(1);
    console.log('Storing reset params in localStorage:', hashParams);
    localStorage.setItem('resetPasswordParams', hashParams);
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <div className="min-h-screen bg-background text-foreground safe-area-insets">
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/admin-dashboard" element={
                    <ProtectedRoute>
                      <AdminDashboard />
                    </ProtectedRoute>
                  } />
                  {/* Redirect old client-dashboard to admin-dashboard */}
                  <Route path="/client-dashboard" element={<Navigate to="/admin-dashboard" replace />} />
                  <Route path="/settings" element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  } />
                  
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <FloatingUploadButton />
              <PWAInstallPrompt />
              <PWAUpdatePrompt />
              <Toaster />
            </div>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
