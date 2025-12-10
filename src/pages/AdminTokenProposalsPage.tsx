import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, FileText, CheckCircle, XCircle, Clock, ExternalLink, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface ProposalWithRelations {
  id: string;
  asset_id: string;
  proposed_by: string;
  token_name: string;
  token_symbol: string;
  token_model: string;
  decimals: number;
  total_supply: number;
  notes: string | null;
  status: ProposalStatus;
  admin_notes: string | null;
  created_at: string;
  asset?: { id: string; name: string } | null;
  proposer?: { id: string; email: string; name: string | null } | null;
}

export default function AdminTokenProposalsPage() {
  const { isAdmin, isAssetManager } = useAuth();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'ALL'>('ALL');
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const { data: proposals, isLoading, refetch } = useQuery({
    queryKey: ['token-definition-proposals', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('token_definition_proposals')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'ALL') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const assetIds = [...new Set(data.map(p => p.asset_id))];
        const userIds = [...new Set(data.map(p => p.proposed_by))];

        const [assetsRes, profilesRes] = await Promise.all([
          supabase.from('assets').select('id, name').in('id', assetIds),
          supabase.from('profiles').select('id, email, name').in('id', userIds)
        ]);

        const assetsMap = new Map(assetsRes.data?.map(a => [a.id, a]) || []);
        const profilesMap = new Map(profilesRes.data?.map(p => [p.id, p]) || []);

        return data.map(proposal => ({
          ...proposal,
          asset: assetsMap.get(proposal.asset_id),
          proposer: profilesMap.get(proposal.proposed_by)
        })) as ProposalWithRelations[];
      }

      return (data || []) as ProposalWithRelations[];
    },
    enabled: isAdmin || isAssetManager
  });

  const pendingCount = proposals?.filter(p => p.status === 'PENDING').length || 0;
  const approvedCount = proposals?.filter(p => p.status === 'APPROVED').length || 0;
  const rejectedCount = proposals?.filter(p => p.status === 'REJECTED').length || 0;

  const handleApprove = async (proposal: ProposalWithRelations) => {
    setSubmittingId(proposal.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create the actual token definition
      const { error: tokenError } = await supabase
        .from('token_definitions')
        .insert({
          asset_id: proposal.asset_id,
          token_name: proposal.token_name,
          token_symbol: proposal.token_symbol,
          token_model: proposal.token_model as 'ONE_TO_ONE' | 'FRACTIONAL' | 'VAULT_BASKET',
          decimals: proposal.decimals,
          total_supply: proposal.total_supply,
          notes: proposal.notes,
        });

      if (tokenError) {
        // Handle duplicate key constraint error (code 23505 or message contains constraint info)
        const errorMessage = tokenError.message?.toLowerCase() || '';
        const isDuplicateError = 
          tokenError.code === '23505' || 
          errorMessage.includes('duplicate') || 
          errorMessage.includes('unique') ||
          errorMessage.includes('token_symbol');
        
        if (isDuplicateError) {
          throw new Error(`Token symbol "${proposal.token_symbol}" already exists. Please reject this proposal and ask the user to choose a different symbol.`);
        }
        throw tokenError;
      }

      // Update proposal status
      const { error: updateError } = await supabase
        .from('token_definition_proposals')
        .update({
          status: 'APPROVED',
          admin_notes: adminNotes[proposal.id] || null,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', proposal.id);

      if (updateError) throw updateError;

      toast.success('Token definition approved and created');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve proposal');
    } finally {
      setSubmittingId(null);
    }
  };

  const handleReject = async (proposal: ProposalWithRelations) => {
    setSubmittingId(proposal.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('token_definition_proposals')
        .update({
          status: 'REJECTED',
          admin_notes: adminNotes[proposal.id] || null,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', proposal.id);

      if (error) throw error;

      toast.success('Token proposal rejected');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject proposal');
    } finally {
      setSubmittingId(null);
    }
  };

  if (!isAdmin && !isAssetManager) {
    return (
      <DashboardLayout title="Token Proposals">
        <div className="p-6">
          <p className="text-destructive">Access denied. Admin or Asset Manager role required.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Token Proposals">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Token Definition Proposals</h1>
          <p className="text-muted-foreground">
            Review and manage token definition proposals from asset submitters
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Pending Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{pendingCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                Approved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{approvedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                Rejected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{rejectedCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProposalStatus | 'ALL')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Proposals</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Proposals List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : proposals && proposals.length > 0 ? (
          <div className="space-y-4">
            {proposals.map((proposal) => (
              <Card key={proposal.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {proposal.token_name} ({proposal.token_symbol})
                        <Badge variant={
                          proposal.status === 'PENDING' ? 'outline' :
                          proposal.status === 'APPROVED' ? 'default' : 'destructive'
                        }>
                          {proposal.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        For asset: <Button 
                          variant="link" 
                          className="p-0 h-auto text-primary"
                          onClick={() => navigate(`/assets/${proposal.asset_id}`)}
                        >
                          {proposal.asset?.name || proposal.asset_id}
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                      </CardDescription>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>Proposed by: {proposal.proposer?.name || proposal.proposer?.email || 'Unknown'}</p>
                      <p>{format(new Date(proposal.created_at), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Token Model</p>
                      <p className="font-medium">{proposal.token_model.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Decimals</p>
                      <p className="font-medium">{proposal.decimals}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Supply</p>
                      <p className="font-medium">{proposal.total_supply.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Notes</p>
                      <p className="font-medium">{proposal.notes || 'None'}</p>
                    </div>
                  </div>

                  {proposal.admin_notes && proposal.status !== 'PENDING' && (
                    <div className="mb-4 p-3 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">Admin Notes</p>
                      <p className="text-sm">{proposal.admin_notes}</p>
                    </div>
                  )}

                  {/* Inline Admin Actions for Pending Proposals */}
                  {proposal.status === 'PENDING' && isAdmin && (
                    <div className="space-y-3 pt-4 border-t">
                      <Textarea
                        placeholder="Add admin notes (optional)..."
                        value={adminNotes[proposal.id] || ''}
                        onChange={(e) => setAdminNotes(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                        className="min-h-[60px] text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(proposal)}
                          disabled={submittingId === proposal.id}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {submittingId === proposal.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Approve & Create Token
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(proposal)}
                          disabled={submittingId === proposal.id}
                        >
                          {submittingId === proposal.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <X className="h-4 w-4 mr-1" />
                          )}
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/assets/${proposal.asset_id}`)}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          View Asset
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {statusFilter === 'ALL' 
                  ? 'No token definition proposals yet' 
                  : `No ${statusFilter.toLowerCase()} proposals`}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
