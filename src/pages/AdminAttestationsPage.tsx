import { useEffect, useState, useCallback } from 'react';
import { Shield, CheckCircle, Clock, XCircle, Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { AttestationWithDetails, AttestationStatus } from '@/types/attestations';
import { CreateAttestationModal } from '@/components/attestations/CreateAttestationModal';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<AttestationStatus, { icon: any; label: string; className: string }> = {
  PENDING: { icon: Clock, label: 'Pending Review', className: 'bg-yellow-500/10 text-yellow-500' },
  ATTESTED: { icon: CheckCircle, label: 'Verified', className: 'bg-green-500/10 text-green-500' },
  REJECTED: { icon: XCircle, label: 'Rejected', className: 'bg-red-500/10 text-red-500' },
};

export default function AdminAttestationsPage() {
  const { user, isAdmin } = useAuth();
  const [attestations, setAttestations] = useState<AttestationWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchAttestations = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('attestations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        // Get asset names and attester info
        const assetIds = [...new Set(data.map(a => a.asset_id))];
        const attesterIds = [...new Set(data.filter(a => a.attested_by).map(a => a.attested_by))];

        const { data: assetsData } = await supabase
          .from('assets')
          .select('id, name')
          .in('id', assetIds);

        const { data: profilesData } = attesterIds.length > 0
          ? await supabase.from('profiles').select('id, email, name').in('id', attesterIds as string[])
          : { data: [] as { id: string; email: string; name: string | null }[] };

        const assetMap = new Map<string, string>();
        assetsData?.forEach(a => assetMap.set(a.id, a.name));

        const profileMap = new Map<string, { email: string; name: string | null }>();
        profilesData?.forEach(p => profileMap.set(p.id, { email: p.email, name: p.name }));

        setAttestations(data.map(a => ({
          ...a,
          asset_name: assetMap.get(a.asset_id),
          attested_by_name: a.attested_by ? profileMap.get(a.attested_by)?.name : null,
          attested_by_email: a.attested_by ? profileMap.get(a.attested_by)?.email : null,
        })));
      } else {
        setAttestations([]);
      }
    } catch (error: any) {
      console.error('Error fetching attestations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load attestations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttestations();
  }, [fetchAttestations]);

  const handleStatusChange = async (attestationId: string, newStatus: AttestationStatus) => {
    try {
      const { error } = await supabase
        .from('attestations')
        .update({
          status: newStatus,
          attested_by: user?.id,
          attestation_date: new Date().toISOString(),
        })
        .eq('id', attestationId);

      if (error) throw error;

      toast({ title: 'Success', description: `Attestation ${newStatus.toLowerCase()}` });
      fetchAttestations();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update attestation',
        variant: 'destructive',
      });
    }
  };

  if (!isAdmin) {
    return (
      <DashboardLayout title="Access Denied" subtitle="">
        <div className="text-center py-12 text-muted-foreground">
          You do not have permission to view this page.
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Reserve Attestations"
      subtitle="Verify and attest to proof-of-reserve documents"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {Object.entries(STATUS_CONFIG).map(([status, config]) => {
                const count = attestations.filter(a => a.status === status).length;
                return (
                  <Badge key={status} variant="outline" className={cn('gap-1', config.className)}>
                    <config.icon className="h-3 w-3" />
                    {count} {config.label}
                  </Badge>
                );
              })}
            </div>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" />
            New Attestation
          </Button>
        </div>

        {/* Attestations List */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : attestations.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No attestations yet</h3>
            <p className="text-muted-foreground mb-4">
              Create attestations to formally verify proof-of-reserve documents.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              Create First Attestation
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {attestations.map((attestation) => {
              const statusConfig = STATUS_CONFIG[attestation.status];
              const StatusIcon = statusConfig.icon;

              return (
                <div key={attestation.id} className="glass-card p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', statusConfig.className)}>
                          <StatusIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">
                            {attestation.asset_name || 'Unknown Asset'}
                          </h3>
                          <Badge variant="outline" className={statusConfig.className}>
                            {statusConfig.label}
                          </Badge>
                        </div>
                      </div>

                      {attestation.notes && (
                        <p className="text-sm text-muted-foreground mb-3">
                          {attestation.notes}
                        </p>
                      )}

                      {attestation.verification_hash && (
                        <div className="mb-3">
                          <p className="text-xs text-muted-foreground mb-1">Verification Hash:</p>
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {attestation.verification_hash}
                          </code>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Created: {format(new Date(attestation.created_at), 'MMM d, yyyy')}</span>
                        {attestation.attested_by && (
                          <span>
                            Verified by: {attestation.attested_by_name || attestation.attested_by_email}
                          </span>
                        )}
                      </div>
                    </div>

                    {attestation.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(attestation.id, 'REJECTED')}
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(attestation.id, 'ATTESTED')}
                        >
                          <CheckCircle className="h-4 w-4" />
                          Verify
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateAttestationModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchAttestations();
          }}
        />
      )}
    </DashboardLayout>
  );
}
