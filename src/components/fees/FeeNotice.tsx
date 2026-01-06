import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DollarSign, Sparkles } from 'lucide-react';

interface FeeCatalogItem {
  id: string;
  fee_key: string;
  tier: string;
  description: string;
  amount_cents: number;
  enabled: boolean;
}

interface FeeNoticeProps {
  feeKey: string;
  className?: string;
  showMxuDiscount?: boolean;
}

export function FeeNotice({ feeKey, className = '', showMxuDiscount = true }: FeeNoticeProps) {
  const { user } = useAuth();
  const [fee, setFee] = useState<FeeCatalogItem | null>(null);
  const [userTier, setUserTier] = useState<string>('RETAIL');
  const [mxuDiscount, setMxuDiscount] = useState<number>(0);
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
            );

            if (mxuDiscountTier) {
              setMxuDiscount(mxuDiscountTier.discount_percentage);
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

  return (
    <div className={`rounded-lg border border-border bg-muted/30 p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <DollarSign className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Processing Fee</p>
          <p className="text-xs text-muted-foreground mt-0.5">{fee.description}</p>
          
          <div className="mt-2 flex items-center gap-2">
            {mxuDiscount > 0 ? (
              <>
                <span className="text-lg font-semibold text-primary">
                  ${discountedAmount.toFixed(2)}
                </span>
                <span className="text-sm text-muted-foreground line-through">
                  ${originalAmount.toFixed(2)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent-foreground">
                  <Sparkles className="h-3 w-3" />
                  {mxuDiscount}% MXU Discount
                </span>
              </>
            ) : (
              <span className="text-lg font-semibold text-primary">
                ${originalAmount.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
