import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EnterpriseAccountModal } from '@/components/enterprise/EnterpriseAccountModal';
import { EnterpriseInvoiceModal } from '@/components/enterprise/EnterpriseInvoiceModal';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { 
  Building, Plus, FileText, Users, Key, Palette, 
  MoreVertical, DollarSign, Calendar, CheckCircle2 
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface EnterpriseAccount {
  id: string;
  organization_name: string;
  contract_reference: string;
  annual_fee_cents: number;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  contract_start_date: string;
  contract_end_date: string | null;
  is_active: boolean;
  api_access_enabled: boolean;
  white_label_enabled: boolean;
  custom_asset_classes: string[] | null;
  created_at: string;
}

interface EnterpriseInvoice {
  id: string;
  enterprise_account_id: string;
  invoice_number: string;
  description: string;
  amount_cents: number;
  status: string;
  due_date: string;
  paid_at: string | null;
  payment_reference: string | null;
  created_at: string;
}

export default function AdminEnterpriseConsolePage() {
  const [accounts, setAccounts] = useState<EnterpriseAccount[]>([]);
  const [invoices, setInvoices] = useState<EnterpriseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<EnterpriseAccount | null>(null);

  const fetchData = async () => {
    try {
      const [accountsRes, invoicesRes] = await Promise.all([
        supabase.from('enterprise_accounts').select('*').order('created_at', { ascending: false }),
        supabase.from('enterprise_invoices').select('*').order('created_at', { ascending: false })
      ]);

      if (accountsRes.data) setAccounts(accountsRes.data);
      if (invoicesRes.data) setInvoices(invoicesRes.data);
    } catch (error) {
      console.error('Error fetching enterprise data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalContractValue = accounts.reduce((sum, a) => sum + (a.is_active ? a.annual_fee_cents : 0), 0);
  const pendingInvoices = invoices.filter(i => i.status === 'pending' || i.status === 'sent');
  const pendingAmount = pendingInvoices.reduce((sum, i) => sum + i.amount_cents, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid_external':
        return <Badge className="bg-green-500/10 text-green-400 border-green-500/30">Paid</Badge>;
      case 'pending':
        return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30">Pending</Badge>;
      case 'sent':
        return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30">Sent</Badge>;
      case 'overdue':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Overdue</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const markInvoicePaid = async (invoiceId: string) => {
    try {
      const { error } = await supabase
        .from('enterprise_invoices')
        .update({ status: 'paid_external', paid_at: new Date().toISOString() })
        .eq('id', invoiceId);
      
      if (error) throw error;
      toast.success('Invoice marked as paid');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update invoice');
    }
  };

  const getAccountName = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    return account?.organization_name || 'Unknown';
  };

  return (
    <DashboardLayout title="Enterprise Console" subtitle="Manage enterprise accounts and contracts">
      <div className="space-y-6 animate-fade-in">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{accounts.length}</p>
                  <p className="text-sm text-muted-foreground">Enterprise Accounts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    ${(totalContractValue / 100).toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Annual Contract Value</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{pendingInvoices.length}</p>
                  <p className="text-sm text-muted-foreground">Pending Invoices</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    ${(pendingAmount / 100).toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">Outstanding</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="accounts" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="accounts">Accounts</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowInvoiceModal(true)}>
                <FileText className="h-4 w-4 mr-2" />
                Create Invoice
              </Button>
              <Button onClick={() => setShowAccountModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Account
              </Button>
            </div>
          </div>

          <TabsContent value="accounts">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">Enterprise Accounts</CardTitle>
                <CardDescription>Manage contract-based enterprise customers</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-12">
                    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="text-center py-12">
                    <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Enterprise Accounts</h3>
                    <p className="text-muted-foreground mb-4">Add your first enterprise customer</p>
                    <Button onClick={() => setShowAccountModal(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Account
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead>Contract</TableHead>
                        <TableHead>Annual Fee</TableHead>
                        <TableHead>Features</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts.map((account) => (
                        <TableRow key={account.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">{account.organization_name}</p>
                              <p className="text-sm text-muted-foreground">{account.billing_contact_email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-mono text-sm">{account.contract_reference}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(account.contract_start_date), 'MMM yyyy')}
                                {account.contract_end_date && ` - ${format(new Date(account.contract_end_date), 'MMM yyyy')}`}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${(account.annual_fee_cents / 100).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {account.api_access_enabled && (
                                <Badge variant="outline" className="text-xs"><Key className="h-3 w-3 mr-1" />API</Badge>
                              )}
                              {account.white_label_enabled && (
                                <Badge variant="outline" className="text-xs"><Palette className="h-3 w-3 mr-1" />White Label</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {account.is_active ? (
                              <Badge className="bg-green-500/10 text-green-400 border-green-500/30">
                                Under Contract
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedAccount(account);
                                  setShowInvoiceModal(true);
                                }}>
                                  Create Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem>Manage Users</DropdownMenuItem>
                                <DropdownMenuItem>Edit Contract</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive">Deactivate</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-lg">Enterprise Invoices</CardTitle>
                <CardDescription>Track contract billing and payments</CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Invoices Yet</h3>
                    <p className="text-muted-foreground">Create invoices for enterprise accounts</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Account</TableHead>
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
                          <TableCell>{getAccountName(invoice.enterprise_account_id)}</TableCell>
                          <TableCell>{invoice.description}</TableCell>
                          <TableCell className="font-medium">
                            ${(invoice.amount_cents / 100).toLocaleString()}
                          </TableCell>
                          <TableCell>{format(new Date(invoice.due_date), 'MMM d, yyyy')}</TableCell>
                          <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                          <TableCell className="text-right">
                            {invoice.status !== 'paid_external' && invoice.status !== 'cancelled' && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => markInvoicePaid(invoice.id)}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Mark Paid
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {showAccountModal && (
        <EnterpriseAccountModal
          onClose={() => setShowAccountModal(false)}
          onSuccess={() => {
            setShowAccountModal(false);
            fetchData();
          }}
        />
      )}

      {showInvoiceModal && (
        <EnterpriseInvoiceModal
          accounts={accounts}
          selectedAccountId={selectedAccount?.id}
          onClose={() => {
            setShowInvoiceModal(false);
            setSelectedAccount(null);
          }}
          onSuccess={() => {
            setShowInvoiceModal(false);
            setSelectedAccount(null);
            fetchData();
          }}
        />
      )}
    </DashboardLayout>
  );
}
