import { useState } from 'react';
import { Link, NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { Menu, LogOut, ShieldCheck, LayoutDashboard, Coins, User, Users, Activity, Award, Vote, ArrowRightLeft, FileCheck, Wallet, Globe, FileUp, FolderOpen, ClipboardList, Archive, Zap, Newspaper, FileText, Package, Rocket, Sparkles, BarChart3, FileSignature, Layers, Radar, MonitorDot, Crosshair, TrendingUp, Gift, UserPlus, HelpCircle, BookOpen, DollarSign, GraduationCap, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Assets", href: "/assets", icon: Package },
  { name: "Tokens", href: "/tokens", icon: Coins },
  { name: "Transfers", href: "/transfers", icon: ArrowRightLeft },
  { name: "Submit Asset", href: "/submit-asset", icon: FileUp },
  { name: "My Submissions", href: "/my-submissions", icon: FolderOpen },
  { name: "MXU Benefits", href: "/mxu-benefits", icon: Award },
  { name: "Earn MXG", href: "/earn-mxg", icon: TrendingUp },
  { name: "Training", href: "/training", icon: BookOpen },
  { name: "Governance", href: "/governance", icon: Vote },
  { name: "Profile", href: "/profile", icon: User },
  { name: "FAQ & Help", href: "/faq", icon: HelpCircle },
  { name: "Documentation", href: "/help/documentation", icon: BookOpen },
];

const adminNavigation = [
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Review Submissions", href: "/admin/submissions", icon: ClipboardList },
  { name: "Token Proposals", href: "/admin/token-proposals", icon: FileText },
  { name: "Token Operations", href: "/admin/token-operations", icon: Layers },
  { name: "Attestations", href: "/admin/attestations", icon: FileCheck },
  { name: "Fee Payers (SOL)", href: "/admin/fee-payers", icon: Wallet },
  { name: "Fee Payers (EVM)", href: "/admin/evm-fee-payers", icon: Globe },
  { name: "Arbitrage", href: "/admin/arbitrage/strategies", icon: Zap },
  { name: "Auto Arbitrage", href: "/admin/arbitrage/automation", icon: Bot },
  { name: "Flash Loan Providers", href: "/admin/arbitrage/flash-loans", icon: Sparkles },
  { name: "Flash Loan Analytics", href: "/admin/arbitrage/flash-loan-analytics", icon: BarChart3 },
  { name: "New Pool Detection", href: "/admin/arbitrage/new-pools", icon: Radar },
  { name: "OPS Events", href: "/admin/arbitrage/ops-events", icon: MonitorDot },
  { name: "Profit Discovery", href: "/admin/arbitrage/profit-discovery", icon: Crosshair },
  { name: "News", href: "/admin/news", icon: Newspaper },
  { name: "Archived", href: "/admin/archived", icon: Archive },
  { name: "Activity", href: "/admin/activity", icon: Activity },
  { name: "NDA Signatures", href: "/admin/nda-signatures", icon: FileSignature },
  { name: "Reward Config", href: "/admin/reward-config", icon: Gift },
  { name: "Referrals", href: "/admin/referrals", icon: UserPlus },
  { name: "Training Content", href: "/admin/training", icon: GraduationCap },
  { name: "Launch Checklist", href: "/admin/launch-checklist", icon: Rocket },
  { name: "Fee Management", href: "/admin/fees", icon: DollarSign },
];

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { isAdmin, isAssetManager, role, signOut, user } = useAuth();

  const getRoleDisplay = () => {
    if (role === "admin") return "Administrator";
    if (role === "asset_manager") return "Asset Manager";
    return "User";
  };

  const handleLinkClick = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 bg-sidebar">
        {/* Logo */}
        <Link 
          to="/" 
          onClick={handleLinkClick}
          className="flex h-32 items-center gap-3 px-6 border-b border-sidebar-border hover:bg-sidebar-accent transition-colors"
        >
          <img 
            src="/assets/MetallumXLogo.png" 
            alt="MetallumX" 
            className="w-full max-w-full h-auto object-contain" 
          />
        </Link>

        <ScrollArea className="flex-1 h-[calc(100vh-8rem-6rem)]">
          <nav className="space-y-1 px-3 py-4">
            {/* Main Navigation */}
            <div className="mb-4">
              <p className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Main
              </p>
              {navigation.map((item) => {
                const isActive = location.pathname === item.href || 
                  (item.href !== "/dashboard" && location.pathname.startsWith(item.href));
                return (
                  <RouterNavLink
                    key={item.name}
                    to={item.href}
                    onClick={handleLinkClick}
                    className={cn("sidebar-link", isActive && "active")}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </RouterNavLink>
                );
              })}
            </div>

            {/* Admin Navigation */}
            {(isAdmin || isAssetManager) && (
              <div className="pt-4 border-t border-sidebar-border">
                <p className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {isAdmin ? "Admin" : "Manager"}
                </p>
                {adminNavigation
                  .filter((item) => {
                    if (!isAdmin && isAssetManager) {
                      return item.href === "/admin/submissions";
                    }
                    return true;
                  })
                  .map((item) => {
                    const isActive = location.pathname.startsWith(item.href);
                    return (
                      <RouterNavLink
                        key={item.name}
                        to={item.href}
                        onClick={handleLinkClick}
                        className={cn("sidebar-link", isActive && "active")}
                      >
                        <item.icon className="h-5 w-5" />
                        {item.name}
                      </RouterNavLink>
                    );
                  })}
              </div>
            )}
          </nav>
        </ScrollArea>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-sidebar-border p-4 bg-sidebar">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.email}
              </p>
              <p className="text-xs text-muted-foreground">{getRoleDisplay()}</p>
            </div>
          </div>
          <RouterNavLink 
            to="/reserves" 
            onClick={handleLinkClick}
            className="sidebar-link w-full mb-2 text-muted-foreground hover:text-foreground"
          >
            <ShieldCheck className="h-5 w-5" />
            Verify Reserves
          </RouterNavLink>
          <button
            onClick={() => {
              signOut();
              setOpen(false);
            }}
            className="sidebar-link w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
