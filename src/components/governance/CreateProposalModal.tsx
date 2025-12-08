import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProposalType, PROPOSAL_TYPE_LABELS, MIN_MXG_TO_CREATE_PROPOSAL } from '@/types/governance';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { addDays } from 'date-fns';

interface CreateProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mxgBalance: number;
}

export function CreateProposalModal({ isOpen, onClose, onSuccess, mxgBalance }: CreateProposalModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    proposal_type: 'GENERAL' as ProposalType,
    voting_duration_days: 7,
  });

  const canCreate = mxgBalance >= MIN_MXG_TO_CREATE_PROPOSAL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canCreate) return;

    setIsSubmitting(true);
    try {
      const votingStartsAt = new Date();
      const votingEndsAt = addDays(votingStartsAt, formData.voting_duration_days);

      const { error } = await supabase
        .from('governance_proposals')
        .insert({
          title: formData.title,
          description: formData.description,
          proposal_type: formData.proposal_type,
          status: 'ACTIVE',
          created_by: user.id,
          voting_starts_at: votingStartsAt.toISOString(),
          voting_ends_at: votingEndsAt.toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Proposal created',
        description: 'Your governance proposal is now active for voting.',
      });

      setFormData({
        title: '',
        description: '',
        proposal_type: 'GENERAL',
        voting_duration_days: 7,
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error creating proposal:', error);
      toast({
        title: 'Error',
        description: 'Failed to create proposal. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg glass-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Create Governance Proposal</DialogTitle>
        </DialogHeader>

        {!canCreate ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground mb-2">
              You need at least {MIN_MXG_TO_CREATE_PROPOSAL} MXG to create a proposal.
            </p>
            <p className="text-sm text-muted-foreground">
              Your balance: {mxgBalance.toLocaleString()} MXG
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Enter proposal title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="input-dark"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe your proposal in detail..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                rows={5}
                className="input-dark resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Proposal Type</Label>
                <Select
                  value={formData.proposal_type}
                  onValueChange={(value) => setFormData({ ...formData, proposal_type: value as ProposalType })}
                >
                  <SelectTrigger className="input-dark">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROPOSAL_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Voting Duration</Label>
                <Select
                  value={formData.voting_duration_days.toString()}
                  onValueChange={(value) => setFormData({ ...formData, voting_duration_days: parseInt(value) })}
                >
                  <SelectTrigger className="input-dark">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="5">5 days</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gold-gradient text-primary-foreground">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Proposal'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
