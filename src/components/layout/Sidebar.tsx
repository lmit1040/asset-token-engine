import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Vault, 
  Coins, 
  Settings, 
  Users, 
  Shield,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Assets', href: '/assets', icon: Vault },
  { name: 'Tokens', href: '/tokens', icon: Coins },
];

const adminNavigation = [
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Assign Tokens', href: '/admin/assign', icon: Shield },
];

export function Sidebar() {
  const location = useLocation();
  const { isAdmin, signOut, user } = useAuth();

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-sidebar-border">
        <div className="h-8 w-8 rounded-lg gold-gradient flex items-center justify-center">
          <Vault className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-bold gold-text">MetallumX</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <div className="mb-4">
          <p className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Main
          </p>
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
            return (
              <RouterNavLink
                key={item.name}
                to={item.href}
                className={cn(
                  'sidebar-link',
                  isActive && 'active'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </RouterNavLink>
            );
          })}
        </div>

        {isAdmin && (
          <div className="pt-4 border-t border-sidebar-border">
            <p className="px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Admin
            </p>
            {adminNavigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <RouterNavLink
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'sidebar-link',
                    isActive && 'active'
                  )}
                >
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
            <span className="text-sm font-medium text-primary">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.email}
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {isAdmin ? 'Administrator' : 'User'}
            </p>
          </div>
        </div>
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
