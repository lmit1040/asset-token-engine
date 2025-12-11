import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Coins,
  User,
  Users,
  Shield,
  Activity,
  RefreshCw,
  Send,
  LogOut,
  Award,
  Vote,
  ArrowRightLeft,
  FileCheck,
  Wallet,
  Globe,
  FileUp,
  FolderOpen,
  ClipboardList,
  Archive,
  Zap,
  ShieldCheck,
  Bot,
  Newspaper,
  FileText,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Assets", href: "/assets", icon: Package },
  { name: "Tokens", href: "/tokens", icon: Coins },
  { name: "Transfers", href: "/transfers", icon: ArrowRightLeft },
  { name: "Submit Asset", href: "/submit-asset", icon: FileUp },
  { name: "My Submissions", href: "/my-submissions", icon: FolderOpen },
  { name: "MXU Benefits", href: "/mxu-benefits", icon: Award },
  { name: "Governance", href: "/governance", icon: Vote },
  { name: "Profile", href: "/profile", icon: User },
];

const adminNavigation = [
  { name: "Users", href: "/admin/users", icon: Users },
  { name: "Review Submissions", href: "/admin/submissions", icon: ClipboardList },
  { name: "Token Proposals", href: "/admin/token-proposals", icon: FileText },
  { name: "Assign Tokens", href: "/admin/assign", icon: Shield },
  { name: "Transfer Tokens", href: "/admin/transfer", icon: RefreshCw },
  { name: "On-Chain Delivery", href: "/admin/deliver", icon: Send },
  { name: "Attestations", href: "/admin/attestations", icon: FileCheck },
  { name: "Fee Payers (SOL)", href: "/admin/fee-payers", icon: Wallet },
  { name: "Fee Payers (EVM)", href: "/admin/evm-fee-payers", icon: Globe },
  { name: "Arbitrage", href: "/admin/arbitrage/strategies", icon: Zap },
  { name: "Auto Arbitrage", href: "/admin/arbitrage/automation", icon: Bot },
  { name: "News", href: "/admin/news", icon: Newspaper },
  { name: "Archived", href: "/admin/archived", icon: Archive },
  { name: "Activity", href: "/admin/activity", icon: Activity },
];

export function Sidebar() {
  const location = useLocation();
  const { isAdmin, isAssetManager, role, signOut, user } = useAuth();

  const getRoleDisplay = () => {
    if (role === "admin") return "Administrator";
    if (role === "asset_manager") return "Asset Manager";
    return "User";
  };

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex h-40 items-center gap-3 px-6 border-b border-sidebar-border">
        <img src="/assets/MetallumXLogo.png" alt="MetallumX" className="h-40 w-auto" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <div className="mb-4">
          <p className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Main</p>
          {navigation.map((item) => {
            const isActive =
              location.pathname === item.href ||
              (item.href !== "/dashboard" && location.pathname.startsWith(item.href));
            return (
              <RouterNavLink key={item.name} to={item.href} className={cn("sidebar-link", isActive && "active")}>
                <item.icon className="h-5 w-5" />
                {item.name}
              </RouterNavLink>
            );
          })}
        </div>

        {(isAdmin || isAssetManager) && (
          <div className="pt-4 border-t border-sidebar-border">
            <p className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {isAdmin ? "Admin" : "Manager"}
            </p>
            {adminNavigation
              .filter((item) => {
                // Asset managers only see Review Submissions
                if (!isAdmin && isAssetManager) {
                  return item.href === "/admin/submissions";
                }
                return true;
              })
              .map((item) => {
                const isActive = location.pathname.startsWith(item.href);
                return (
                  <RouterNavLink key={item.name} to={item.href} className={cn("sidebar-link", isActive && "active")}>
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </RouterNavLink>
                );
              })}
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">{user?.email?.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{user?.email}</p>
            <p className="text-xs text-muted-foreground">{getRoleDisplay()}</p>
          </div>
        </div>
        <RouterNavLink to="/reserves" className="sidebar-link w-full mb-2 text-muted-foreground hover:text-foreground">
          <ShieldCheck className="h-5 w-5" />
          Verify Reserves
        </RouterNavLink>
        <button
          onClick={signOut}
          className="sidebar-link w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
