import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FeeType, FEE_TYPE_LABELS, FEE_TYPE_COLORS } from '@/types/fees';

interface FeeTypeBadgeProps {
  feeType: FeeType;
  className?: string;
}

export function FeeTypeBadge({ feeType, className }: FeeTypeBadgeProps) {
  return (
    <Badge 
      variant="outline" 
      className={cn(
        'text-xs font-medium',
        FEE_TYPE_COLORS[feeType],
        className
      )}
    >
      {FEE_TYPE_LABELS[feeType]}
    </Badge>
  );
}
