import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ASSET_TYPE_LABELS, AssetType } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface SubmissionFormProps {
  onSuccess?: () => void;
}

export function SubmissionForm({ onSuccess }: SubmissionFormProps) {
  const { user, role } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    asset_type: '' as AssetType | '',
    title: '',
    description: '',
    estimated_quantity: '',
    unit: '',
    location_description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !formData.asset_type || !formData.title) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('user_asset_submissions')
        .insert({
          user_id: user.id,
          submitted_by_role: role || 'standard_user',
          asset_type: formData.asset_type,
          title: formData.title,
          description: formData.description || null,
          estimated_quantity: formData.estimated_quantity ? parseFloat(formData.estimated_quantity) : null,
          unit: formData.unit || null,
          location_description: formData.location_description || null,
        });

      if (error) throw error;

      toast.success('Asset submission created successfully');
      setFormData({
        asset_type: '',
        title: '',
        description: '',
        estimated_quantity: '',
        unit: '',
        location_description: '',
      });
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit asset');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="asset_type">Asset Type *</Label>
          <Select
            value={formData.asset_type}
            onValueChange={(value) => setFormData({ ...formData, asset_type: value as AssetType })}
          >
            <SelectTrigger className="input-dark">
              <SelectValue placeholder="Select asset type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., 100 oz Silver Bar"
            className="input-dark"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe the asset in detail..."
          className="input-dark min-h-[100px]"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="estimated_quantity">Estimated Quantity</Label>
          <Input
            id="estimated_quantity"
            type="number"
            step="any"
            value={formData.estimated_quantity}
            onChange={(e) => setFormData({ ...formData, estimated_quantity: e.target.value })}
            placeholder="e.g., 100"
            className="input-dark"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            placeholder="e.g., oz, lb, piece"
            className="input-dark"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location_description">Storage Location</Label>
        <Input
          id="location_description"
          value={formData.location_description}
          onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
          placeholder="Where is the asset stored?"
          className="input-dark"
        />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit Asset for Review
      </Button>
    </form>
  );
}
