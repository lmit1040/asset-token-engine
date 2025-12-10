import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Asset, TokenModel, TOKEN_MODEL_LABELS } from '@/types/database';

interface ProposeTokenDefinitionModalProps {
  asset: Asset;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProposeTokenDefinitionModal({
  asset,
  onClose,
  onSuccess,
}: ProposeTokenDefinitionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    tokenName: '',
    tokenSymbol: '',
    tokenModel: 'ONE_TO_ONE' as TokenModel,
    decimals: 0,
    totalSupply: asset.quantity || 0,
    notes: '',
  });

  const calculateSupply = (model: TokenModel, decimals: number): number => {
    const baseQuantity = Number(asset.quantity) || 0;
    switch (model) {
      case 'ONE_TO_ONE':
        return baseQuantity;
      case 'FRACTIONAL':
        return baseQuantity * Math.pow(10, decimals);
      case 'VAULT_BASKET':
        return formData.totalSupply;
      default:
        return baseQuantity;
    }
  };

  const handleModelChange = (model: TokenModel) => {
    const newSupply = calculateSupply(model, formData.decimals);
    setFormData((prev) => ({
      ...prev,
      tokenModel: model,
      totalSupply: model === 'VAULT_BASKET' ? prev.totalSupply : newSupply,
    }));
  };

  const handleDecimalsChange = (decimals: number) => {
    const newSupply = calculateSupply(formData.tokenModel, decimals);
    setFormData((prev) => ({
      ...prev,
      decimals,
      totalSupply: formData.tokenModel === 'VAULT_BASKET' ? prev.totalSupply : newSupply,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.tokenName.trim() || !formData.tokenSymbol.trim()) {
      toast.error('Please fill in required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('token_definition_proposals')
        .insert({
          asset_id: asset.id,
          proposed_by: user.id,
          token_name: formData.tokenName.trim(),
          token_symbol: formData.tokenSymbol.trim().toUpperCase(),
          token_model: formData.tokenModel,
          decimals: formData.decimals,
          total_supply: formData.totalSupply,
          notes: formData.notes.trim() || null,
          status: 'PENDING',
        });

      if (error) throw error;

      toast.success('Token definition proposal submitted for admin review');
      onSuccess();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit proposal');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Propose Token Definition</DialogTitle>
          <DialogDescription>
            Submit a token definition proposal for "{asset.name}". An administrator will review and approve it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tokenName">Token Name *</Label>
              <Input
                id="tokenName"
                value={formData.tokenName}
                onChange={(e) => setFormData((prev) => ({ ...prev, tokenName: e.target.value }))}
                placeholder="e.g., Gold Token"
                className="input-dark"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tokenSymbol">Symbol *</Label>
              <Input
                id="tokenSymbol"
                value={formData.tokenSymbol}
                onChange={(e) => setFormData((prev) => ({ ...prev, tokenSymbol: e.target.value.toUpperCase() }))}
                placeholder="e.g., GLD"
                maxLength={10}
                className="input-dark"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tokenModel">Token Model</Label>
            <Select
              value={formData.tokenModel}
              onValueChange={(v) => handleModelChange(v as TokenModel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TOKEN_MODEL_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.tokenModel === 'ONE_TO_ONE' && '1 token = 1 unit of asset'}
              {formData.tokenModel === 'FRACTIONAL' && 'Tokens represent fractional ownership'}
              {formData.tokenModel === 'VAULT_BASKET' && 'Custom supply for basket of assets'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="decimals">Decimals</Label>
              <Input
                id="decimals"
                type="number"
                min={0}
                max={18}
                value={formData.decimals}
                onChange={(e) => handleDecimalsChange(parseInt(e.target.value) || 0)}
                className="input-dark"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="totalSupply">Total Supply</Label>
              <Input
                id="totalSupply"
                type="number"
                value={formData.totalSupply}
                onChange={(e) => setFormData((prev) => ({ ...prev, totalSupply: parseFloat(e.target.value) || 0 }))}
                disabled={formData.tokenModel !== 'VAULT_BASKET'}
                className="input-dark"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Any additional notes about this token..."
              className="input-dark min-h-[80px]"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Proposal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
