import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Check, X, Loader2, Trash2, Coins } from 'lucide-react';
import { TOKEN_MODEL_LABELS, TokenModel } from '@/types/database';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface TokenProposal {
  id: string;
  asset_id: string;
  proposed_by: string;
  token_name: string;
  token_symbol: string;
  token_model: TokenModel;
  decimals: number;
  total_supply: number;
  notes: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_notes: string | null;
  created_at: string;
}

interface TokenProposalCardProps {
  proposal: TokenProposal;
  isAdmin: boolean;
  isOwner: boolean;
  onUpdate: () => void;
}

const STATUS_COLORS = {
  PENDING: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  APPROVED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/20',
};

export function TokenProposalCard({
  proposal,
  isAdmin,
  isOwner,
  onUpdate,
}: TokenProposalCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminNotes, setAdminNotes] = useState(proposal.admin_notes || '');

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create the actual token definition
      const { error: tokenError } = await supabase
        .from('token_definitions')
        .insert({
          asset_id: proposal.asset_id,
          token_name: proposal.token_name,
          token_symbol: proposal.token_symbol,
          token_model: proposal.token_model,
          decimals: proposal.decimals,
          total_supply: proposal.total_supply,
          notes: proposal.notes,
        });

      if (tokenError) throw tokenError;

      // Update proposal status
      const { error: updateError } = await supabase
        .from('token_definition_proposals')
        .update({
          status: 'APPROVED',
          admin_notes: adminNotes || null,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', proposal.id);

      if (updateError) throw updateError;

      toast.success('Token definition approved and created');
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve proposal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('token_definition_proposals')
        .update({
          status: 'REJECTED',
          admin_notes: adminNotes || null,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', proposal.id);

      if (error) throw error;

      toast.success('Token proposal rejected');
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject proposal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('token_definition_proposals')
        .delete()
        .eq('id', proposal.id);

      if (error) throw error;

      toast.success('Proposal deleted');
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete proposal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">
              {proposal.token_name} ({proposal.token_symbol})
            </CardTitle>
          </div>
          <Badge className={STATUS_COLORS[proposal.status]}>
            {proposal.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground">Model</p>
            <p className="font-medium">{TOKEN_MODEL_LABELS[proposal.token_model]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Supply</p>
            <p className="font-medium">{Number(proposal.total_supply).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Decimals</p>
            <p className="font-medium">{proposal.decimals}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Proposed</p>
            <p className="font-medium">{format(new Date(proposal.created_at), 'MMM d, yyyy')}</p>
          </div>
        </div>

        {proposal.notes && (
          <div className="text-sm">
            <p className="text-muted-foreground">Notes</p>
            <p className="bg-muted/50 rounded p-2 mt-1">{proposal.notes}</p>
          </div>
        )}

        {proposal.admin_notes && proposal.status !== 'PENDING' && (
          <div className="text-sm">
            <p className="text-muted-foreground">Admin Notes</p>
            <p className="bg-muted/50 rounded p-2 mt-1">{proposal.admin_notes}</p>
          </div>
        )}

        {/* Admin actions for pending proposals */}
        {isAdmin && proposal.status === 'PENDING' && (
          <div className="space-y-3 pt-3 border-t border-border">
            <Textarea
              placeholder="Add admin notes..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="input-dark min-h-[60px] text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isSubmitting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={isSubmitting}
                className="flex-1"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                Reject
              </Button>
            </div>
          </div>
        )}

        {/* Owner can delete pending proposals */}
        {isOwner && proposal.status === 'PENDING' && !isAdmin && (
          <div className="pt-3 border-t border-border">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="w-full text-destructive">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Proposal
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Proposal</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this token proposal? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
