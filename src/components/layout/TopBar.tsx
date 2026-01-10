import { Bell, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WalletConnectButtons } from '@/components/wallet/WalletConnectButtons';
import { MobileSidebar } from './MobileSidebar';
import { PageBreadcrumb } from './PageBreadcrumb';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export function TopBar({ title, subtitle }: TopBarProps) {
  return (
    <header className="min-h-16 border-b border-border bg-background/50 backdrop-blur-xl px-4 md:px-6 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger menu */}
        <MobileSidebar />
        
        <div>
          <PageBreadcrumb />
          <h1 className="text-lg md:text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search..." 
            className="w-64 pl-10 input-dark"
          />
        </div>
        <div className="hidden sm:block">
          <WalletConnectButtons />
        </div>
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
