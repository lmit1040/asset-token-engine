import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Asset, AssetType, OwnerEntity, ASSET_TYPE_LABELS, OWNER_ENTITY_LABELS } from '@/types/database';

interface AssetFormProps {
  asset?: Asset;
  onSubmit: (data: Partial<Asset>) => Promise<void>;
  isSubmitting: boolean;
}

export function AssetForm({ asset, onSubmit, isSubmitting }: AssetFormProps) {
  const [formData, setFormData] = useState({
    name: asset?.name || '',
    asset_type: asset?.asset_type || 'GOLDBACK' as AssetType,
    quantity: asset?.quantity?.toString() || '',
    unit: asset?.unit || '',
    storage_location: asset?.storage_location || '',
    owner_entity: asset?.owner_entity || 'PERSONAL_TRUST' as OwnerEntity,
    acquisition_date: asset?.acquisition_date || '',
    description: asset?.description || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      ...formData,
      quantity: parseFloat(formData.quantity) || 0,
    });
  };

  const unitSuggestions: Record<AssetType, string> = {
    GOLDBACK: 'GOLDBACK',
    SILVER: 'OZ_SILVER',
    COPPER: 'LB_COPPER',
    GOLD_CERTIFICATE: 'COUNT',
    SILVER_CERTIFICATE: 'COUNT',
    OTHER: 'COUNT',
  };

  const handleAssetTypeChange = (value: AssetType) => {
    setFormData({
      ...formData,
      asset_type: value,
      unit: unitSuggestions[value],
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name">Asset Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., 50 oz Silver Bar Batch A"
            className="input-dark"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="asset_type">Asset Type</Label>
          <Select 
            value={formData.asset_type} 
            onValueChange={(v) => handleAssetTypeChange(v as AssetType)}
          >
            <SelectTrigger className="input-dark">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="number"
            step="any"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            placeholder="e.g., 50"
            className="input-dark"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            placeholder="e.g., OZ_SILVER"
            className="input-dark"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="owner_entity">Owner Entity</Label>
          <Select 
            value={formData.owner_entity} 
            onValueChange={(v) => setFormData({ ...formData, owner_entity: v as OwnerEntity })}
          >
            <SelectTrigger className="input-dark">
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
          <Label htmlFor="acquisition_date">Acquisition Date</Label>
          <Input
            id="acquisition_date"
            type="date"
            value={formData.acquisition_date}
            onChange={(e) => setFormData({ ...formData, acquisition_date: e.target.value })}
            className="input-dark"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="storage_location">Storage Location</Label>
        <Input
          id="storage_location"
          value={formData.storage_location}
          onChange={(e) => setFormData({ ...formData, storage_location: e.target.value })}
          placeholder="e.g., Vault A, Section 3"
          className="input-dark"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Additional details about the asset..."
          className="input-dark min-h-[100px]"
        />
      </div>

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
          ) : asset ? 'Update Asset' : 'Create Asset'}
        </Button>
      </div>
    </form>
  );
}
