import { useEffect, useState } from 'react';
import { Users, Shield, ShieldCheck, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Profile, UserRole, AppRole, APP_ROLE_LABELS } from '@/types/database';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UserWithRole extends Profile {
  role: AppRole;
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleChangeDialog, setRoleChangeDialog] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    currentRole: AppRole;
    newRole: AppRole;
  } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setIsLoading(true);
    try {
      // Fetch all profiles (admin can see all)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.id);
        return {
          ...profile,
          role: (userRole?.role as AppRole) || 'standard_user',
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }

  const handleRoleChange = async () => {
    if (!roleChangeDialog) return;

    const { userId, newRole } = roleChangeDialog;

    try {
      // Check if user already has a role entry
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });

        if (error) throw error;
      }

      toast.success(`Role updated to ${newRole}`);
      setRoleChangeDialog(null);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update role');
    }
  };

  const filteredUsers = users.filter((user) =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const initiateRoleChange = (user: UserWithRole, newRole: AppRole) => {
    if (user.id === currentUser?.id) {
      toast.error("You cannot change your own role");
      return;
    }
    
    setRoleChangeDialog({
      open: true,
      userId: user.id,
      userName: user.name || user.email,
      currentRole: user.role,
      newRole,
    });
  };

  return (
    <DashboardLayout
      title="User Management"
      subtitle="Manage user accounts and roles"
      requireAdmin
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold text-foreground">{users.length}</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-2xl font-bold text-foreground">
                  {users.filter((u) => u.role === 'admin').length}
                </p>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Asset Managers</p>
                <p className="text-2xl font-bold text-foreground">
                  {users.filter((u) => u.role === 'asset_manager').length}
                </p>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Standard Users</p>
                <p className="text-2xl font-bold text-foreground">
                  {users.filter((u) => u.role === 'standard_user').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="glass-card p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 input-dark"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="glass-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No users found.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="text-left py-3 px-4">User</th>
                  <th className="text-left py-3 px-4">Role</th>
                  <th className="text-left py-3 px-4">Joined</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {user.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {user.name || 'No name'}
                            {user.id === currentUser?.id && (
                              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span
                        className={
                          user.role === 'admin'
                            ? 'badge-gold'
                            : user.role === 'asset_manager'
                            ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2.5 py-0.5 rounded-full text-xs font-medium'
                            : 'bg-muted text-muted-foreground px-2.5 py-0.5 rounded-full text-xs font-medium'
                        }
                      >
                        {APP_ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="table-cell text-muted-foreground">
                      {format(new Date(user.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="table-cell text-right">
                      <Select
                        value={user.role}
                        onValueChange={(value) => initiateRoleChange(user, value as AppRole)}
                        disabled={user.id === currentUser?.id}
                      >
                        <SelectTrigger className="w-[140px] input-dark">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard_user">Standard User</SelectItem>
                          <SelectItem value="asset_manager">Asset Manager</SelectItem>
                          <SelectItem value="admin">Administrator</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Role Change Confirmation Dialog */}
      <AlertDialog open={roleChangeDialog?.open} onOpenChange={(open) => !open && setRoleChangeDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change User Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change <strong>{roleChangeDialog?.userName}</strong>'s role
              from <strong>{roleChangeDialog?.currentRole ? APP_ROLE_LABELS[roleChangeDialog.currentRole] : ''}</strong> to{' '}
              <strong>{roleChangeDialog?.newRole ? APP_ROLE_LABELS[roleChangeDialog.newRole] : ''}</strong>?
              {roleChangeDialog?.newRole === 'admin' && (
                <span className="block mt-2 text-destructive">
                  Warning: Administrators have full access to manage assets, tokens, and other users.
                </span>
              )}
              {roleChangeDialog?.newRole === 'asset_manager' && (
                <span className="block mt-2 text-amber-500">
                  Note: Asset Managers can review user asset submissions and mark them as "Under Review".
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleChange}>Confirm Change</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
