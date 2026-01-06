import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FeeTypeBadge } from './FeeTypeBadge';
import { 
  FeeType, 
  FeeCategory, 
  PricingTier, 
  FEE_CATEGORY_LABELS, 
  MXU_DISCOUNT_ELIGIBLE_TYPES 
} from '@/types/fees';
import { Check, X, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeeCatalogItem {
  id: string;
  fee_key: string;
  tier: string;
  description: string;
  amount_cents: number;
  fee_type: FeeType;
  applies_to: FeeCategory;
  enabled: boolean;
}

interface FeeScheduleTableProps {
  tier: PricingTier;
  showMxuEligibility?: boolean;
  groupByCategory?: boolean;
  className?: string;
}

export function FeeScheduleTable({ 
  tier, 
  showMxuEligibility = true, 
  groupByCategory = true,
  className 
}: FeeScheduleTableProps) {
  const [fees, setFees] = useState<FeeCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFees = async () => {
      const { data, error } = await supabase
        .from('fee_catalog')
        .select('*')
        .eq('tier', tier)
        .eq('enabled', true)
        .order('applies_to')
        .order('fee_type');

      if (!error && data) {
        setFees(data as FeeCatalogItem[]);
      }
      setLoading(false);
    };

    fetchFees();
  }, [tier]);

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (tier === 'ENTERPRISE') {
    return (
      <div className={cn("rounded-lg border border-border bg-muted/30 p-8 text-center", className)}>
        <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Custom Enterprise Pricing</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Enterprise plans include custom pricing, dedicated support, and tailored solutions.
        </p>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>• Platform license with unlimited assets</p>
          <p>• API access and integrations</p>
          <p>• Custom asset class modules</p>
          <p>• White-label options available</p>
        </div>
        <a 
          href="mailto:enterprise@metallumx.com" 
          className="inline-flex items-center gap-2 mt-6 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Contact Sales
        </a>
      </div>
    );
  }

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  };

  const isMxuEligible = (feeType: FeeType) => {
    return MXU_DISCOUNT_ELIGIBLE_TYPES.includes(feeType);
  };

  // Group fees by category if enabled
  const groupedFees = groupByCategory
    ? fees.reduce((acc, fee) => {
        const category = fee.applies_to;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(fee);
        return acc;
      }, {} as Record<FeeCategory, FeeCatalogItem[]>)
    : { all: fees };

  return (
    <div className={cn("space-y-6", className)}>
      {Object.entries(groupedFees).map(([category, categoryFees]) => (
        <div key={category} className="rounded-lg border border-border overflow-hidden">
          {groupByCategory && category !== 'all' && (
            <div className="bg-muted/50 px-4 py-2 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">
                {FEE_CATEGORY_LABELS[category as FeeCategory]}
              </h3>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Description</TableHead>
                <TableHead className="w-[20%]">Amount</TableHead>
                <TableHead className="w-[20%]">Type</TableHead>
                {showMxuEligibility && (
                  <TableHead className="w-[20%] text-center">MXU Discount</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryFees.map((fee) => (
                <TableRow key={fee.id}>
                  <TableCell className="font-medium">{fee.description}</TableCell>
                  <TableCell className="text-primary font-semibold">
                    {formatAmount(fee.amount_cents)}
                  </TableCell>
                  <TableCell>
                    <FeeTypeBadge feeType={fee.fee_type} />
                  </TableCell>
                  {showMxuEligibility && (
                    <TableCell className="text-center">
                      {isMxuEligible(fee.fee_type) ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 dark:text-green-400">
                          <Check className="h-3 w-3 mr-1" />
                          Eligible
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">
                          <X className="h-3 w-3 mr-1" />
                          Not Eligible
                        </Badge>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
