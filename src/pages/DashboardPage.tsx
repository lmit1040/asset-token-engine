import { useEffect, useState } from 'react';
import { Vault, Coins, TrendingUp, Shield } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { HoldingsTable } from '@/components/dashboard/HoldingsTable';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Asset, TokenDefinition, UserTokenHolding } from '@/types/database';

interface HoldingWithDetails extends UserTokenHolding {
  token_definition: TokenDefinition & { asset: Asset };
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [holdings, setHoldings] = useState<HoldingWithDetails[]>([]);
  const [stats, setStats] = useState({
    totalAssets: 0,
    totalTokens: 0,
    totalHoldings: 0,
  });
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
          setHoldings(holdingsData as unknown as HoldingWithDetails[]);
        }

        // Fetch stats
        const [assetsRes, tokensRes] = await Promise.all([
          supabase.from('assets').select('id', { count: 'exact', head: true }),
          supabase.from('token_definitions').select('id', { count: 'exact', head: true }),
        ]);

        setStats({
          totalAssets: assetsRes.count || 0,
          totalTokens: tokensRes.count || 0,
          totalHoldings: holdingsData?.length || 0,
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [user]);

  return (
    <DashboardLayout 
      title="Dashboard" 
      subtitle="Overview of your tokenized assets"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Your Holdings"
            value={stats.totalHoldings}
            subtitle="Active token positions"
            icon={<Coins className="h-6 w-6" />}
          />
          <StatCard
            title="Total Assets"
            value={stats.totalAssets}
            subtitle="In the vault"
            icon={<Vault className="h-6 w-6" />}
          />
          <StatCard
            title="Token Types"
            value={stats.totalTokens}
            subtitle="Available definitions"
            icon={<TrendingUp className="h-6 w-6" />}
          />
          <StatCard
            title="Security Status"
            value="Verified"
            subtitle="All reserves audited"
            icon={<Shield className="h-6 w-6" />}
          />
        </div>

        {/* Holdings Table */}
        <div className="glass-card p-6">
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
    </DashboardLayout>
  );
}
