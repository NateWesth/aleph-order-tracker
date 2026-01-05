import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checkingApproval, setCheckingApproval] = useState(true);
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    const checkApproval = async () => {
      if (!user) {
        setCheckingApproval(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('approved')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.approved) {
          setIsApproved(true);
        } else {
          // User not approved - sign them out
          await supabase.auth.signOut();
          navigate('/', { replace: true });
        }
      } catch (error) {
        console.error('Error checking approval:', error);
        await supabase.auth.signOut();
        navigate('/', { replace: true });
      } finally {
        setCheckingApproval(false);
      }
    };

    if (!loading) {
      if (!user) {
        navigate('/', { replace: true });
        setCheckingApproval(false);
      } else {
        checkApproval();
      }
    }
  }, [user, loading, navigate]);

  if (loading || checkingApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg text-foreground">Loading...</div>
      </div>
    );
  }

  if (!user || !isApproved) {
    return null;
  }

  return <>{children}</>;
};
