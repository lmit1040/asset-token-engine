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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Play, Zap, RefreshCw, AlertTriangle, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

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
}

const emptyStrategy = {
  name: '',
  dex_a: '',
  dex_b: '',
  token_in_mint: '',
  token_out_mint: '',
  min_profit_lamports: 0,
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

    setIsSubmitting(true);

    if (editingStrategy) {
      const { error } = await supabase
        .from('arbitrage_strategies')
        .update(formData)
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
        .insert({ ...formData, is_enabled: true });

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

  const runSimulationScan = async () => {
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-arbitrage');
      if (error) throw error;
      
      toast.success(`Scan complete: ${data.profitable_count} profitable opportunities found`);
      console.log('Scan results:', data);
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to run simulation scan');
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
        <div className="flex justify-between items-center">
          <Button
            onClick={runSimulationScan}
            disabled={isScanning}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
            Run Simulation Scan
          </Button>

          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenModal()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Strategy
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingStrategy ? 'Edit Strategy' : 'Add New Strategy'}</DialogTitle>
                <DialogDescription>
                  Configure an arbitrage strategy between two DEXs.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g., SOL/USDC Raydium-Orca"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>DEX A</Label>
                    <Input
                      placeholder="e.g., RAYDIUM"
                      value={formData.dex_a}
                      onChange={(e) => setFormData({ ...formData, dex_a: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>DEX B</Label>
                    <Input
                      placeholder="e.g., ORCA"
                      value={formData.dex_b}
                      onChange={(e) => setFormData({ ...formData, dex_b: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Token In Mint</Label>
                  <Input
                    placeholder="SPL mint address"
                    value={formData.token_in_mint}
                    onChange={(e) => setFormData({ ...formData, token_in_mint: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Token Out Mint</Label>
                  <Input
                    placeholder="SPL mint address"
                    value={formData.token_out_mint}
                    onChange={(e) => setFormData({ ...formData, token_out_mint: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min Profit (lamports)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={formData.min_profit_lamports}
                    onChange={(e) => setFormData({ ...formData, min_profit_lamports: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    = {formatLamportsToSol(formData.min_profit_lamports)} SOL
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

        {/* Strategies Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Arbitrage Strategies
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : strategies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No strategies configured. Add one to get started.
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
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {strategies.map((strategy) => (
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
                      <TableCell>
                        {format(new Date(strategy.created_at), 'MMM d, yyyy')}
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
      </div>
    </DashboardLayout>
  );
}
