import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface EnterpriseAccountModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function EnterpriseAccountModal({ onClose, onSuccess }: EnterpriseAccountModalProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    organization_name: '',
    contract_reference: '',
    annual_fee_cents: '',
    billing_contact_name: '',
    billing_contact_email: '',
    contract_start_date: new Date().toISOString().split('T')[0],
    contract_end_date: '',
    api_access_enabled: false,
    white_label_enabled: false,
    custom_asset_classes: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      const customClasses = formData.custom_asset_classes
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);

      const { error } = await supabase.from('enterprise_accounts').insert({
        organization_name: formData.organization_name,
        contract_reference: formData.contract_reference,
        annual_fee_cents: Math.round(parseFloat(formData.annual_fee_cents) * 100),
        billing_contact_name: formData.billing_contact_name || null,
        billing_contact_email: formData.billing_contact_email || null,
        contract_start_date: formData.contract_start_date,
        contract_end_date: formData.contract_end_date || null,
        api_access_enabled: formData.api_access_enabled,
        white_label_enabled: formData.white_label_enabled,
        custom_asset_classes: customClasses.length > 0 ? customClasses : null,
        notes: formData.notes || null,
        created_by: user.id,
      });

      if (error) throw error;

      toast.success('Enterprise account created successfully');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg p-6 animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Create Enterprise Account</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="organization_name">Organization Name <span className="text-destructive">*</span></Label>
            <Input
              id="organization_name"
              value={formData.organization_name}
              onChange={(e) => setFormData({ ...formData, organization_name: e.target.value })}
              placeholder="e.g., Acme Holdings Inc."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contract_reference">Contract Reference <span className="text-destructive">*</span></Label>
              <Input
                id="contract_reference"
                value={formData.contract_reference}
                onChange={(e) => setFormData({ ...formData, contract_reference: e.target.value })}
                placeholder="e.g., ENT-2026-001"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="annual_fee_cents">Annual Fee ($) <span className="text-destructive">*</span></Label>
              <Input
                id="annual_fee_cents"
                type="number"
                min="0"
                step="0.01"
                value={formData.annual_fee_cents}
                onChange={(e) => setFormData({ ...formData, annual_fee_cents: e.target.value })}
                placeholder="10000"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="billing_contact_name">Billing Contact</Label>
              <Input
                id="billing_contact_name"
                value={formData.billing_contact_name}
                onChange={(e) => setFormData({ ...formData, billing_contact_name: e.target.value })}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing_contact_email">Billing Email</Label>
              <Input
                id="billing_contact_email"
                type="email"
                value={formData.billing_contact_email}
                onChange={(e) => setFormData({ ...formData, billing_contact_email: e.target.value })}
                placeholder="billing@acme.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contract_start_date">Contract Start <span className="text-destructive">*</span></Label>
              <Input
                id="contract_start_date"
                type="date"
                value={formData.contract_start_date}
                onChange={(e) => setFormData({ ...formData, contract_start_date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract_end_date">Contract End</Label>
              <Input
                id="contract_end_date"
                type="date"
                value={formData.contract_end_date}
                onChange={(e) => setFormData({ ...formData, contract_end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Enterprise Features</p>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="api_access">API Access</Label>
                <p className="text-xs text-muted-foreground">Enable programmatic API access</p>
              </div>
              <Switch
                id="api_access"
                checked={formData.api_access_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, api_access_enabled: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="white_label">White Label</Label>
                <p className="text-xs text-muted-foreground">Custom branding support</p>
              </div>
              <Switch
                id="white_label"
                checked={formData.white_label_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, white_label_enabled: checked })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom_asset_classes">Custom Asset Classes</Label>
            <Input
              id="custom_asset_classes"
              value={formData.custom_asset_classes}
              onChange={(e) => setFormData({ ...formData, custom_asset_classes: e.target.value })}
              placeholder="Insurance, Structured Assets, Real Estate (comma separated)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Contract details, special terms..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
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
