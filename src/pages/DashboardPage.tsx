import { useEffect, useState, useCallback } from 'react';
import { Vault, Coins, TrendingUp, DollarSign, History, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { PortfolioChart } from '@/components/dashboard/PortfolioChart';
import { TransactionHistory } from '@/components/dashboard/TransactionHistory';
import { CryptoTicker } from '@/components/dashboard/CryptoTicker';
import { NewsSection } from '@/components/dashboard/NewsSection';
import { LegalDisclaimer } from '@/components/layout/LegalDisclaimer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useSolanaBalances } from '@/hooks/useSolanaBalances';
import { Asset, TokenDefinition, UserTokenHolding, AssetType, ASSET_PRICES } from '@/types/database';

interface HoldingWithDetails extends UserTokenHolding {
  token_definition: TokenDefinition & { asset: Asset };
}

interface ChartData {
  name: string;
  value: number;
  assetType: AssetType;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { solanaAddress } = useWallet();
  const { balances: onChainBalances, fetchBalances, isLoading: isLoadingBalances } = useSolanaBalances();
  
  const [holdings, setHoldings] = useState<HoldingWithDetails[]>([]);
  const [stats, setStats] = useState({
    totalAssets: 0,
    totalTokenTypes: 0,
    totalHoldings: 0,
    portfolioValue: 0,
    onChainValue: 0,
  });
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      try {
        // Fetch user holdings with token and asset details
        const { data: holdingsData } = await supabase
          .from('user_token_holdings')
          .select(`
            *,
            token_definition:token_definitions (
              *,
              asset:assets (*)
            )
          `)
          .eq('user_id', user.id);

        if (holdingsData) {
          const typedHoldings = holdingsData as unknown as HoldingWithDetails[];
          setHoldings(typedHoldings);

          // Calculate portfolio value and chart data
          let totalValue = 0;
          const assetValues: Record<AssetType, number> = {} as Record<AssetType, number>;

          typedHoldings.forEach((holding) => {
            const asset = holding.token_definition?.asset;
            if (asset) {
              const assetType = asset.asset_type as AssetType;
              const price = ASSET_PRICES[assetType] || 0;
              const tokenValue = Number(holding.balance) * price;
              totalValue += tokenValue;

              if (!assetValues[assetType]) {
                assetValues[assetType] = 0;
              }
              assetValues[assetType] += tokenValue;
            }
          });

          // Build chart data
          const chartItems: ChartData[] = Object.entries(assetValues).map(([type, value]) => ({
            name: type,
            value,
            assetType: type as AssetType,
          }));

          setChartData(chartItems);

          // Count unique token types held
          const uniqueTokenTypes = new Set(typedHoldings.map(h => h.token_definition_id));

          setStats(prev => ({
            ...prev,
            totalHoldings: typedHoldings.length,
            totalTokenTypes: uniqueTokenTypes.size,
            portfolioValue: totalValue,
          }));
        }

        // Fetch total assets count
        const { count: assetsCount } = await supabase
          .from('assets')
          .select('id', { count: 'exact', head: true });

        setStats(prev => ({
          ...prev,
          totalAssets: assetsCount || 0,
        }));

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [user]);

  // Fetch on-chain balances when holdings change or wallet connects
  const fetchOnChainBalances = useCallback(async () => {
    if (!solanaAddress || holdings.length === 0) return;
    
    // Get all deployed Solana token mints from holdings
    const solanaMints = holdings
      .filter(h => h.token_definition.chain === 'SOLANA' && h.token_definition.deployment_status === 'DEPLOYED' && h.token_definition.contract_address)
      .map(h => h.token_definition.contract_address as string);
    
    if (solanaMints.length > 0) {
      await fetchBalances(solanaAddress, solanaMints);
    }
  }, [solanaAddress, holdings, fetchBalances]);

  useEffect(() => {
    fetchOnChainBalances();
  }, [fetchOnChainBalances]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <DashboardLayout 
      title="Dashboard" 
      subtitle="Overview of your tokenized assets"
    >
      {/* Crypto Ticker */}
      <div className="-mx-6 -mt-2 mb-6">
        <CryptoTicker />
      </div>

      <div className="space-y-6 animate-fade-in">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Portfolio Value"
            value={formatCurrency(stats.portfolioValue)}
            subtitle="Estimated USD value"
            icon={<DollarSign className="h-6 w-6" />}
          />
          <StatCard
            title="Token Types Held"
            value={stats.totalTokenTypes}
            subtitle="Unique token positions"
            icon={<Coins className="h-6 w-6" />}
          />
          <StatCard
            title="Total Holdings"
            value={stats.totalHoldings}
            subtitle="Active positions"
            icon={<TrendingUp className="h-6 w-6" />}
          />
          <StatCard
            title="Vault Assets"
            value={stats.totalAssets}
            subtitle="Backing your tokens"
            icon={<Vault className="h-6 w-6" />}
          />
        </div>

        {/* Chart and Holdings Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Portfolio Chart */}
          <div className="glass-card p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">Portfolio by Asset Type</h2>
              <p className="text-sm text-muted-foreground">
                Distribution of holdings by backing asset
              </p>
            </div>
            <PortfolioChart data={chartData} />
          </div>

          {/* Holdings Table */}
          <div className="glass-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Your Token Holdings</h2>
                <p className="text-sm text-muted-foreground">
                  View your tokenized asset positions and on-chain balances
                </p>
              </div>
              {solanaAddress && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchOnChainBalances}
                  disabled={isLoadingBalances}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoadingBalances ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              )}
            </div>
            
            <HoldingsTable 
              holdings={holdings} 
              isLoading={isLoading} 
              onChainBalances={onChainBalances}
              isLoadingBalances={isLoadingBalances}
            />
          </div>
        </div>

        {/* News and Transaction History Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* News Section */}
          <NewsSection />

          {/* Transaction History */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Transaction History</h2>
                <p className="text-sm text-muted-foreground">Recent token assignments and transfers</p>
              </div>
            </div>
            <TransactionHistory pageSize={10} />
          </div>
        </div>

        {/* Legal Disclaimer */}
        <LegalDisclaimer />
      </div>
    </DashboardLayout>
  );
}
