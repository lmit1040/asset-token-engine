import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { FeeTypeBadge } from '@/components/fees/FeeTypeBadge';
import { FeeType, FeeCategory, PricingTier, FEE_CATEGORY_LABELS, TIER_LABELS } from '@/types/fees';
import { DollarSign, History, Edit2, Save, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface FeeCatalogItem {
  id: string;
  fee_key: string;
  tier: string;
  description: string;
  amount_cents: number;
  fee_type: FeeType;
  applies_to: FeeCategory;
  enabled: boolean;
  created_at: string;
}

interface FeeVersion {
  id: string;
  fee_key: string;
  old_amount_cents: number;
  new_amount_cents: number;
  effective_date: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export default function AdminFeesPage() {
  const [fees, setFees] = useState<FeeCatalogItem[]>([]);
  const [versions, setVersions] = useState<FeeVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [editingFee, setEditingFee] = useState<FeeCatalogItem | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    
    const [feesResult, versionsResult] = await Promise.all([
      supabase.from('fee_catalog').select('*').order('tier').order('applies_to'),
      supabase.from('fee_versions').select('*').order('created_at', { ascending: false }).limit(50)
    ]);

    if (feesResult.data) {
      setFees(feesResult.data as FeeCatalogItem[]);
    }
    if (versionsResult.data) {
      setVersions(versionsResult.data as FeeVersion[]);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredFees = selectedTier === 'ALL' 
    ? fees 
    : fees.filter(f => f.tier === selectedTier);

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  };

  const handleEditClick = (fee: FeeCatalogItem) => {
    setEditingFee(fee);
    setEditAmount((fee.amount_cents / 100).toFixed(2));
    setEditReason('');
  };

  const handleSave = async () => {
    if (!editingFee || !editReason.trim()) {
      toast.error('Please provide a reason for the fee change');
      return;
    }

    const newAmountCents = Math.round(parseFloat(editAmount) * 100);
    if (isNaN(newAmountCents) || newAmountCents < 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setSaving(true);

    // First insert version record manually (trigger won't capture reason)
    const { error: versionError } = await supabase
      .from('fee_versions')
      .insert({
        fee_key: editingFee.fee_key,
        old_amount_cents: editingFee.amount_cents,
        new_amount_cents: newAmountCents,
        reason: editReason.trim(),
      });

    if (versionError) {
      toast.error('Failed to log fee change');
      setSaving(false);
      return;
    }

    // Update fee amount
    const { error } = await supabase
      .from('fee_catalog')
      .update({ amount_cents: newAmountCents })
      .eq('id', editingFee.id);

    if (error) {
      toast.error('Failed to update fee');
    } else {
      toast.success('Fee updated successfully');
      setEditingFee(null);
      fetchData();
    }

    setSaving(false);
  };

  const handleToggleEnabled = async (fee: FeeCatalogItem) => {
    const { error } = await supabase
      .from('fee_catalog')
      .update({ enabled: !fee.enabled })
      .eq('id', fee.id);

    if (error) {
      toast.error('Failed to update fee status');
    } else {
      toast.success(`Fee ${!fee.enabled ? 'enabled' : 'disabled'}`);
      fetchData();
    }
  };

  // Stats
  const totalFees = fees.length;
  const feesByTier = fees.reduce((acc, fee) => {
    acc[fee.tier] = (acc[fee.tier] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const recentChanges = versions.filter(v => {
    const date = new Date(v.created_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return date > weekAgo;
  }).length;

  if (loading) {
    return (
      <DashboardLayout title="Fee Management">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Fee Management">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Active Fees</CardDescription>
              <CardTitle className="text-3xl">{totalFees}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fees by Tier</CardDescription>
              <CardTitle className="flex gap-2 flex-wrap text-sm">
                {Object.entries(feesByTier).map(([tier, count]) => (
                  <Badge key={tier} variant="secondary">{tier}: {count}</Badge>
                ))}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Changes (7 Days)</CardDescription>
              <CardTitle className="text-3xl">{recentChanges}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="fees">
          <TabsList>
            <TabsTrigger value="fees" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Fee Catalog
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Version History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fees" className="mt-6">
            {/* Tier Filter */}
            <div className="mb-4 flex gap-2">
              <Button 
                variant={selectedTier === 'ALL' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSelectedTier('ALL')}
              >
                All
              </Button>
              {(['RETAIL', 'TRUST', 'ENTERPRISE'] as PricingTier[]).map((tier) => (
                <Button 
                  key={tier}
                  variant={selectedTier === tier ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setSelectedTier(tier)}
                >
                  {TIER_LABELS[tier]}
                </Button>
              ))}
            </div>

            {/* Fees Table */}
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fee Key</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFees.map((fee) => (
                    <TableRow key={fee.id}>
                      <TableCell className="font-mono text-xs">{fee.fee_key}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{fee.description}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{fee.tier}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {FEE_CATEGORY_LABELS[fee.applies_to]}
                      </TableCell>
                      <TableCell>
                        <FeeTypeBadge feeType={fee.fee_type} />
                      </TableCell>
                      <TableCell className="font-semibold text-primary">
                        {formatAmount(fee.amount_cents)}
                      </TableCell>
                      <TableCell>
                        <Switch 
                          checked={fee.enabled} 
                          onCheckedChange={() => handleToggleEnabled(fee)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleEditClick(fee)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Fee Change History</CardTitle>
                <CardDescription>
                  All fee modifications are logged for compliance and audit purposes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {versions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No fee changes recorded yet
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Fee Key</TableHead>
                        <TableHead>Old Amount</TableHead>
                        <TableHead>New Amount</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map((version) => {
                        const change = version.new_amount_cents - version.old_amount_cents;
                        const changePercent = ((change / version.old_amount_cents) * 100).toFixed(1);
                        return (
                          <TableRow key={version.id}>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(version.created_at), 'MMM d, yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{version.fee_key}</TableCell>
                            <TableCell>{formatAmount(version.old_amount_cents)}</TableCell>
                            <TableCell className="font-semibold">{formatAmount(version.new_amount_cents)}</TableCell>
                            <TableCell>
                              <Badge variant={change > 0 ? 'destructive' : 'default'}>
                                {change > 0 ? '+' : ''}{formatAmount(change)} ({changePercent}%)
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-muted-foreground">
                              {version.reason || 'Manual update'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingFee} onOpenChange={() => setEditingFee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Fee</DialogTitle>
            <DialogDescription>
              Update the fee amount. A reason is required for audit purposes.
            </DialogDescription>
          </DialogHeader>
          
          {editingFee && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-sm font-medium">{editingFee.description}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">{editingFee.fee_key}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">New Amount (USD)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Current: {formatAmount(editingFee.amount_cents)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Change *</Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., Annual price adjustment, market alignment..."
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  rows={3}
                />
                {!editReason.trim() && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    A reason is required to save changes
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFee(null)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !editReason.trim()}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
