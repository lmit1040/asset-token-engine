import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { FileText, Download, ExternalLink, CreditCard, Loader2 } from 'lucide-react';
import { startStripeCheckout } from '@/lib/payments';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  invoice_number: string;
  description: string;
  amount_cents: number;
  status: string;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  trust_account_id: string;
}

interface TrustInvoiceHistoryProps {
  trustAccountIds: string[];
}

export function TrustInvoiceHistory({ trustAccountIds }: TrustInvoiceHistoryProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  const handlePayInvoice = async (invoice: Invoice) => {
    try {
      setPayingInvoiceId(invoice.id);
      
      // Get the fee for trust invoice payment
      const { data: fee } = await supabase
        .from('fee_catalog')
        .select('id')
        .eq('fee_key', 'TRUST_ANNUAL_FEE')
        .eq('tier', 'TRUST')
        .maybeSingle();

      await startStripeCheckout({
        fee_id: fee?.id || invoice.id,
        purpose: 'TRUST_INVOICE',
        related_table: 'trust_invoices',
        related_id: invoice.id,
      });
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(error.message || 'Failed to start payment');
      setPayingInvoiceId(null);
    }
  };

  useEffect(() => {
    const fetchInvoices = async () => {
      if (trustAccountIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('trust_invoices')
          .select('*')
          .in('trust_account_id', trustAccountIds)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setInvoices(data || []);
      } catch (error) {
        console.error('Error fetching invoices:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, [trustAccountIds]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-500/10 text-green-400 border-green-500/30">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Pending</Badge>;
      case 'overdue':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Overdue</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="py-12">
          <div className="flex justify-center">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (invoices.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Invoices Yet</h3>
          <p className="text-muted-foreground">
            Your invoice history will appear here once you have billable activity
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-lg">Invoice History</CardTitle>
        <CardDescription>View and download past invoices for your trust accounts</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-mono text-sm">{invoice.invoice_number}</TableCell>
                <TableCell>{invoice.description}</TableCell>
                <TableCell className="font-medium">
                  ${(invoice.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>{format(new Date(invoice.due_date), 'MMM d, yyyy')}</TableCell>
                <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {(invoice.status === 'pending' || invoice.status === 'overdue') && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handlePayInvoice(invoice)}
                        disabled={payingInvoiceId === invoice.id}
                      >
                        {payingInvoiceId === invoice.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CreditCard className="h-4 w-4 mr-1" />
                            Pay Now
                          </>
                        )}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Download">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="View">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
