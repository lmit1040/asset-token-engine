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
import { Plus, Wallet, RefreshCw, Trash2, AlertTriangle, Zap, Sparkles, Copy, ExternalLink, Landmark, Activity, TrendingDown, CheckCircle2, Fuel } from 'lucide-react';
import { format } from 'date-fns';
import { OpsWalletTransactionHistory } from '@/components/wallet/OpsWalletTransactionHistory';

interface OpsWalletInfo {
  publicKey: string;
  balanceSol: number;
}

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

interface GeneratedOpsKeypair {
  publicKey: string;
  secretKeyArray: number[];
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
  const [opsWallet, setOpsWallet] = useState<OpsWalletInfo | null>(null);
  const [isLoadingOpsWallet, setIsLoadingOpsWallet] = useState(false);
  const [isGeneratingOpsWallet, setIsGeneratingOpsWallet] = useState(false);
  const [generatedOpsKeypair, setGeneratedOpsKeypair] = useState<GeneratedOpsKeypair | null>(null);
  const [isOpsKeypairModalOpen, setIsOpsKeypairModalOpen] = useState(false);

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

  const fetchOpsWalletInfo = async () => {
    setIsLoadingOpsWallet(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-ops-wallet-info');
      if (error) throw error;
      setOpsWallet(data);
    } catch (error) {
      console.error('Failed to fetch OPS wallet info:', error);
    }
    setIsLoadingOpsWallet(false);
  };

  const handleGenerateOpsWallet = async () => {
    setIsGeneratingOpsWallet(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-ops-wallet-keypair');
      if (error) throw error;
      if (data.success) {
        setGeneratedOpsKeypair({
          publicKey: data.publicKey,
          secretKeyArray: data.secretKeyArray
        });
        setIsOpsKeypairModalOpen(true);
      } else {
        throw new Error(data.error || 'Failed to generate keypair');
      }
    } catch (error) {
      console.error('Failed to generate OPS wallet:', error);
      toast.error('Failed to generate OPS wallet keypair');
    }
    setIsGeneratingOpsWallet(false);
  };

  const copySecretKeyArray = () => {
    if (generatedOpsKeypair) {
      navigator.clipboard.writeText(JSON.stringify(generatedOpsKeypair.secretKeyArray));
      toast.success('Secret key array copied! Now save it as OPS_WALLET_SECRET_KEY.');
    }
  };

