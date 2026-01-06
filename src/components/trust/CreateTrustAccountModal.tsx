import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FeeNotice } from '@/components/fees/FeeNotice';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface CreateTrustAccountModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const ENTITY_TYPES = ['Trust', 'LLC', 'SPV', 'Family Office'] as const;
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];

export function CreateTrustAccountModal({ onClose, onSuccess }: CreateTrustAccountModalProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    legal_name: '',
    entity_type: '' as typeof ENTITY_TYPES[number] | '',
    ein_last_four: '',
    formation_state: '',
    formation_date: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.entity_type) return;

    setIsSubmitting(true);
    try {
      // Calculate annual renewal date (1 year from now)
      const renewalDate = new Date();
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);

      const { error } = await supabase.from('trust_accounts').insert({
        owner_user_id: user.id,
        legal_name: formData.legal_name,
        entity_type: formData.entity_type,
        ein_last_four: formData.ein_last_four || null,
        formation_state: formData.formation_state || null,
        formation_date: formData.formation_date || null,
        notes: formData.notes || null,
        annual_renewal_date: renewalDate.toISOString().split('T')[0],
      });

      if (error) throw error;

      toast.success('Trust account created successfully');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create trust account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Create Trust Account</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <FeeNotice feeKey="ASSET_ONBOARDING" className="mb-6" />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="legal_name">Legal Name <span className="text-destructive">*</span></Label>
            <Input
              id="legal_name"
              value={formData.legal_name}
              onChange={(e) => setFormData({ ...formData, legal_name: e.target.value })}
              placeholder="e.g., Smith Family Trust"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="entity_type">Entity Type <span className="text-destructive">*</span></Label>
            <Select
              value={formData.entity_type}
              onValueChange={(v) => setFormData({ ...formData, entity_type: v as typeof ENTITY_TYPES[number] })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select entity type" />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ein_last_four">EIN (Last 4 digits)</Label>
              <Input
                id="ein_last_four"
                value={formData.ein_last_four}
                onChange={(e) => setFormData({ ...formData, ein_last_four: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="1234"
                maxLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="formation_date">Formation Date</Label>
              <Input
                id="formation_date"
                type="date"
                value={formData.formation_date}
                onChange={(e) => setFormData({ ...formData, formation_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="formation_state">State of Formation</Label>
            <Select
              value={formData.formation_state}
              onValueChange={(v) => setFormData({ ...formData, formation_state: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional information about this entity..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.legal_name || !formData.entity_type}>
              {isSubmitting ? (
                <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                'Create Account'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
