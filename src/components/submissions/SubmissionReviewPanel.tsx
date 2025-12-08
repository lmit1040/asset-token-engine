import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UserAssetSubmission, SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_COLORS, SubmissionStatus } from '@/types/submissions';
import { ASSET_TYPE_LABELS, AssetType, OWNER_ENTITY_LABELS, OwnerEntity } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Loader2, Check, X, Eye, Package, MapPin, FileText, Paperclip, ExternalLink, Image as ImageIcon, ArrowRight } from 'lucide-react';

interface DocumentItem {
  name: string;
  url: string;
  type?: string;
}

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
  const [showConversionDialog, setShowConversionDialog] = useState(false);
  const [conversionData, setConversionData] = useState({
    ownerEntity: 'PERSONAL_TRUST' as OwnerEntity,
    acquisitionDate: format(new Date(), 'yyyy-MM-dd'),
  });

  const handleStatusChange = async (newStatus: SubmissionStatus) => {
    if (!submission) return;

    // For approval, show the conversion dialog first
    if (newStatus === 'APPROVED') {
      setShowConversionDialog(true);
      return;
    }

    await updateSubmissionStatus(newStatus);
  };

  const updateSubmissionStatus = async (newStatus: SubmissionStatus, createdAssetId?: string) => {
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
        
        if (createdAssetId) {
          updateData.created_asset_id = createdAssetId;
        }
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

  const handleApproveAndConvert = async () => {
    if (!submission) return;

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create the asset from submission data
      const { data: newAsset, error: assetError } = await supabase
        .from('assets')
        .insert({
          name: submission.title,
          asset_type: submission.asset_type as AssetType,
          quantity: submission.estimated_quantity || 0,
          unit: submission.unit || 'units',
          storage_location: submission.location_description,
          description: submission.description,
          owner_entity: conversionData.ownerEntity,
          acquisition_date: conversionData.acquisitionDate,
          created_by: user?.id,
        })
        .select()
        .single();

      if (assetError) throw assetError;

      // Copy uploaded documents to proof_of_reserve_files
      if (submission.documents && Array.isArray(submission.documents)) {
        const docs = submission.documents as DocumentItem[];
        if (docs.length > 0) {
          const proofFiles = docs.map((doc) => ({
            asset_id: newAsset.id,
            file_name: doc.name || 'Uploaded Document',
            file_url: doc.url,
            file_type: doc.type || 'application/octet-stream',
            file_hash: btoa(doc.url).slice(0, 64), // Generate hash from URL as placeholder
            uploaded_by: user?.id,
          }));

          const { error: proofError } = await supabase
            .from('proof_of_reserve_files')
            .insert(proofFiles);

          if (proofError) {
            console.error('Failed to copy proof files:', proofError);
            // Don't fail the whole operation, just log the error
          }
        }
      }

      // Update the submission with the created asset reference
      await updateSubmissionStatus('APPROVED', newAsset.id);
      
      toast.success('Asset created successfully from submission');
      setShowConversionDialog(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create asset');
      setIsSubmitting(false);
    }
  };

  if (!submission) return null;

  return (
    <>
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
            {/* Show created asset link if approved */}
            {submission.status === 'APPROVED' && submission.created_asset_id && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-3">
                <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Asset created from this submission
                  <a 
                    href={`/assets/${submission.created_asset_id}`}
                    className="underline hover:no-underline ml-1"
                  >
                    View Asset →
                  </a>
                </p>
              </div>
            )}

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

            {/* Attached Documents */}
            {submission.documents && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4" /> Attached Documents
                </p>
                <div className="bg-muted/50 rounded-md p-3 space-y-2">
                  {Array.isArray(submission.documents) ? (
                    (submission.documents as DocumentItem[]).length > 0 ? (
                      (submission.documents as DocumentItem[]).map((doc, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          {doc.type?.startsWith('image/') ? (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          <a 
                            href={doc.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            {doc.name || `Document ${index + 1}`}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No documents attached</p>
                    )
                  ) : typeof submission.documents === 'object' && submission.documents !== null ? (
                    <pre className="text-xs overflow-auto max-h-32">
                      {JSON.stringify(submission.documents, null, 2)}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground">No documents attached</p>
                  )}
                </div>
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
                    onClick={() => updateSubmissionStatus('UNDER_REVIEW')}
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
                      Approve & Create Asset
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

      {/* Asset Conversion Confirmation Dialog */}
      <AlertDialog open={showConversionDialog} onOpenChange={setShowConversionDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5 text-emerald-500" />
              Convert to Asset
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will approve the submission and create a new asset in the inventory. Please confirm the details below.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-md p-3 text-sm space-y-1">
              <p><strong>Name:</strong> {submission?.title}</p>
              <p><strong>Type:</strong> {ASSET_TYPE_LABELS[submission?.asset_type as AssetType] || submission?.asset_type}</p>
              <p><strong>Quantity:</strong> {submission?.estimated_quantity || 0} {submission?.unit || 'units'}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ownerEntity">Owner Entity</Label>
              <Select
                value={conversionData.ownerEntity}
                onValueChange={(value) => setConversionData(prev => ({ ...prev, ownerEntity: value as OwnerEntity }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OWNER_ENTITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="acquisitionDate">Acquisition Date</Label>
              <Input
                type="date"
                id="acquisitionDate"
                value={conversionData.acquisitionDate}
                onChange={(e) => setConversionData(prev => ({ ...prev, acquisitionDate: e.target.value }))}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApproveAndConvert}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve & Create Asset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
