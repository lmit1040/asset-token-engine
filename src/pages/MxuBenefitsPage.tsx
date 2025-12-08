import { useEffect, useState, useCallback } from 'react';
import { Coins, Percent, Award } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StatCard } from '@/components/dashboard/StatCard';
import { FeeDiscountTiers } from '@/components/staking/FeeDiscountTiers';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { FeeDiscountTier } from '@/types/staking';

export default function MxuBenefitsPage() {
  const { user } = useAuth();
  const [discountTiers, setDiscountTiers] = useState<FeeDiscountTier[]>([]);
  const [userMxuBalance, setUserMxuBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    try {
      // Fetch MXU token
      const { data: mxuToken } = await supabase
        .from('token_definitions')
        .select('id')
        .eq('token_symbol', 'MXU')
        .single();

      if (mxuToken) {
        // Fetch fee discount tiers for MXU
        const { data: tiersData } = await supabase
          .from('fee_discount_tiers')
          .select('*')
          .eq('token_definition_id', mxuToken.id)
          .order('min_balance', { ascending: true });

        setDiscountTiers(tiersData || []);

        // Fetch user's MXU balance
        const { data: holdingData } = await supabase
          .from('user_token_holdings')
          .select('balance')
          .eq('user_id', user.id)
          .eq('token_definition_id', mxuToken.id)
          .single();

        setUserMxuBalance(holdingData?.balance || 0);
      }
    } catch (error) {
      console.error('Error fetching MXU benefits data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load benefits data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Find user's current discount tier
  const currentTier = discountTiers
    .filter(t => userMxuBalance >= t.min_balance)
    .sort((a, b) => b.min_balance - a.min_balance)[0];

  // Find next tier
  const nextTier = discountTiers
    .filter(t => userMxuBalance < t.min_balance)
    .sort((a, b) => a.min_balance - b.min_balance)[0];

  const tokensToNextTier = nextTier ? nextTier.min_balance - userMxuBalance : 0;

  return (
    <DashboardLayout
      title="MXU Benefits"
      subtitle="Hold MXU tokens to unlock platform fee discounts"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Your MXU Balance"
            value={userMxuBalance.toLocaleString()}
            subtitle="Total MXU held"
            icon={<Coins className="h-6 w-6" />}
          />
          <StatCard
            title="Current Tier"
            value={currentTier?.tier_name || 'None'}
            subtitle={currentTier ? `${currentTier.discount_percentage}% fee discount` : 'Hold MXU to unlock'}
            icon={<Award className="h-6 w-6" />}
          />
          <StatCard
            title="Fee Discount"
            value={currentTier ? `${currentTier.discount_percentage}%` : '0%'}
            subtitle={nextTier ? `${tokensToNextTier.toLocaleString()} MXU to next tier` : 'Maximum tier reached'}
            icon={<Percent className="h-6 w-6" />}
          />
        </div>

        {/* How It Works */}
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">How MXU Benefits Work</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <span className="text-lg font-bold text-primary">1</span>
              </div>
              <h3 className="font-medium text-foreground mb-1">Hold MXU Tokens</h3>
              <p className="text-sm text-muted-foreground">
                Acquire MXU tokens and hold them in your account balance.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <span className="text-lg font-bold text-primary">2</span>
              </div>
              <h3 className="font-medium text-foreground mb-1">Unlock Tiers</h3>
              <p className="text-sm text-muted-foreground">
                Your tier is determined by how many MXU tokens you hold.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <span className="text-lg font-bold text-primary">3</span>
              </div>
              <h3 className="font-medium text-foreground mb-1">Enjoy Discounts</h3>
              <p className="text-sm text-muted-foreground">
                Higher tiers provide greater fee discounts on platform services.
              </p>
            </div>
          </div>
        </div>

        {/* Fee Discount Tiers */}
        {isLoading ? (
          <div className="glass-card p-6 text-center text-muted-foreground">
            Loading benefits...
          </div>
        ) : (
          <FeeDiscountTiers
            tiers={discountTiers}
            userBalance={userMxuBalance}
            currentTier={currentTier}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
