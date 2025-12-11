import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Zap, 
  RefreshCw,
  ExternalLink,
  Settings,
} from 'lucide-react';

interface FlashLoanProvider {
  id: string;
  name: string;
  display_name: string;
  chain: string;
  contract_address: string;
  pool_address: string | null;
  fee_bps: number;
  max_loan_amount_native: number;
  is_active: boolean;
  supported_tokens: string[];
  created_at: string;
}

const EXPLORER_URLS: Record<string, string> = {
  POLYGON: 'https://polygonscan.com/address/',
  ETHEREUM: 'https://etherscan.io/address/',
  ARBITRUM: 'https://arbiscan.io/address/',
  BSC: 'https://bscscan.com/address/',
  SOLANA: 'https://solscan.io/account/',
};

export default function AdminFlashLoanProvidersPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();

  const [providers, setProviders] = useState<FlashLoanProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChain, setSelectedChain] = useState<string>('all');

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
                  <TableHead>Contract</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
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
      </div>
    </DashboardLayout>
  );
}