  useEffect(() => {
    fetchFeePayers();
    fetchOpsWalletInfo();
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
        {/* OPS Wallet Info Card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Operations Wallet (OPS_WALLET)</CardTitle>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchOpsWalletInfo}
                disabled={isLoadingOpsWallet}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingOpsWallet ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            <CardDescription>
              Internal wallet used to fund fee payers. Fund this wallet with Devnet SOL.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingOpsWallet ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : opsWallet ? (
              <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-1">Public Key</div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                      {opsWallet.publicKey}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        navigator.clipboard.writeText(opsWallet.publicKey);
                        toast.success('OPS wallet address copied!');
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <a
                      href={`https://solscan.io/account/${opsWallet.publicKey}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Balance</div>
                  <div className={`text-xl font-bold ${opsWallet.balanceSol < 0.1 ? 'text-destructive' : 'text-green-600'}`}>
                    {opsWallet.balanceSol.toFixed(4)} SOL
                  </div>
                </div>
                <a
                  href="https://faucet.solana.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Get Devnet SOL
                  </Button>
                </a>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                <div className="flex-1 text-destructive text-sm">
                  OPS_WALLET_SECRET_KEY is not configured or has invalid format.
                </div>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={handleGenerateOpsWallet}
                  disabled={isGeneratingOpsWallet}
                >
                  <Sparkles className={`h-3 w-3 mr-1 ${isGeneratingOpsWallet ? 'animate-spin' : ''}`} />
                  {isGeneratingOpsWallet ? 'Generating...' : 'Generate OPS Wallet Keypair'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* OPS Wallet Keypair Modal */}
        <Dialog open={isOpsKeypairModalOpen} onOpenChange={setIsOpsKeypairModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>OPS Wallet Keypair Generated</DialogTitle>
              <DialogDescription>
                Copy the secret key array below and save it as <code className="bg-muted px-1 rounded">OPS_WALLET_SECRET_KEY</code> in your Supabase secrets.
              </DialogDescription>
            </DialogHeader>
            {generatedOpsKeypair && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Public Key</Label>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-3 py-2 rounded font-mono flex-1 break-all">
                      {generatedOpsKeypair.publicKey}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedOpsKeypair.publicKey);
                        toast.success('Public key copied!');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Secret Key Array (save as OPS_WALLET_SECRET_KEY)</Label>
                  <div className="relative">
                    <pre className="text-xs bg-muted px-3 py-2 rounded font-mono overflow-x-auto max-h-32 overflow-y-auto">
                      {JSON.stringify(generatedOpsKeypair.secretKeyArray)}
                    </pre>
                    <Button
                      variant="default"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={copySecretKeyArray}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-md text-sm">
                  <AlertTriangle className="h-4 w-4 inline mr-2 text-amber-500" />
                  <strong>Important:</strong> Save this secret key array now! Once you close this dialog, you cannot retrieve it again. 
                  Go to your Supabase project → Settings → Secrets and add/update <code className="bg-muted px-1 rounded">OPS_WALLET_SECRET_KEY</code> with the copied value.
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsOpsKeypairModalOpen(false)}>
                Close
              </Button>
              <Button onClick={() => {
                copySecretKeyArray();
                window.open('https://supabase.com/dashboard/project/hqohcfwahmkxtpfbhcku/settings/secrets', '_blank');
              }}>
                Copy & Open Secrets
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Health Monitoring Dashboard */}
        {(() => {
          const LOW_BALANCE_THRESHOLD = 0.05;
          const CRITICAL_THRESHOLD = 0.01;
          const lowBalancePayors = feePayers.filter(fp => fp.is_active && (fp.balance_sol || 0) < LOW_BALANCE_THRESHOLD);
          const criticalPayors = feePayers.filter(fp => fp.is_active && (fp.balance_sol || 0) < CRITICAL_THRESHOLD);
          const healthyPayors = feePayers.filter(fp => fp.is_active && (fp.balance_sol || 0) >= LOW_BALANCE_THRESHOLD);
          const healthScore = feePayers.length > 0 
            ? Math.round((healthyPayors.length / Math.max(1, feePayers.filter(fp => fp.is_active).length)) * 100) 
            : 100;
          const healthStatus = healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'warning' : 'critical';
          
          return (
            <Card className={`border-2 ${
              healthStatus === 'critical' ? 'border-destructive bg-destructive/5' :
              healthStatus === 'warning' ? 'border-amber-500 bg-amber-500/5' :
              'border-green-500 bg-green-500/5'
            }`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className={`h-5 w-5 ${
                      healthStatus === 'critical' ? 'text-destructive' :
                      healthStatus === 'warning' ? 'text-amber-500' :
                      'text-green-500'
                    }`} />
                    <CardTitle className="text-lg">Fee Payer Health (Solana)</CardTitle>
                  </div>
                  <Badge variant={healthStatus === 'critical' ? 'destructive' : healthStatus === 'warning' ? 'secondary' : 'default'} className={
                    healthStatus === 'healthy' ? 'bg-green-500 hover:bg-green-600' : ''
                  }>
                    {healthScore}% Healthy
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                    <div>
                      <div className="text-2xl font-bold text-green-600">{healthyPayors.length}</div>
                      <div className="text-xs text-muted-foreground">Healthy (≥{LOW_BALANCE_THRESHOLD} SOL)</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <TrendingDown className="h-8 w-8 text-amber-500" />
                    <div>
                      <div className="text-2xl font-bold text-amber-600">{lowBalancePayors.length - criticalPayors.length}</div>
                      <div className="text-xs text-muted-foreground">Low Balance (&lt;{LOW_BALANCE_THRESHOLD} SOL)</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                    <div>
                      <div className="text-2xl font-bold text-destructive">{criticalPayors.length}</div>
                      <div className="text-xs text-muted-foreground">Critical (&lt;{CRITICAL_THRESHOLD} SOL)</div>
                    </div>
                  </div>
                </div>
                
                {lowBalancePayors.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">Wallets Needing Attention:</div>
                    <div className="flex flex-wrap gap-2">
                      {lowBalancePayors.map(fp => (
                        <Badge 
                          key={fp.id} 
                          variant="outline" 
                          className={`${
                            (fp.balance_sol || 0) < CRITICAL_THRESHOLD 
                              ? 'border-destructive text-destructive' 
                              : 'border-amber-500 text-amber-600'
                          }`}
                        >
                          {fp.label}: {(fp.balance_sol || 0).toFixed(4)} SOL
                        </Badge>
                      ))}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="mt-2"
                      onClick={runTopUp}
                      disabled={isToppingUp}
                    >
                      <Fuel className="h-3 w-3 mr-1" />
                      {isToppingUp ? 'Topping Up...' : 'Top Up Low Balances'}
                    </Button>
                  </div>
                )}
                
                {lowBalancePayors.length === 0 && (
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    All active fee payers have sufficient balance.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

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

        {/* OPS Wallet Transaction History */}
        <OpsWalletTransactionHistory />
      </div>
    </DashboardLayout>
  );
}
