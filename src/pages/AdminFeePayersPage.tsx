import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Wallet, RefreshCw, Trash2, AlertTriangle, Zap, Sparkles, Copy, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface FeePayerKey {
  id: string;
  public_key: string;
  label: string;
  is_active: boolean;
  last_used_at: string | null;
  balance_sol: number;
  usage_count: number;
  created_at: string;
  is_generated: boolean;
}

export default function AdminFeePayersPage() {
  const [feePayers, setFeePayers] = useState<FeePayerKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isToppingUp, setIsToppingUp] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newFeePayer, setNewFeePayer] = useState({ label: '', public_key: '' });
  const [generateLabel, setGenerateLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFeePayers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('fee_payer_keys')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      toast.error('Failed to load fee payers');
      console.error(error);
    } else {
      setFeePayers(data as FeePayerKey[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchFeePayers();
  }, []);

  const handleAddFeePayer = async () => {
    if (!newFeePayer.label.trim() || !newFeePayer.public_key.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    // Basic Solana public key validation (base58, 32-44 chars)
    if (newFeePayer.public_key.length < 32 || newFeePayer.public_key.length > 44) {
      toast.error('Invalid Solana public key format');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase
      .from('fee_payer_keys')
      .insert({
        label: newFeePayer.label.trim(),
        public_key: newFeePayer.public_key.trim(),
        is_active: true,
        is_generated: false
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('This public key already exists');
      } else {
        toast.error('Failed to add fee payer');
      }
      console.error(error);
    } else {
      toast.success('Fee payer added successfully');
      setNewFeePayer({ label: '', public_key: '' });
      setIsAddModalOpen(false);
      fetchFeePayers();
    }
    setIsSubmitting(false);
  };

  const handleGenerateFeePayer = async () => {
    const label = generateLabel.trim() || `Generated Wallet ${feePayers.length + 1}`;
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-fee-payer', {
        body: { label }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Wallet generated: ${data.fee_payer.public_key.slice(0, 8)}...`);
        setGenerateLabel('');
        setIsGenerateModalOpen(false);
        fetchFeePayers();
      } else {
        throw new Error(data.error || 'Failed to generate wallet');
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate fee payer wallet');
    }
    setIsGenerating(false);
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('fee_payer_keys')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update status');
      console.error(error);
    } else {
      toast.success(`Fee payer ${!currentStatus ? 'activated' : 'deactivated'}`);
      fetchFeePayers();
    }
  };

  const handleDelete = async (id: string, isGenerated: boolean) => {
    const message = isGenerated 
      ? 'Are you sure you want to delete this generated wallet? The private key will be permanently lost.'
      : 'Are you sure you want to delete this fee payer?';
    
    if (!confirm(message)) return;

    const { error } = await supabase
      .from('fee_payer_keys')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete fee payer');
      console.error(error);
    } else {
      toast.success('Fee payer deleted');
      fetchFeePayers();
    }
  };

  const copyPublicKey = (publicKey: string) => {
    navigator.clipboard.writeText(publicKey);
    toast.success('Public key copied to clipboard');
  };

  const refreshBalances = async () => {
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('refresh-fee-payer-balances');
      if (error) throw error;
      toast.success('Balances refreshed');
      fetchFeePayers();
    } catch (error) {
      console.error(error);
      toast.error('Failed to refresh balances');
    }
    setIsRefreshing(false);
  };

  const runTopUp = async () => {
    setIsToppingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('top-up-fee-payers');
      if (error) throw error;
      const toppedUp = data.results?.filter((r: { topped_up: boolean }) => r.topped_up).length || 0;
      toast.success(`Top-up complete: ${toppedUp} wallets funded`);
      console.log('Top-up results:', data);
      fetchFeePayers();
    } catch (error) {
      console.error(error);
      toast.error('Failed to run top-up');
    }
    setIsToppingUp(false);
  };

  const activeCount = feePayers.filter(fp => fp.is_active).length;
  const generatedCount = feePayers.filter(fp => fp.is_generated).length;
  const totalBalance = feePayers.reduce((sum, fp) => sum + (fp.balance_sol || 0), 0);

  return (
    <DashboardLayout title="Fee Payer Management" subtitle="Manage Solana fee payer wallets for transaction costs">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Fee Payers</CardDescription>
              <CardTitle className="text-2xl">{feePayers.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Fee Payers</CardDescription>
              <CardTitle className="text-2xl text-green-600">{activeCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Generated Wallets</CardDescription>
              <CardTitle className="text-2xl text-primary">{generatedCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total SOL Balance</CardDescription>
              <CardTitle className="text-2xl">{totalBalance.toFixed(4)} SOL</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={refreshBalances}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh Balances
            </Button>
            <Button 
              variant="outline" 
              onClick={runTopUp}
              disabled={isToppingUp}
            >
              <Zap className={`h-4 w-4 mr-2 ${isToppingUp ? 'animate-pulse' : ''}`} />
              {isToppingUp ? 'Topping Up...' : 'Run Top-Up Check'}
            </Button>
          </div>

          <div className="flex gap-2">
            {/* Generate Wallet Modal */}
            <Dialog open={isGenerateModalOpen} onOpenChange={setIsGenerateModalOpen}>
              <DialogTrigger asChild>
                <Button variant="default">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate New Wallet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate New Fee Payer Wallet</DialogTitle>
                  <DialogDescription>
                    Generate a new Solana wallet exclusively for this application. The private key will be securely encrypted and stored.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="generate-label">Label (optional)</Label>
                    <Input
                      id="generate-label"
                      placeholder="e.g., Primary Fee Payer"
                      value={generateLabel}
                      onChange={(e) => setGenerateLabel(e.target.value)}
                    />
                  </div>
                  <div className="bg-primary/10 border border-primary/20 p-3 rounded-md text-sm">
                    <Sparkles className="h-4 w-4 inline mr-2 text-primary" />
                    A new Solana keypair will be generated. The private key will be encrypted and stored securely in the database, never exposed to the frontend.
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsGenerateModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleGenerateFeePayer} disabled={isGenerating}>
                    {isGenerating ? 'Generating...' : 'Generate Wallet'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Add External Wallet Modal */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add External Wallet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add External Fee Payer</DialogTitle>
                  <DialogDescription>
                    Add an existing Solana wallet to be used for paying transaction fees.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="label">Label</Label>
                    <Input
                      id="label"
                      placeholder="e.g., Backup Fee Payer"
                      value={newFeePayer.label}
                      onChange={(e) => setNewFeePayer({ ...newFeePayer, label: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="public_key">Solana Public Key</Label>
                    <Input
                      id="public_key"
                      placeholder="e.g., 7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q"
                      value={newFeePayer.public_key}
                      onChange={(e) => setNewFeePayer({ ...newFeePayer, public_key: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="bg-muted p-3 rounded-md text-sm text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 inline mr-2" />
                    Note: External wallets cannot be used for automated transactions. Use "Generate New Wallet" for full functionality.
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddFeePayer} disabled={isSubmitting}>
                    {isSubmitting ? 'Adding...' : 'Add Fee Payer'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Fee Payers Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Fee Payer Wallets
            </CardTitle>
            <CardDescription>
              Wallets used to pay Solana transaction fees for token deployments and transfers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : feePayers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No fee payers configured. Generate a new wallet to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Public Key</TableHead>
                    <TableHead className="text-right">Balance (SOL)</TableHead>
                    <TableHead className="text-right">Usage Count</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feePayers.map((fp) => (
                    <TableRow key={fp.id}>
                      <TableCell className="font-medium">{fp.label}</TableCell>
                      <TableCell>
                        <Badge variant={fp.is_generated ? 'default' : 'outline'}>
                          {fp.is_generated ? (
                            <><Sparkles className="h-3 w-3 mr-1" />Generated</>
                          ) : (
                            'External'
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {fp.public_key.slice(0, 8)}...{fp.public_key.slice(-6)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyPublicKey(fp.public_key)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <a
                            href={`https://solscan.io/account/${fp.public_key}?cluster=devnet`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={fp.balance_sol < 0.01 ? 'text-destructive font-medium' : ''}>
                          {fp.balance_sol.toFixed(4)}
                        </span>
                        {fp.balance_sol < 0.01 && (
                          <AlertTriangle className="h-4 w-4 inline ml-1 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">{fp.usage_count}</TableCell>
                      <TableCell>
                        {fp.last_used_at 
                          ? format(new Date(fp.last_used_at), 'MMM d, HH:mm')
                          : <span className="text-muted-foreground">Never</span>
                        }
                      </TableCell>
                      <TableCell>
                        <Badge variant={fp.is_active ? 'default' : 'secondary'}>
                          {fp.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Switch
                            checked={fp.is_active}
                            onCheckedChange={() => handleToggleActive(fp.id, fp.is_active)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(fp.id, fp.is_generated)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
