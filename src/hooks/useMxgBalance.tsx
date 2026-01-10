import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface MxgBalanceContextType {
  mxgBalance: number;
  pendingRewards: number;
  totalEarned: number;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const MxgBalanceContext = createContext<MxgBalanceContextType | undefined>(undefined);

export function MxgBalanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [mxgBalance, setMxgBalance] = useState(0);
  const [pendingRewards, setPendingRewards] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [mxgTokenId, setMxgTokenId] = useState<string | null>(null);

  const fetchMxgData = useCallback(async () => {
    if (!user) {
      setMxgBalance(0);
      setPendingRewards(0);
      setTotalEarned(0);
      setIsLoading(false);
      return;
    }

    try {
      // Fetch MXG token definition
      const { data: mxgToken } = await supabase
        .from('token_definitions')
        .select('id')
        .eq('token_symbol', 'MXG')
        .single();

      if (mxgToken) {
        setMxgTokenId(mxgToken.id);

        // Fetch user's MXG holding
        const { data: holding } = await supabase
          .from('user_token_holdings')
          .select('balance')
          .eq('user_id', user.id)
          .eq('token_definition_id', mxgToken.id)
          .maybeSingle();

        setMxgBalance(holding?.balance || 0);
      }

      // Fetch activity rewards for pending and total earned
      const { data: rewards } = await supabase
        .from('activity_rewards')
        .select('mxg_amount, status')
        .eq('user_id', user.id);

      if (rewards) {
        const pending = rewards
          .filter(r => r.status === 'pending')
          .reduce((sum, r) => sum + (r.mxg_amount || 0), 0);
        
        const claimed = rewards
          .filter(r => r.status === 'claimed' || r.status === 'distributed')
          .reduce((sum, r) => sum + (r.mxg_amount || 0), 0);

        setPendingRewards(pending);
        setTotalEarned(claimed);
      }
    } catch (error) {
      console.error('Error fetching MXG data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Initial fetch
  useEffect(() => {
    fetchMxgData();
  }, [fetchMxgData]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user || !mxgTokenId) return;

    // Subscribe to user_token_holdings changes
    const holdingsChannel = supabase
      .channel('mxg-holdings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_token_holdings',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Holdings changed:', payload);
          // Refetch to get updated balance
          fetchMxgData();
        }
      )
      .subscribe();

    // Subscribe to activity_rewards changes
    const rewardsChannel = supabase
      .channel('mxg-rewards-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_rewards',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Rewards changed:', payload);
          // Refetch to get updated rewards
          fetchMxgData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(holdingsChannel);
      supabase.removeChannel(rewardsChannel);
    };
  }, [user, mxgTokenId, fetchMxgData]);

  return (
    <MxgBalanceContext.Provider
      value={{
        mxgBalance,
        pendingRewards,
        totalEarned,
        isLoading,
        refetch: fetchMxgData,
      }}
    >
      {children}
    </MxgBalanceContext.Provider>
  );
}

export function useMxgBalance() {
  const context = useContext(MxgBalanceContext);
  if (context === undefined) {
    throw new Error('useMxgBalance must be used within a MxgBalanceProvider');
  }
  return context;
}
