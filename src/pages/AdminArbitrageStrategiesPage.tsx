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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Play, Zap, RefreshCw, AlertTriangle, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

// Supported Solana DEXs by Jupiter Aggregator
const SUPPORTED_SOLANA_DEXS = [
  'Raydium',
  'Raydium CLMM',
  'Raydium CP',
  'Orca',
  'Orca (Whirlpools)',
  'Whirlpool',
  'Meteora',
  'Meteora DLMM',
  'Phoenix',
  'Lifinity',
  'Lifinity V2',
  'Cropper',
  'Cykura',
  'Saros',
  'Step Finance',
  'Penguin',
  'Sencha',
  'Saber',
  'Aldrin',
  'Crema',
  'Invariant',
  'Marinade',
  'Stepn',
  'OpenBook',
  'Serum',
  'GooseFX',
  'Dradex',
  'Balansol',
  'Marco Polo',
  'Oasis',
  'BonkSwap',
  'Pump.fun',
  'FluxBeam',
  'Helium Network',
  'Jupiter',
];

// Supported EVM DEXs
const SUPPORTED_EVM_DEXS = [
  'Uniswap V2',
  'Uniswap V3',
  'SushiSwap',
  'Aave V3',
  'QuickSwap',
  'PancakeSwap',
  '1inch',
  'Curve',
  'Balancer',
];

// EVM Networks
const EVM_NETWORKS = [
  { value: 'ETHEREUM', label: 'Ethereum' },
  { value: 'POLYGON', label: 'Polygon' },
  { value: 'ARBITRUM', label: 'Arbitrum' },
  { value: 'BSC', label: 'BNB Chain' },
];

type ChainType = 'SOLANA' | 'EVM';

interface ArbitrageStrategy {
  id: string;
  name: string;
  dex_a: string;
  dex_b: string;
  token_in_mint: string;
  token_out_mint: string;
  min_profit_lamports: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  chain_type: ChainType;
  evm_network: string | null;
}

const emptyStrategy = {
  name: '',
  dex_a: '',
  dex_b: '',
  token_in_mint: '',
  token_out_mint: '',
  min_profit_lamports: 0,
  chain_type: 'SOLANA' as ChainType,
  evm_network: null as string | null,
};

