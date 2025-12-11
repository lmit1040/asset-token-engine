import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Vault, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MetallumXLogo from '@/assets/MetallumXLogo.png';
const Index = () => {
  const {
    user,
    isLoading
  } = useAuth();
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-gold animate-pulse">
            <Vault className="h-8 w-8 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Loading MetallumX Vault...</p>
        </div>
      </div>;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={MetallumXLogo} alt="MetallumX" className="h-10 w-auto object-contain" />
            <span className="text-xl font-bold gold-text">MetallumX Vault</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/reserves">
              <Button variant="ghost" size="sm" className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                Verify Reserves
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="gap-2">
                Sign In
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-8 shadow-gold">
            <Vault className="h-12 w-12 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold mb-4">Precious Metal Tokenization</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Securely tokenize and verify real-world precious metal assets on the blockchain.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Get Started
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link to="/reserves">
              <Button variant="outline" size="lg" className="gap-2">
                <ShieldCheck className="h-5 w-5" />
                Verify Reserves
              </Button>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © 2024 MetallumX Vault. All rights reserved.
          </p>
          <Link to="/reserves" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Verify Reserves
          </Link>
        </div>
      </footer>
    </div>;
};
export default Index;