import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Search, FileText, ExternalLink, Shield, CheckCircle, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';

interface NDASignature {
  id: string;
  user_id: string;
  signer_name: string;
  signer_email: string;
  nda_version: string;
  signed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  signature_hash: string;
  blockchain_tx_signature: string | null;
  blockchain_recorded_at: string | null;
  created_at: string;
}

export default function AdminNDASignaturesPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: signatures, isLoading } = useQuery({
    queryKey: ['nda-signatures'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nda_signatures')
        .select('*')
        .order('signed_at', { ascending: false });
      
      if (error) throw error;
      return data as NDASignature[];
    },
    enabled: isAdmin,
  });

  if (authLoading) {
    return (
      <DashboardLayout title="NDA Signatures">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const filteredSignatures = signatures?.filter(sig => 
    sig.signer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sig.signer_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    sig.signature_hash.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const totalSignatures = signatures?.length || 0;
  const blockchainRecorded = signatures?.filter(s => s.blockchain_tx_signature)?.length || 0;
  const pendingBlockchain = totalSignatures - blockchainRecorded;

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success('Hash copied to clipboard');
  };

  return (
    <DashboardLayout title="NDA Signatures">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">NDA Signatures</h1>
          <p className="text-muted-foreground mt-1">
            View all signed Non-Disclosure Agreements with blockchain verification
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalSignatures}</p>
                  <p className="text-sm text-muted-foreground">Total Signatures</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{blockchainRecorded}</p>
                  <p className="text-sm text-muted-foreground">Blockchain Verified</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Clock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingBlockchain}</p>
                  <p className="text-sm text-muted-foreground">Pending Blockchain</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              All NDA Signatures
            </CardTitle>
            <CardDescription>
              Search by name, email, or signature hash
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search signatures..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : filteredSignatures.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? 'No signatures match your search' : 'No NDA signatures yet'}
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Signer</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Signed At</TableHead>
                      <TableHead>Signature Hash</TableHead>
                      <TableHead>Blockchain</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSignatures.map((sig) => (
                      <TableRow key={sig.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{sig.signer_name}</p>
                            <p className="text-sm text-muted-foreground">{sig.signer_email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">v{sig.nda_version}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(sig.signed_at), 'MMM d, yyyy')}
                            <p className="text-muted-foreground text-xs">
                              {format(new Date(sig.signed_at), 'h:mm a')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyHash(sig.signature_hash)}
                            className="font-mono text-xs max-w-[150px] truncate"
                            title={sig.signature_hash}
                          >
                            {sig.signature_hash.slice(0, 8)}...{sig.signature_hash.slice(-8)}
                          </Button>
                        </TableCell>
                        <TableCell>
                          {sig.blockchain_tx_signature ? (
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="gap-1"
                            >
                              <a
                                href={`https://solscan.io/tx/${sig.blockchain_tx_signature}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <Shield className="h-3 w-3 text-green-500" />
                                Verified
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="text-amber-500">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
