import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  Zap, 
  RefreshCw,
  ExternalLink,
  Settings,
  Edit2,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface FlashLoanProvider {
  id: string;
  name: string;
  display_name: string;
  chain: string;
  contract_address: string;
  pool_address: string | null;
  receiver_contract_address: string | null;
  fee_bps: number;
  max_loan_amount_native: number;
  is_active: boolean;
  supported_tokens: string[];
  created_at: string;
}

interface SepoliaTestResult {
  success: boolean;
  mode: string;
  network: string;
  wallet?: {
    address: string;
    eth_balance: string;
    token_balance: string;
  };
  flash_loan?: {
    pool_address: string;
    token_symbol: string;
    amount: string;
    premium: string;
    has_sufficient_premium_funds: boolean;
  };
  ready_to_execute?: boolean;
  next_steps?: string;
  error?: string;
  hint?: string;
}

const EXPLORER_URLS: Record<string, string> = {
  POLYGON: 'https://polygonscan.com/address/',
  ETHEREUM: 'https://etherscan.io/address/',
  ARBITRUM: 'https://arbiscan.io/address/',
  BSC: 'https://bscscan.com/address/',
  SEPOLIA: 'https://sepolia.etherscan.io/address/',
  SOLANA: 'https://solscan.io/account/',
};

// Aave V3 Pool Addresses Provider per network (for contract deployment)
const POOL_ADDRESSES_PROVIDERS: Record<string, string> = {
  POLYGON: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
  ETHEREUM: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
  ARBITRUM: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
  BSC: '0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D',
  SEPOLIA: '0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A',
};

// Faucet URLs for testnets
const FAUCET_URLS: Record<string, string> = {
  SEPOLIA: 'https://staging.aave.com/faucet/',
};

export default function AdminFlashLoanProvidersPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();

  const [providers, setProviders] = useState<FlashLoanProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChain, setSelectedChain] = useState<string>('all');
  const [editingProvider, setEditingProvider] = useState<FlashLoanProvider | null>(null);
  const [receiverAddress, setReceiverAddress] = useState('');
  const [testingFlashLoan, setTestingFlashLoan] = useState(false);
  const [testResult, setTestResult] = useState<SepoliaTestResult | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchProviders();
    }
  }, [isAdmin]);

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('flash_loan_providers')
        .select('*')
        .order('chain', { ascending: true });

      if (error) throw error;
      setProviders((data || []) as FlashLoanProvider[]);
    } catch (error) {
      console.error('Error fetching providers:', error);
      toast.error('Failed to load flash loan providers');
    } finally {
      setLoading(false);
    }
  };

  const toggleProviderActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('flash_loan_providers')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;

      setProviders(providers.map(p => 
        p.id === id ? { ...p, is_active: isActive } : p
      ));
      toast.success(`Provider ${isActive ? 'activated' : 'deactivated'}`);
    } catch (error) {
      console.error('Error updating provider:', error);
      toast.error('Failed to update provider');
    }
  };

  const openEditReceiver = (provider: FlashLoanProvider) => {
    setEditingProvider(provider);
    setReceiverAddress(provider.receiver_contract_address || '');
  };

  const saveReceiverAddress = async () => {
    if (!editingProvider) return;

    try {
      const { error } = await supabase
        .from('flash_loan_providers')
        .update({ receiver_contract_address: receiverAddress || null })
        .eq('id', editingProvider.id);

      if (error) throw error;

      setProviders(providers.map(p => 
        p.id === editingProvider.id ? { ...p, receiver_contract_address: receiverAddress || null } : p
      ));
      toast.success('Receiver contract address saved');
      setEditingProvider(null);
    } catch (error) {
      console.error('Error saving receiver address:', error);
      toast.error('Failed to save receiver address');
    }
  };

  const runSepoliaFlashLoanTest = async () => {
    setTestingFlashLoan(true);
    setTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('test-sepolia-flash-loan', {
        body: { 
          test_mode: 'SIMULATION',
          token: 'USDC',
          amount: '100000', // 0.1 USDC
        }
      });

      if (error) throw error;
      setTestResult(data as SepoliaTestResult);
      
      if (data?.success) {
        toast.success('Sepolia flash loan test completed');
      } else {
        toast.warning(data?.error || 'Test completed with issues');
      }
    } catch (error) {
      console.error('Flash loan test error:', error);
      toast.error('Failed to run flash loan test');
      setTestResult({ 
        success: false, 
        mode: 'ERROR', 
        network: 'SEPOLIA',
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    } finally {
      setTestingFlashLoan(false);
    }
  };

  const filteredProviders = selectedChain === 'all' 
    ? providers 
    : providers.filter(p => p.chain === selectedChain);

  const uniqueChains = [...new Set(providers.map(p => p.chain))];

  const activeCount = providers.filter(p => p.is_active).length;
  const evmCount = providers.filter(p => p.chain !== 'SOLANA').length;
  const solanaCount = providers.filter(p => p.chain === 'SOLANA').length;

  if (authLoading || loading) {
    return (
      <DashboardLayout title="Flash Loan Providers">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Flash Loan Providers" subtitle="Configure flash loan sources for capital-free arbitrage">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Providers</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{providers.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Settings className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{activeCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">EVM Providers</CardTitle>
              <Badge variant="outline">Aave, Balancer</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{evmCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Solana Providers</CardTitle>
              <Badge variant="secondary">Coming Soon</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{solanaCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Providers Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Flash Loan Providers</CardTitle>
                <CardDescription>Configure which protocols to use for borrowing</CardDescription>
              </div>
              <div className="flex gap-2">
                <Select value={selectedChain} onValueChange={setSelectedChain}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Filter by chain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Chains</SelectItem>
                    {uniqueChains.map(chain => (
                      <SelectItem key={chain} value={chain}>{chain}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={fetchProviders}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Fee (bps)</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Pool Contract</TableHead>
                  <TableHead>Receiver Contract</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No providers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProviders.map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell className="font-medium">
                        {provider.display_name}
                        {provider.chain === 'SOLANA' && (
                          <Badge variant="secondary" className="ml-2">Coming Soon</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{provider.chain}</Badge>
                      </TableCell>
                      <TableCell>
                        {provider.fee_bps === 0 ? (
                          <span className="text-green-500 font-medium">Free (0%)</span>
                        ) : (
                          <span>{(provider.fee_bps / 100).toFixed(2)}%</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {provider.supported_tokens?.slice(0, 3).map(token => (
                            <Badge key={token} variant="secondary" className="text-xs">
                              {token}
                            </Badge>
                          ))}
                          {provider.supported_tokens?.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{provider.supported_tokens.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`${EXPLORER_URLS[provider.chain] || ''}${provider.contract_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline text-xs font-mono"
                        >
                          {provider.contract_address.slice(0, 8)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell>
                        {provider.receiver_contract_address ? (
                          <div className="flex items-center gap-2">
                            <a
                              href={`${EXPLORER_URLS[provider.chain] || ''}${provider.receiver_contract_address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-green-600 hover:underline text-xs font-mono"
                            >
                              <Check className="h-3 w-3" />
                              {provider.receiver_contract_address.slice(0, 8)}...
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => openEditReceiver(provider)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => openEditReceiver(provider)}
                          >
                            <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />
                            Set Receiver
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={provider.is_active}
                          onCheckedChange={(checked) => toggleProviderActive(provider.id, checked)}
                          disabled={provider.chain === 'SOLANA'}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Sepolia Flash Loan Test Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Sepolia Flash Loan Test
                </CardTitle>
                <CardDescription>Test the flash loan infrastructure on Sepolia testnet</CardDescription>
              </div>
              <Button 
                onClick={runSepoliaFlashLoanTest} 
                disabled={testingFlashLoan}
                variant="outline"
              >
                {testingFlashLoan ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Run Test
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {testResult && (
            <CardContent>
              <div className={`p-4 rounded-lg border ${testResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex items-center gap-2 mb-3">
                  {testResult.success ? (
                    <Check className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="font-medium">
                    {testResult.success ? 'Test Passed' : 'Test Failed'}
                  </span>
                  <Badge variant="outline">{testResult.mode}</Badge>
                  <Badge variant="secondary">{testResult.network}</Badge>
                </div>
                
                {testResult.error && (
                  <p className="text-sm text-red-500 mb-3">{testResult.error}</p>
                )}
                
                {testResult.wallet && (
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Wallet:</span>
                        <span className="ml-2 font-mono text-xs">{testResult.wallet.address.slice(0, 10)}...</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">ETH Balance:</span>
                        <span className="ml-2">{parseFloat(testResult.wallet.eth_balance).toFixed(4)} ETH</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {testResult.flash_loan && (
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Token:</span>
                        <span className="ml-2">{testResult.flash_loan.token_symbol}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Premium:</span>
                        <span className="ml-2">{testResult.flash_loan.premium}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Has Premium Funds:</span>
                      <span className={`ml-2 ${testResult.flash_loan.has_sufficient_premium_funds ? 'text-green-500' : 'text-amber-500'}`}>
                        {testResult.flash_loan.has_sufficient_premium_funds ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                )}
                
                {testResult.next_steps && (
                  <p className="mt-3 text-sm text-muted-foreground border-t pt-3">
                    <strong>Next:</strong> {testResult.next_steps}
                  </p>
                )}
                
                {testResult.hint && (
                  <p className="mt-2 text-sm text-amber-500">
                    💡 {testResult.hint}
                  </p>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">About Flash Loans</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Flash loans</strong> allow borrowing large amounts of tokens without collateral,
              as long as the borrowed amount plus fee is repaid within the same transaction.
            </p>
            <p>
              <strong>Aave V3:</strong> 0.05% fee (5 basis points). Largest liquidity pools.
            </p>
            <p>
              <strong>Balancer:</strong> 0% fee! Uses the Vault for flash loans with no premium.
            </p>
            <p className="text-amber-500">
              <strong>Note:</strong> Solana flash loans (Solend, MarginFi) are not yet implemented
              due to edge function CPI limitations.
            </p>
          </CardContent>
        </Card>

        {/* Edit Receiver Address Dialog */}
        <Dialog open={!!editingProvider} onOpenChange={(open) => !open && setEditingProvider(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Set Receiver Contract Address</DialogTitle>
              <DialogDescription>
                Deploy MetallumFlashReceiver on {editingProvider?.chain} and paste the contract address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {editingProvider?.chain && POOL_ADDRESSES_PROVIDERS[editingProvider.chain] && (
                <div className="bg-muted p-4 rounded-lg space-y-3">
                  <h4 className="font-medium text-sm">Deployment Instructions for {editingProvider.chain}</h4>
                  <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Open <a href="https://remix.ethereum.org" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Remix IDE</a></li>
                    <li>Create MetallumFlashReceiver.sol and paste the contract code</li>
                    <li>Compile with Solidity 0.8.20 and optimization enabled</li>
                    <li>Connect MetaMask to <strong>{editingProvider.chain}</strong> network</li>
                    <li>Deploy with constructor parameter:</li>
                  </ol>
                  <div className="bg-background p-2 rounded font-mono text-xs break-all">
                    <span className="text-muted-foreground">_addressesProvider: </span>
                    <span className="text-primary">{POOL_ADDRESSES_PROVIDERS[editingProvider.chain]}</span>
                  </div>
                  {FAUCET_URLS[editingProvider.chain] && (
                    <p className="text-xs text-amber-500">
                      💡 Need testnet tokens? Get them from the{' '}
                      <a href={FAUCET_URLS[editingProvider.chain]} target="_blank" rel="noopener noreferrer" className="underline">
                        Aave Faucet
                      </a>
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>Receiver Contract Address</Label>
                <Input
                  placeholder="0x..."
                  value={receiverAddress}
                  onChange={(e) => setReceiverAddress(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  After deployment, paste the contract address above.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingProvider(null)}>Cancel</Button>
              <Button onClick={saveReceiverAddress}>Save Address</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
