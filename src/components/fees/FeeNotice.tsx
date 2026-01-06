import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DollarSign, Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FeeCatalogItem {
  id: string;
  fee_key: string;
  tier: string;
  description: string;
  amount_cents: number;
  enabled: boolean;
}

interface DiscountTier {
  tier_name: string;
  discount_percentage: number;
  min_balance: number;
}

interface FeeNoticeProps {
  feeKey: string;
  className?: string;
  showMxuDiscount?: boolean;
}

const TIER_COLORS: Record<string, string> = {
  Bronze: 'bg-amber-700/20 text-amber-600 border-amber-600/30',
  Silver: 'bg-slate-400/20 text-slate-500 border-slate-400/30',
  Gold: 'bg-yellow-500/20 text-yellow-600 border-yellow-500/30',
  Platinum: 'bg-violet-500/20 text-violet-500 border-violet-500/30',
};

export function FeeNotice({ feeKey, className = '', showMxuDiscount = true }: FeeNoticeProps) {
  const { user } = useAuth();
  const [fee, setFee] = useState<FeeCatalogItem | null>(null);
  const [userTier, setUserTier] = useState<string>('RETAIL');
  const [mxuDiscount, setMxuDiscount] = useState<number>(0);
  const [discountTierName, setDiscountTierName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeeAndTier = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Get user's pricing tier
        const { data: profile } = await supabase
          .from('profiles')
          .select('pricing_tier')
          .eq('id', user.id)
          .single();

        const tier = profile?.pricing_tier || 'RETAIL';
        setUserTier(tier);

        // Get fee for user's tier
        const tierFeeKey = `${feeKey}_${tier}`;
        const { data: feeData } = await supabase
          .from('fee_catalog')
          .select('*')
          .eq('fee_key', tierFeeKey)
          .eq('enabled', true)
          .single();

        if (feeData) {
          setFee(feeData);
        }

        // Check for MXU discount if applicable
        if (showMxuDiscount) {
          const { data: holdings } = await supabase
            .from('user_token_holdings')
            .select('balance, token_definition:token_definitions(token_symbol)')
            .eq('user_id', user.id);

          const mxuHolding = holdings?.find(
            (h: any) => h.token_definition?.token_symbol === 'MXU'
          );

          if (mxuHolding && mxuHolding.balance > 0) {
            // Get discount tiers for MXU
            const { data: discountTiers } = await supabase
              .from('fee_discount_tiers')
              .select('*, token_definition:token_definitions(token_symbol)')
              .order('min_balance', { ascending: false });

            const mxuDiscountTier = discountTiers?.find(
              (t: any) =>
                t.token_definition?.token_symbol === 'MXU' &&
                mxuHolding.balance >= t.min_balance
            ) as DiscountTier | undefined;

            if (mxuDiscountTier) {
              setMxuDiscount(mxuDiscountTier.discount_percentage);
              setDiscountTierName(mxuDiscountTier.tier_name);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching fee info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFeeAndTier();
  }, [user, feeKey, showMxuDiscount]);

  if (loading || !fee) return null;

  const originalAmount = fee.amount_cents / 100;
  const discountedAmount = mxuDiscount > 0 
    ? originalAmount * (1 - mxuDiscount / 100) 
    : originalAmount;
  const savedAmount = originalAmount - discountedAmount;

  return (
    <div className={`rounded-lg border border-border bg-muted/30 p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <DollarSign className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Processing Fee</p>
          <p className="text-xs text-muted-foreground mt-0.5">{fee.description}</p>
          
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {mxuDiscount > 0 ? (
              <>
                <span className="text-lg font-semibold text-primary">
                  ${discountedAmount.toFixed(2)}
                </span>
                <span className="text-sm text-muted-foreground line-through">
                  ${originalAmount.toFixed(2)}
                </span>
                {discountTierName && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      'flex items-center gap-1 font-medium',
                      TIER_COLORS[discountTierName] || 'bg-accent/20'
                    )}
                  >
                    <Award className="h-3 w-3" />
                    {discountTierName}
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-lg font-semibold text-primary">
                ${originalAmount.toFixed(2)}
              </span>
            )}
          </div>

          {/* Savings callout */}
          {mxuDiscount > 0 && savedAmount > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600 dark:text-green-400">
              <DollarSign className="h-3 w-3" />
              You saved ${savedAmount.toFixed(2)} using MXU
            </div>
          )}
        </div>
      </div>
    </div>
  );
}