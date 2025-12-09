import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Wallet, RefreshCw, Trash2, AlertTriangle, Copy, ExternalLink, Landmark, Wand2 } from 'lucide-react';
import { format } from 'date-fns';

interface EvmOpsWalletInfo {
  address: string;
  balance: string;
  network: string;
}

interface EvmFeePayerKey {
  id: string;
  public_key: string;
  label: string;
  network: string;
  is_active: boolean;
  is_generated: boolean;
  balance_native: number;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
}

interface EvmFeePayerTopup {
  id: string;
  fee_payer_public_key: string;
  network: string;
  amount_wei: string;
  tx_hash: string | null;
  created_at: string;
}

const EVM_NETWORKS = [
  { id: 'POLYGON', name: 'Polygon', symbol: 'MATIC', explorer: 'https://polygonscan.com' },
  { id: 'ETHEREUM', name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io' },
  { id: 'ARBITRUM', name: 'Arbitrum', symbol: 'ETH', explorer: 'https://arbiscan.io' },
  { id: 'BSC', name: 'BSC', symbol: 'BNB', explorer: 'https://bscscan.com' },
];

export default function AdminEvmFeePayersPage() {
  const [feePayers, setFeePayers] = useState<EvmFeePayerKey[]>([]);
  const [topups, setTopups] = useState<EvmFeePayerTopup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNetwork, setSelectedNetwork] = useState('POLYGON');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newFeePayer, setNewFeePayer] = useState({ label: '', public_key: '', network: 'POLYGON' });
  const [opsWallet, setOpsWallet] = useState<EvmOpsWalletInfo | null>(null);
  const [isLoadingOpsWallet, setIsLoadingOpsWallet] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateLabel, setGenerateLabel] = useState('');
  const [isRefreshingBalances, setIsRefreshingBalances] = useState(false);

  const fetchFeePayers = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('evm_fee_payer_keys')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      toast.error('Failed to load EVM fee payers');
      console.error(error);
    } else {
      setFeePayers(data || []);
    }
    setIsLoading(false);
  };

  const fetchTopups = async () => {
    const { data, error } = await supabase
      .from('evm_fee_payer_topups')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Failed to load topups:', error);
    } else {
      setTopups(data || []);
    }
  };

  const fetchOpsWalletInfo = async (network: string) => {
    setIsLoadingOpsWallet(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-evm-ops-wallet-info', {
        body: { network }
      });
      if (error) throw error;
      setOpsWallet(data);
    } catch (error) {
      console.error('Failed to fetch EVM OPS wallet info:', error);
      setOpsWallet(null);
    }
    setIsLoadingOpsWallet(false);
  };

  useEffect(() => {
    fetchFeePayers();
    fetchTopups();
    fetchOpsWalletInfo(selectedNetwork);
  }, []);

  useEffect(() => {
    fetchOpsWalletInfo(selectedNetwork);
  }, [selectedNetwork]);

  const handleAddFeePayer = async () => {
    if (!newFeePayer.label.trim() || !newFeePayer.public_key.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    // Basic EVM address validation
    if (!newFeePayer.public_key.match(/^0x[a-fA-F0-9]{40}$/)) {
      toast.error('Invalid EVM address format');
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase
      .from('evm_fee_payer_keys')
      .insert({
        label: newFeePayer.label.trim(),
        public_key: newFeePayer.public_key.trim().toLowerCase(),
        network: newFeePayer.network,
        is_active: true,
        is_generated: false
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('This address already exists');
      } else {
        toast.error('Failed to add fee payer');
      }
      console.error(error);
    } else {
      toast.success('EVM fee payer added successfully');
      setNewFeePayer({ label: '', public_key: '', network: 'POLYGON' });
      setIsAddModalOpen(false);
      fetchFeePayers();
    }
    setIsSubmitting(false);
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('evm_fee_payer_keys')
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

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this fee payer?')) return;

    const { error } = await supabase
      .from('evm_fee_payer_keys')
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

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied to clipboard');
  };

  const getNetworkInfo = (networkId: string) => {
    return EVM_NETWORKS.find(n => n.id === networkId) || EVM_NETWORKS[0];
  };

  const filteredFeePayers = feePayers.filter(fp => fp.network === selectedNetwork);
  const activeCount = filteredFeePayers.filter(fp => fp.is_active).length;
  const totalBalance = filteredFeePayers.reduce((sum, fp) => sum + (fp.balance_native || 0), 0);
  const networkInfo = getNetworkInfo(selectedNetwork);

  return (
    <DashboardLayout title="EVM Fee Payer Management" subtitle="Manage EVM fee payer wallets across multiple chains">
      <div className="space-y-6">
        {/* Network Selector */}
        <div className="flex items-center gap-4">
          <Label>Select Network:</Label>
          <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVM_NETWORKS.map(network => (
                <SelectItem key={network.id} value={network.id}>
                  {network.name} ({network.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* OPS Wallet Info Card */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">EVM Operations Wallet ({networkInfo.name})</CardTitle>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchOpsWalletInfo(selectedNetwork)}
                disabled={isLoadingOpsWallet}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isLoadingOpsWallet ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            <CardDescription>
              Internal wallet used to fund EVM fee payers on {networkInfo.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingOpsWallet ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : opsWallet ? (
              <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground mb-1">Address</div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                      {opsWallet.address}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyAddress(opsWallet.address)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <a
                      href={`${networkInfo.explorer}/address/${opsWallet.address}`}
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
                  <div className={`text-xl font-bold ${parseFloat(opsWallet.balance) < 0.1 ? 'text-destructive' : 'text-green-600'}`}>
                    {parseFloat(opsWallet.balance).toFixed(4)} {networkInfo.symbol}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" />
                EVM_OPS_PRIVATE_KEY is not configured or invalid.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fee Payers ({networkInfo.name})</CardDescription>
              <CardTitle className="text-2xl">{filteredFeePayers.length}</CardTitle>
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
              <CardDescription>Total Balance</CardDescription>
              <CardTitle className="text-2xl">{totalBalance.toFixed(4)} {networkInfo.symbol}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Topups</CardDescription>
              <CardTitle className="text-2xl">{topups.filter(t => t.network === selectedNetwork).length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant="default"
            onClick={async () => {
              const label = generateLabel.trim() || `Generated ${networkInfo.name} Wallet`;
              setIsGenerating(true);
              try {
                const { data, error } = await supabase.functions.invoke('generate-evm-fee-payer', {
                  body: { label, network: selectedNetwork }
                });
                if (error) throw error;
                toast.success(`Generated new ${networkInfo.name} fee payer: ${data.fee_payer.public_key.slice(0, 10)}...`);
                setGenerateLabel('');
                fetchFeePayers();
              } catch (error) {
                console.error('Failed to generate fee payer:', error);
                toast.error('Failed to generate fee payer');
              }
              setIsGenerating(false);
            }}
            disabled={isGenerating}
          >
            <Wand2 className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
            {isGenerating ? 'Generating...' : 'Generate Fee Payer'}
          </Button>
          <Button variant="outline" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add External
          </Button>
          <Button variant="outline" onClick={fetchFeePayers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh List
          </Button>
          <Button 
            variant="outline" 
            onClick={async () => {
              setIsRefreshingBalances(true);
              try {
                const { data, error } = await supabase.functions.invoke('refresh-evm-fee-payer-balances', {
                  body: { network: selectedNetwork }
                });
                if (error) throw error;
                toast.success(`Refreshed ${data.updated} fee payer balances`);
                fetchFeePayers();
              } catch (error) {
                console.error('Failed to refresh balances:', error);
                toast.error('Failed to refresh balances');
              }
              setIsRefreshingBalances(false);
            }}
            disabled={isRefreshingBalances}
          >
            <Wallet className={`h-4 w-4 mr-2 ${isRefreshingBalances ? 'animate-pulse' : ''}`} />
            {isRefreshingBalances ? 'Refreshing...' : 'Refresh Balances'}
          </Button>
        </div>

        {/* Optional Generate Label Input */}
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Custom Label (optional):</Label>
          <Input 
            placeholder={`Generated ${networkInfo.name} Wallet`}
            value={generateLabel}
            onChange={(e) => setGenerateLabel(e.target.value)}
            className="w-64"
          />
        </div>

        <Tabs defaultValue="fee-payers">
          <TabsList>
            <TabsTrigger value="fee-payers">Fee Payers</TabsTrigger>
            <TabsTrigger value="topups">Top-up History</TabsTrigger>
          </TabsList>

          <TabsContent value="fee-payers">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  {networkInfo.name} Fee Payers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : filteredFeePayers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No fee payers for {networkInfo.name}. Add one to get started.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead className="text-right">Balance ({networkInfo.symbol})</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Last Used</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFeePayers.map((fp) => (
                        <TableRow key={fp.id}>
                          <TableCell className="font-medium">
                            {fp.label}
                            {fp.is_generated && (
                              <Badge variant="outline" className="ml-2 text-xs">Generated</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <code className="text-xs font-mono">
                                {fp.public_key.slice(0, 6)}...{fp.public_key.slice(-4)}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={() => copyAddress(fp.public_key)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <a
                                href={`${networkInfo.explorer}/address/${fp.public_key}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={fp.balance_native < 0.05 ? 'text-destructive' : ''}>
                              {(fp.balance_native || 0).toFixed(4)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={fp.is_active}
                              onCheckedChange={() => handleToggleActive(fp.id, fp.is_active)}
                            />
                          </TableCell>
                          <TableCell>{fp.usage_count}</TableCell>
                          <TableCell>
                            {fp.last_used_at 
                              ? format(new Date(fp.last_used_at), 'MMM d, HH:mm')
                              : '-'
                            }
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(fp.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="topups">
            <Card>
              <CardHeader>
                <CardTitle>Top-up History ({networkInfo.name})</CardTitle>
              </CardHeader>
              <CardContent>
                {topups.filter(t => t.network === selectedNetwork).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No top-ups recorded for {networkInfo.name}.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fee Payer</TableHead>
                        <TableHead>Amount (Wei)</TableHead>
                        <TableHead>TX Hash</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topups
                        .filter(t => t.network === selectedNetwork)
                        .map((topup) => (
                          <TableRow key={topup.id}>
                            <TableCell>
                              <code className="text-xs font-mono">
                                {topup.fee_payer_public_key.slice(0, 6)}...{topup.fee_payer_public_key.slice(-4)}
                              </code>
                            </TableCell>
                            <TableCell className="font-mono">
                              {topup.amount_wei}
                            </TableCell>
                            <TableCell>
                              {topup.tx_hash ? (
                                <a
                                  href={`${networkInfo.explorer}/tx/${topup.tx_hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline flex items-center gap-1"
                                >
                                  {topup.tx_hash.slice(0, 10)}...
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {format(new Date(topup.created_at), 'MMM d, HH:mm')}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Fee Payer Modal */}
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add EVM Fee Payer</DialogTitle>
              <DialogDescription>
                Add an existing EVM wallet address as a fee payer.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="network">Network</Label>
                <Select 
                  value={newFeePayer.network} 
                  onValueChange={(v) => setNewFeePayer({ ...newFeePayer, network: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVM_NETWORKS.map(network => (
                      <SelectItem key={network.id} value={network.id}>
                        {network.name} ({network.symbol})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  placeholder="e.g., Polygon Fee Payer 1"
                  value={newFeePayer.label}
                  onChange={(e) => setNewFeePayer({ ...newFeePayer, label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="public_key">Wallet Address</Label>
                <Input
                  id="public_key"
                  placeholder="0x..."
                  value={newFeePayer.public_key}
                  onChange={(e) => setNewFeePayer({ ...newFeePayer, public_key: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the EVM wallet address (0x prefixed, 40 hex characters)
                </p>
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
    </DashboardLayout>
  );
}
