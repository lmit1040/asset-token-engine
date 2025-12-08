import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserAssetSubmission, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_COLORS, SubmissionStatus } from '@/types/submissions';
import { ASSET_TYPE_LABELS, AssetType } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Loader2, Check, X, Eye, Package, MapPin, FileText } from 'lucide-react';

interface SubmissionReviewPanelProps {
  submission: UserAssetSubmission | null;
  userEmail?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function SubmissionReviewPanel({
  submission,
  userEmail,
  open,
  onOpenChange,
  onUpdate,
}: SubmissionReviewPanelProps) {
  const { isAdmin, role } = useAuth();
  const isAssetManager = role === 'asset_manager';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminNotes, setAdminNotes] = useState(submission?.admin_notes || '');

  const handleStatusChange = async (newStatus: SubmissionStatus) => {
    if (!submission) return;

    setIsSubmitting(true);
    try {
      const updateData: Record<string, unknown> = {
        status: newStatus,
        admin_notes: adminNotes,
      };

      // Only admins can approve/reject
      if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
        if (!isAdmin) {
          toast.error('Only administrators can approve or reject submissions');
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        updateData.approved_by = user?.id;
        updateData.approved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('user_asset_submissions')
        .update(updateData)
        .eq('id', submission.id);

      if (error) throw error;

      toast.success(`Submission ${SUBMISSION_STATUS_LABELS[newStatus].toLowerCase()}`);
      onOpenChange(false);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update submission');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!submission) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">{submission.title}</DialogTitle>
              <DialogDescription className="mt-1">
                Submitted by {userEmail || 'Unknown'} on {format(new Date(submission.created_at), 'MMMM d, yyyy')}
              </DialogDescription>
            </div>
            <Badge className={SUBMISSION_STATUS_COLORS[submission.status]}>
              {SUBMISSION_STATUS_LABELS[submission.status]}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Package className="h-4 w-4" /> Asset Type
              </p>
              <p className="font-medium">
                {ASSET_TYPE_LABELS[submission.asset_type as AssetType] || submission.asset_type}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Quantity</p>
              <p className="font-medium">
                {submission.estimated_quantity ? `${submission.estimated_quantity} ${submission.unit || 'units'}` : 'Not specified'}
              </p>
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Storage Location
              </p>
              <p className="font-medium">{submission.location_description || 'Not specified'}</p>
            </div>
          </div>

          {/* Description */}
          {submission.description && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <FileText className="h-4 w-4" /> Description
              </p>
              <p className="text-sm bg-muted/50 rounded-md p-3">{submission.description}</p>
            </div>
          )}

          {/* Admin Notes */}
          <div className="space-y-2">
            <Label htmlFor="admin_notes">Admin Notes</Label>
            <Textarea
              id="admin_notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Add notes about this submission..."
              className="input-dark min-h-[100px]"
              disabled={submission.status === 'APPROVED' || submission.status === 'REJECTED'}
            />
          </div>

          {/* Action Buttons */}
          {(submission.status === 'PENDING' || submission.status === 'UNDER_REVIEW') && (
            <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
              {submission.status === 'PENDING' && (isAdmin || isAssetManager) && (
                <Button
                  onClick={() => handleStatusChange('UNDER_REVIEW')}
                  disabled={isSubmitting}
                  variant="outline"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Eye className="mr-2 h-4 w-4" />
                  Mark Under Review
                </Button>
              )}
              
              {isAdmin && (
                <>
                  <Button
                    onClick={() => handleStatusChange('APPROVED')}
                    disabled={isSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Check className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleStatusChange('REJECTED')}
                    disabled={isSubmitting}
                    variant="destructive"
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <X className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