export default function AdminArbitrageStrategiesPage() {
  const [strategies, setStrategies] = useState<ArbitrageStrategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<ArbitrageStrategy | null>(null);
  const [formData, setFormData] = useState(emptyStrategy);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchStrategies = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('arbitrage_strategies')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load strategies');
      console.error(error);
    } else {
      setStrategies(data as ArbitrageStrategy[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchStrategies();
  }, []);

  const handleOpenModal = (strategy?: ArbitrageStrategy) => {
    if (strategy) {
      setEditingStrategy(strategy);
      setFormData({
        name: strategy.name,
        dex_a: strategy.dex_a,
        dex_b: strategy.dex_b,
        token_in_mint: strategy.token_in_mint,
        token_out_mint: strategy.token_out_mint,
        min_profit_lamports: strategy.min_profit_lamports,
        chain_type: strategy.chain_type || 'SOLANA',
        evm_network: strategy.evm_network,
      });
    } else {
      setEditingStrategy(null);
      setFormData(emptyStrategy);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.dex_a || !formData.dex_b || !formData.token_in_mint || !formData.token_out_mint) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.chain_type === 'EVM' && !formData.evm_network) {
      toast.error('Please select an EVM network');
      return;
    }

    setIsSubmitting(true);

    const dataToSave = {
      ...formData,
      evm_network: formData.chain_type === 'EVM' ? formData.evm_network : null,
    };

    if (editingStrategy) {
      const { error } = await supabase
        .from('arbitrage_strategies')
        .update(dataToSave)
        .eq('id', editingStrategy.id);

      if (error) {
        toast.error('Failed to update strategy');
        console.error(error);
      } else {
        toast.success('Strategy updated');
        setIsModalOpen(false);
        fetchStrategies();
      }
    } else {
      const { error } = await supabase
        .from('arbitrage_strategies')
        .insert({ ...dataToSave, is_enabled: true });

      if (error) {
        toast.error('Failed to create strategy');
        console.error(error);
      } else {
        toast.success('Strategy created');
        setIsModalOpen(false);
        fetchStrategies();
      }
    }

    setIsSubmitting(false);
  };

  const handleToggleEnabled = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('arbitrage_strategies')
      .update({ is_enabled: !currentStatus })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update status');
      console.error(error);
    } else {
      toast.success(`Strategy ${!currentStatus ? 'enabled' : 'disabled'}`);
      fetchStrategies();
    }
  };

  const runSimulationScan = async (chainType: ChainType) => {
    setIsScanning(true);
    try {
      const functionName = chainType === 'EVM' ? 'scan-evm-arbitrage' : 'scan-arbitrage';
      const { data, error } = await supabase.functions.invoke(functionName);
      if (error) throw error;
      
      toast.success(`${chainType} scan complete: ${data.profitable_count} profitable opportunities found`);
      console.log('Scan results:', data);
    } catch (error) {
      console.error('Scan error:', error);
      toast.error(`Failed to run ${chainType} simulation scan`);
    }
    setIsScanning(false);
  };

  const executeArbitrage = async (strategyId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('execute-arbitrage', {
        body: { strategy_id: strategyId }
      });
      if (error) throw error;
      
      toast.success('Stub execution complete (no real trades)');
      console.log('Execution result:', data);
    } catch (error) {
      console.error('Execution error:', error);
      toast.error('Failed to execute arbitrage');
    }
  };

  const formatLamportsToSol = (lamports: number) => (lamports / 1_000_000_000).toFixed(6);

  const getDexList = () => formData.chain_type === 'EVM' ? SUPPORTED_EVM_DEXS : SUPPORTED_SOLANA_DEXS;

  const solanaStrategies = strategies.filter(s => s.chain_type === 'SOLANA' || !s.chain_type);
  const evmStrategies = strategies.filter(s => s.chain_type === 'EVM');

  return (
    <DashboardLayout title="Arbitrage Strategies" subtitle="Manage internal arbitrage strategies (INTERNAL ONLY)">
      <div className="space-y-6">
        {/* Warning Banner */}
        <Alert className="border-amber-500 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            <strong>INTERNAL ONLY:</strong> This feature is for internal platform cost optimization only. 
            It does NOT interact with user funds. Current implementation uses STUB execution (no real trades).
          </AlertDescription>
        </Alert>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Strategies</CardDescription>
              <CardTitle className="text-2xl">{strategies.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Enabled</CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {strategies.filter(s => s.is_enabled).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>View Runs</CardDescription>
              <CardTitle className="text-2xl">
                <Link to="/admin/arbitrage/runs" className="text-primary hover:underline">
                  View All →
                </Link>
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center gap-2">
          <div className="flex gap-2">
            <Button
              onClick={() => runSimulationScan('SOLANA')}
              disabled={isScanning}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
              Scan Solana
            </Button>
            <Button
              onClick={() => runSimulationScan('EVM')}
              disabled={isScanning}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
              Scan EVM
            </Button>
          </div>

          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenModal()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Strategy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingStrategy ? 'Edit Strategy' : 'Add New Strategy'}</DialogTitle>
                <DialogDescription>
                  Configure an arbitrage strategy between two DEXs.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Chain Type Selection */}
                <div className="space-y-2">
                  <Label>Chain Type</Label>
                  <Select
                    value={formData.chain_type}
                    onValueChange={(value: ChainType) => setFormData({ 
                      ...formData, 
                      chain_type: value,
                      dex_a: '',
                      dex_b: '',
                      evm_network: value === 'EVM' ? 'ETHEREUM' : null,
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select chain" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SOLANA">Solana</SelectItem>
                      <SelectItem value="EVM">EVM (Ethereum/Polygon)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* EVM Network (only for EVM) */}
                {formData.chain_type === 'EVM' && (
                  <div className="space-y-2">
                    <Label>Network</Label>
                    <Select
                      value={formData.evm_network || ''}
                      onValueChange={(value) => setFormData({ ...formData, evm_network: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select network" />
                      </SelectTrigger>
                      <SelectContent>
                        {EVM_NETWORKS.map((net) => (
                          <SelectItem key={net.value} value={net.value}>
                            {net.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder={formData.chain_type === 'EVM' ? "e.g., ETH/USDC Uniswap-Sushi" : "e.g., SOL/USDC Raydium-Orca"}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>DEX A</Label>
                    <Select
                      value={formData.dex_a}
                      onValueChange={(value) => setFormData({ ...formData, dex_a: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select DEX A" />
                      </SelectTrigger>
                      <SelectContent>
                        {getDexList().map((dex) => (
                          <SelectItem key={dex} value={dex}>
                            {dex}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>DEX B</Label>
                    <Select
                      value={formData.dex_b}
                      onValueChange={(value) => setFormData({ ...formData, dex_b: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select DEX B" />
                      </SelectTrigger>
                      <SelectContent>
                        {getDexList().map((dex) => (
                          <SelectItem key={dex} value={dex}>
                            {dex}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Token In Address</Label>
                  <Input
                    placeholder={formData.chain_type === 'EVM' ? "0x... token address" : "SPL mint address"}
                    value={formData.token_in_mint}
                    onChange={(e) => setFormData({ ...formData, token_in_mint: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Token Out Address</Label>
                  <Input
                    placeholder={formData.chain_type === 'EVM' ? "0x... token address" : "SPL mint address"}
                    value={formData.token_out_mint}
                    onChange={(e) => setFormData({ ...formData, token_out_mint: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min Profit ({formData.chain_type === 'EVM' ? 'wei' : 'lamports'})</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.min_profit_lamports}
                    onChange={(e) => setFormData({ ...formData, min_profit_lamports: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.chain_type === 'EVM' 
                      ? `= ${(formData.min_profit_lamports / 1e18).toFixed(6)} ETH`
                      : `= ${formatLamportsToSol(formData.min_profit_lamports)} SOL`
                    }
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingStrategy ? 'Update' : 'Create'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Strategies by Chain */}
        <Tabs defaultValue="solana" className="w-full">
          <TabsList>
            <TabsTrigger value="solana">Solana ({solanaStrategies.length})</TabsTrigger>
            <TabsTrigger value="evm">EVM ({evmStrategies.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="solana">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Solana Strategies
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : solanaStrategies.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No Solana strategies configured. Add one to get started.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>DEX A → B</TableHead>
                        <TableHead>Tokens</TableHead>
                        <TableHead className="text-right">Min Profit (SOL)</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {solanaStrategies.map((strategy) => (
                        <TableRow key={strategy.id}>
                          <TableCell className="font-medium">{strategy.name}</TableCell>
                          <TableCell>
                            <span className="text-sm">{strategy.dex_a} → {strategy.dex_b}</span>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {strategy.token_in_mint.slice(0, 6)}...
                            </code>
                            {' ↔ '}
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {strategy.token_out_mint.slice(0, 6)}...
                            </code>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatLamportsToSol(strategy.min_profit_lamports)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={strategy.is_enabled ? 'default' : 'secondary'}>
                              {strategy.is_enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenModal(strategy)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Switch
                                checked={strategy.is_enabled}
                                onCheckedChange={() => handleToggleEnabled(strategy.id, strategy.is_enabled)}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => executeArbitrage(strategy.id)}
                                disabled={!strategy.is_enabled}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Execute (Stub)
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
          </TabsContent>

          <TabsContent value="evm">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  EVM Strategies (Ethereum/Polygon/Arbitrum/BSC)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : evmStrategies.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No EVM strategies configured. Add one to get started.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Network</TableHead>
                        <TableHead>DEX A → B</TableHead>
                        <TableHead>Tokens</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {evmStrategies.map((strategy) => (
                        <TableRow key={strategy.id}>
                          <TableCell className="font-medium">{strategy.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{strategy.evm_network}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{strategy.dex_a} → {strategy.dex_b}</span>
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {strategy.token_in_mint.slice(0, 8)}...
                            </code>
                            {' ↔ '}
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">
                              {strategy.token_out_mint.slice(0, 8)}...
                            </code>
                          </TableCell>
                          <TableCell>
                            <Badge variant={strategy.is_enabled ? 'default' : 'secondary'}>
                              {strategy.is_enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenModal(strategy)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Switch
                                checked={strategy.is_enabled}
                                onCheckedChange={() => handleToggleEnabled(strategy.id, strategy.is_enabled)}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => executeArbitrage(strategy.id)}
                                disabled={!strategy.is_enabled}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Execute (Stub)
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
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
