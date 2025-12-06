import { useEffect, useState } from 'react';
import { Vault, Coins, TrendingUp, DollarSign } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { PortfolioChart } from '@/components/dashboard/PortfolioChart';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
  const [holdings, setHoldings] = useState<HoldingWithDetails[]>([]);
  const [stats, setStats] = useState({
    totalAssets: 0,
    totalTokenTypes: 0,
    totalHoldings: 0,
    portfolioValue: 0,
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
                  View your tokenized asset positions and their backing
                </p>
              </div>
            </div>
            
            <HoldingsTable holdings={holdings} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
