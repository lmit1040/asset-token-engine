import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrustAccountCard } from '@/components/trust/TrustAccountCard';
import { CreateTrustAccountModal } from '@/components/trust/CreateTrustAccountModal';
import { TrustInvoiceHistory } from '@/components/trust/TrustInvoiceHistory';
import { TrustRenewalReminder } from '@/components/trust/TrustRenewalReminder';
import { FeeNotice } from '@/components/fees/FeeNotice';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Building2, Plus, FileStack, Users, BarChart3 } from 'lucide-react';

interface TrustAccount {
  id: string;
  legal_name: string;
  entity_type: string;
  ein_last_four: string | null;
  formation_state: string | null;
  formation_date: string | null;
  is_active: boolean;
  annual_renewal_date: string | null;
  created_at: string;
}

export default function TrustDashboardPage() {
  const { user } = useAuth();
  const [trustAccounts, setTrustAccounts] = useState<TrustAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userTier, setUserTier] = useState<string>('RETAIL');

  const fetchData = async () => {
    if (!user) return;
    
    try {
      const [accountsRes, profileRes] = await Promise.all([
        supabase
          .from('trust_accounts')
          .select('*')
          .eq('owner_user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('pricing_tier')
          .eq('id', user.id)
          .single()
      ]);

      if (accountsRes.data) {
        setTrustAccounts(accountsRes.data);
      }
      if (profileRes.data) {
        setUserTier(profileRes.data.pricing_tier || 'RETAIL');
      }
    } catch (error) {
      console.error('Error fetching trust data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const upcomingRenewals = trustAccounts.filter(account => {
    if (!account.annual_renewal_date) return false;
    const renewalDate = new Date(account.annual_renewal_date);
    const today = new Date();
    const daysUntilRenewal = Math.ceil((renewalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilRenewal <= 60 && daysUntilRenewal >= 0;
  });

  if (userTier === 'RETAIL') {
    return (
      <DashboardLayout title="Trust Dashboard" subtitle="Manage your trust and LLC accounts">
        <div className="max-w-2xl mx-auto">
          <Card className="glass-card">
            <CardHeader className="text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>Upgrade to Trust Tier</CardTitle>
              <CardDescription>
                The Trust tier is designed for trusts, LLCs, SPVs, and family offices managing multiple assets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4">
                <div className="flex items-start gap-3">
                  <FileStack className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Multi-Asset Batch Uploads</p>
                    <p className="text-sm text-muted-foreground">Upload and manage multiple assets at once</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Asset Manager Review Queue</p>
                    <p className="text-sm text-muted-foreground">Priority review by dedicated asset managers</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <BarChart3 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Enhanced Reporting</p>
                    <p className="text-sm text-muted-foreground">Detailed analytics and compliance reports</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Starting at <span className="text-foreground font-semibold">$500/year</span> per trust account
                </p>
                <Button className="w-full" onClick={() => window.location.href = '/pricing'}>
                  View Pricing Plans
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Trust Dashboard" subtitle="Manage your trust and LLC accounts">
      <div className="space-y-6 animate-fade-in">
        {/* Renewal Reminders */}
        {upcomingRenewals.length > 0 && (
          <TrustRenewalReminder accounts={upcomingRenewals} />
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{trustAccounts.length}</p>
                  <p className="text-sm text-muted-foreground">Trust Accounts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <FileStack className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {trustAccounts.filter(a => a.is_active).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Active Accounts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{upcomingRenewals.length}</p>
                  <p className="text-sm text-muted-foreground">Renewals Due</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="accounts" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="accounts">Trust Accounts</TabsTrigger>
              <TabsTrigger value="invoices">Invoice History</TabsTrigger>
              <TabsTrigger value="fees">Fee Schedule</TabsTrigger>
            </TabsList>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Trust Account
            </Button>
          </div>

          <TabsContent value="accounts" className="space-y-4">
            {loading ? (
              <div className="grid gap-4">
                {[1, 2].map(i => (
                  <Card key={i} className="glass-card animate-pulse">
                    <CardContent className="h-32" />
                  </Card>
                ))}
              </div>
            ) : trustAccounts.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="py-12 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No Trust Accounts Yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first trust account to start managing assets
                  </p>
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Trust Account
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {trustAccounts.map(account => (
                  <TrustAccountCard 
                    key={account.id} 
                    account={account} 
                    onUpdate={fetchData} 
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="invoices">
            <TrustInvoiceHistory trustAccountIds={trustAccounts.map(a => a.id)} />
          </TabsContent>

          <TabsContent value="fees" className="space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">Trust Tier Fee Schedule</CardTitle>
                <CardDescription>
                  Fees are billed per trust account, not per user
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FeeNotice feeKey="ASSET_ONBOARDING" showMxuDiscount={true} />
                <FeeNotice feeKey="ANNUAL_VERIFICATION" showMxuDiscount={true} />
                <FeeNotice feeKey="VAULT_BASKET_TOKEN" showMxuDiscount={true} />
                <FeeNotice feeKey="BATCH_UPLOAD" showMxuDiscount={true} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showCreateModal && (
        <CreateTrustAccountModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchData();
          }}
        />
      )}
    </DashboardLayout>
  );
}
