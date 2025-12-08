import { Check, X, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TransferRequestWithDetails, TransferRequestStatus } from '@/types/transfers';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TransferRequestCardProps {
  request: TransferRequestWithDetails;
  type: 'incoming' | 'outgoing';
  onApprove?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
}

const STATUS_STYLES: Record<TransferRequestStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  APPROVED: { label: 'Completed', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
  REJECTED: { label: 'Declined', className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  CANCELLED: { label: 'Cancelled', className: 'bg-muted text-muted-foreground border-muted' },
};

export function TransferRequestCard({
  request,
  type,
  onApprove,
  onReject,
  onCancel,
}: TransferRequestCardProps) {
  const statusStyle = STATUS_STYLES[request.status];
  const isPending = request.status === 'PENDING';

  return (
    <div className="glass-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Token and Amount */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl font-bold text-foreground">
              {request.amount.toLocaleString()}
            </span>
            <span className="text-lg font-medium text-primary">
              {request.token_symbol || 'Token'}
            </span>
          </div>

          {/* From/To */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>
              {type === 'incoming' ? 'From: ' : 'To: '}
              <span className="text-foreground font-medium">
                {type === 'incoming'
                  ? request.from_user_name || request.from_user_email
                  : request.to_user_name || request.to_user_email}
              </span>
            </span>
          </div>

          {/* Message */}
          {request.message && (
            <p className="text-sm text-muted-foreground italic mb-2">
              "{request.message}"
            </p>
          )}

          {/* Date and Status */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}</span>
            <Badge variant="outline" className={cn('text-xs', statusStyle.className)}>
              {statusStyle.label}
            </Badge>
          </div>
        </div>

        {/* Actions */}
        {isPending && (
          <div className="flex gap-2">
            {type === 'incoming' && onApprove && onReject && (
              <>
                <Button size="sm" variant="outline" onClick={onReject}>
                  <X className="h-4 w-4" />
                  Decline
                </Button>
                <Button size="sm" onClick={onApprove}>
                  <Check className="h-4 w-4" />
                  Accept
                </Button>
              </>
            )}
            {type === 'outgoing' && onCancel && (
              <Button size="sm" variant="outline" onClick={onCancel}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        )}

        {!isPending && (
          <div className="flex items-center gap-2">
            {request.status === 'APPROVED' && (
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="h-5 w-5 text-green-500" />
              </div>
            )}
            {request.status === 'REJECTED' && (
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <X className="h-5 w-5 text-red-500" />
              </div>
            )}
            {request.status === 'CANCELLED' && (
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <X className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
