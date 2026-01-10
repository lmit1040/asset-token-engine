import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import MetallumXLogo from '@/assets/MetallumXLogo.png';

interface PublicCourseLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function PublicCourseLayout({ title, subtitle, children }: PublicCourseLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 sticky top-0 bg-background/95 backdrop-blur z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={MetallumXLogo} alt="MetallumX" className="h-12 w-auto object-contain" />
            <span className="text-xl font-bold gold-text">MetallumX Vault</span>
          </Link>
          <Link to="/auth">
            <Button size="sm" className="gap-2">
              Sign In
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={MetallumXLogo} alt="MetallumX" className="h-8 w-auto object-contain" />
            <span className="text-sm text-muted-foreground">© 2024 MetallumX Vault</span>
          </div>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Sign In to track progress
          </Link>
        </div>
      </footer>
    </div>
  );
}
