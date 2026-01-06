import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FeeNotice } from '@/components/fees/FeeNotice';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Asset, TokenModel, TOKEN_MODEL_LABELS } from '@/types/database';
interface TokenDefinitionModalProps {
  asset: Asset;
  onClose: () => void;
  onSuccess: () => void;
}

export function TokenDefinitionModal({ asset, onClose, onSuccess }: TokenDefinitionModalProps) {
  const [formData, setFormData] = useState({
    token_name: '',
    token_symbol: '',
    token_model: 'ONE_TO_ONE' as TokenModel,
    decimals: 0,
    total_supply: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const calculateSupply = (model: TokenModel, decimals: number): number => {
    const quantity = Number(asset.quantity);
    switch (model) {
      case 'ONE_TO_ONE':
        return quantity;
      case 'FRACTIONAL':
        return quantity * Math.pow(10, decimals);
      case 'VAULT_BASKET':
        return 0; // Admin enters manually
    }
  };

  const handleModelChange = (model: TokenModel) => {
    const supply = calculateSupply(model, formData.decimals);
    setFormData({
      ...formData,
      token_model: model,
      total_supply: model === 'VAULT_BASKET' ? '' : supply.toString(),
    });
  };

  const handleDecimalsChange = (decimals: number) => {
    const supply = calculateSupply(formData.token_model, decimals);
    setFormData({
      ...formData,
      decimals,
      total_supply: formData.token_model === 'VAULT_BASKET' ? formData.total_supply : supply.toString(),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('token_definitions')
        .insert({
          asset_id: asset.id,
          token_name: formData.token_name,
          token_symbol: formData.token_symbol.toUpperCase(),
          token_model: formData.token_model,
          decimals: formData.decimals,
          total_supply: parseFloat(formData.total_supply) || 0,
          notes: formData.notes || null,
        });

      if (error) throw error;

      toast.success('Token definition created successfully');
      onSuccess();
    } catch (error: any) {
      if (error.message?.includes('duplicate key')) {
        toast.error('Token symbol already exists. Please choose a different symbol.');
      } else {
        toast.error(error.message || 'Failed to create token definition');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-card w-full max-w-lg p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Create Token Definition</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="bg-muted/30 rounded-lg p-4 mb-4">
          <p className="text-sm text-muted-foreground">Creating token for</p>
          <p className="font-semibold text-foreground">{asset.name}</p>
          <p className="text-sm text-primary">
            {Number(asset.quantity).toLocaleString()} {asset.unit}
          </p>
        </div>

        <FeeNotice feeKey="TOKEN_DEPLOY" className="mb-6" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="token_name">Token Name</Label>
              <Input
                id="token_name"
                value={formData.token_name}
                onChange={(e) => setFormData({ ...formData, token_name: e.target.value })}
                placeholder="e.g., Goldback 1:1 Token"
                className="input-dark"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="token_symbol">Token Symbol</Label>
              <Input
                id="token_symbol"
                value={formData.token_symbol}
                onChange={(e) => setFormData({ ...formData, token_symbol: e.target.value.toUpperCase() })}
                placeholder="e.g., GBX1"
                className="input-dark uppercase"
                maxLength={10}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="token_model">Token Model</Label>
            <Select value={formData.token_model} onValueChange={(v) => handleModelChange(v as TokenModel)}>
              <SelectTrigger className="input-dark">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TOKEN_MODEL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.token_model === 'ONE_TO_ONE' && '1 token = 1 unit of the asset'}
              {formData.token_model === 'FRACTIONAL' && 'Token supply = quantity × 10^decimals'}
              {formData.token_model === 'VAULT_BASKET' && 'Enter custom total supply'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="decimals">Decimals</Label>
              <Input
                id="decimals"
                type="number"
                min="0"
                max="18"
                value={formData.decimals}
                onChange={(e) => handleDecimalsChange(parseInt(e.target.value) || 0)}
                className="input-dark"
                disabled={formData.token_model === 'ONE_TO_ONE'}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="total_supply">Total Supply</Label>
              <Input
                id="total_supply"
                type="number"
                step="any"
                value={formData.total_supply}
                onChange={(e) => setFormData({ ...formData, total_supply: e.target.value })}
                className="input-dark"
                readOnly={formData.token_model !== 'VAULT_BASKET'}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this token..."
              className="input-dark"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                'Create Token'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
