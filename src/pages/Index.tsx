import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Vault } from 'lucide-react';

const Index = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-gold animate-pulse">
            <Vault className="h-8 w-8 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Loading MetallumX Vault...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/auth" replace />;
};

export default Index;
