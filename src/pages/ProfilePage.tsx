import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { User, Mail, Calendar, Shield, Lock, Wallet, Copy, ExternalLink } from 'lucide-react';

interface Profile {
  id: string;
  name: string | null;
  email: string;
  created_at: string;
  updated_at: string;
}

export default function ProfilePage() {
  const { user, isAdmin } = useAuth();
  const { evmAddress, solanaAddress, evmWalletType, solanaWalletType } = useWallet();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  
  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  async function fetchProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id)
      .maybeSingle();

    if (error) {
      toast.error('Failed to load profile');
      setIsLoading(false);
      return;
    }

    if (data) {
      setProfile(data);
      setName(data.name || '');
    }
    setIsLoading(false);
  }

  async function handleSave() {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: name.trim() || null })
        .eq('id', user.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, name: name.trim() || null } : null);
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePasswordChange() {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    } finally {
      setIsChangingPassword(false);
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout title="Profile" subtitle="Loading...">
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Profile" subtitle="Manage your account information">
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        {/* Profile Info Card */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Update your personal details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  value={profile?.email || user?.email || ''}
                  disabled
                  className="bg-muted"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>
            <Button 
              onClick={handleSave} 
              disabled={isSaving}
              className="gold-gradient"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Account Details Card */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Account Details
            </CardTitle>
            <CardDescription>
              Your account information and role
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Account Role</p>
                <p className="font-medium capitalize">
                  {isAdmin ? 'Administrator' : 'Standard User'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Account ID</p>
                <p className="font-mono text-sm truncate">{user?.id}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="font-medium">
                    {profile?.created_at 
                      ? new Date(profile.created_at).toLocaleDateString() 
                      : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Last Updated</p>
                <p className="font-medium">
                  {profile?.updated_at 
                    ? new Date(profile.updated_at).toLocaleDateString() 
                    : 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Connected Wallets Card */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Connected Wallets
            </CardTitle>
            <CardDescription>
              Your connected blockchain wallet addresses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>EVM Wallet Address</Label>
              {evmAddress ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 p-3 rounded-md bg-muted/50 border border-border">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="font-mono text-sm truncate">{evmAddress}</span>
                    <span className="text-xs text-muted-foreground capitalize">({evmWalletType})</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(evmAddress);
                      toast.success('Address copied!');
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => window.open(`https://etherscan.io/address/${evmAddress}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm p-3 rounded-md bg-muted/30 border border-border">
                  Not connected
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Solana Wallet Address</Label>
              {solanaAddress ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 p-3 rounded-md bg-muted/50 border border-border">
                    <div className="h-2 w-2 rounded-full bg-purple-500" />
                    <span className="font-mono text-sm truncate">{solanaAddress}</span>
                    <span className="text-xs text-muted-foreground capitalize">({solanaWalletType})</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(solanaAddress);
                      toast.success('Address copied!');
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => window.open(`https://solscan.io/account/${solanaAddress}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm p-3 rounded-md bg-muted/30 border border-border">
                  Not connected
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Password Change Card */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Change Password
            </CardTitle>
            <CardDescription>
              Update your account password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <Button 
              onClick={handlePasswordChange} 
              disabled={isChangingPassword || !newPassword || !confirmPassword}
              variant="outline"
            >
              {isChangingPassword ? 'Updating...' : 'Update Password'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
