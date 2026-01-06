import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EnterpriseAccount {
  id: string;
  organization_name: string;
}

interface EnterpriseInvoiceModalProps {
  accounts: EnterpriseAccount[];
  selectedAccountId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EnterpriseInvoiceModal({ 
  accounts, 
  selectedAccountId, 
  onClose, 
  onSuccess 
}: EnterpriseInvoiceModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Generate invoice number
  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ENT-${year}${month}-${random}`;
  };

  const [formData, setFormData] = useState({
    enterprise_account_id: selectedAccountId || '',
    invoice_number: generateInvoiceNumber(),
    description: '',
    amount_cents: '',
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('enterprise_invoices').insert({
        enterprise_account_id: formData.enterprise_account_id,
        invoice_number: formData.invoice_number,
        description: formData.description,
        amount_cents: Math.round(parseFloat(formData.amount_cents) * 100),
        due_date: formData.due_date,
        status: 'pending',
      });

      if (error) throw error;

      toast.success('Invoice created successfully');
      onSuccess();
    } catch (error: any) {
      if (error.message?.includes('duplicate key')) {
        toast.error('Invoice number already exists. Please use a different number.');
      } else {
        toast.error(error.message || 'Failed to create invoice');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Create Invoice</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="account">Enterprise Account <span className="text-destructive">*</span></Label>
            <Select
              value={formData.enterprise_account_id}
              onValueChange={(v) => setFormData({ ...formData, enterprise_account_id: v })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.organization_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice_number">Invoice Number <span className="text-destructive">*</span></Label>
              <Input
                id="invoice_number"
                value={formData.invoice_number}
                onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($) <span className="text-destructive">*</span></Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={formData.amount_cents}
                onChange={(e) => setFormData({ ...formData, amount_cents: e.target.value })}
                placeholder="10000"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">Due Date <span className="text-destructive">*</span></Label>
            <Input
              id="due_date"
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Annual platform access fee, Q1 2026"
              rows={3}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !formData.enterprise_account_id}>
              {isSubmitting ? (
                <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                'Create Invoice'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
