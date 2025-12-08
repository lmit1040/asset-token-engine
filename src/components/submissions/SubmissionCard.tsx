import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserAssetSubmission, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_COLORS } from '@/types/submissions';
import { ASSET_TYPE_LABELS, AssetType } from '@/types/database';
import { Clock, MapPin, Package } from 'lucide-react';

interface SubmissionCardProps {
  submission: UserAssetSubmission;
  showUser?: boolean;
  userEmail?: string;
  onClick?: () => void;
}

export function SubmissionCard({ submission, showUser, userEmail, onClick }: SubmissionCardProps) {
  return (
    <Card 
      className={`glass-card transition-all ${onClick ? 'cursor-pointer hover:border-primary/50' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{submission.title}</CardTitle>
            {showUser && userEmail && (
              <p className="text-sm text-muted-foreground mt-1">
                Submitted by: {userEmail}
              </p>
            )}
          </div>
          <Badge className={SUBMISSION_STATUS_COLORS[submission.status]}>
            {SUBMISSION_STATUS_LABELS[submission.status]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            <span>{ASSET_TYPE_LABELS[submission.asset_type as AssetType] || submission.asset_type}</span>
          </div>
          {submission.estimated_quantity && (
            <div className="flex items-center gap-1.5">
              <span>{submission.estimated_quantity} {submission.unit || 'units'}</span>
            </div>
          )}
          {submission.location_description && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              <span className="truncate max-w-[150px]">{submission.location_description}</span>
            </div>
          )}
        </div>
        
        {submission.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {submission.description}
          </p>
        )}

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 border-t border-border">
          <Clock className="h-3.5 w-3.5" />
          <span>Submitted {format(new Date(submission.created_at), 'MMM d, yyyy')}</span>
        </div>

        {submission.admin_notes && (
          <div className="bg-muted/50 rounded-md p-3 text-sm">
            <p className="font-medium text-foreground mb-1">Admin Notes:</p>
            <p className="text-muted-foreground">{submission.admin_notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
