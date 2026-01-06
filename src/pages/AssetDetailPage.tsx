import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Archive, Upload, FileText, Shield, Plus, Coins, AlertCircle, Eye, Trash2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Asset, TokenDefinition, ProofOfReserveFile, ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, OWNER_ENTITY_LABELS, TokenModel } from '@/types/database';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ProofUploadModal } from '@/components/assets/ProofUploadModal';
import { TokenDefinitionModal } from '@/components/assets/TokenDefinitionModal';
import { ProposeTokenDefinitionModal } from '@/components/assets/ProposeTokenDefinitionModal';
import { TokenDetailCard } from '@/components/assets/TokenDetailCard';
import { TokenProposalCard } from '@/components/assets/TokenProposalCard';
import { MediaViewerModal } from '@/components/assets/MediaViewerModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TokenProposal {
  id: string;
  asset_id: string;
  proposed_by: string;
  token_name: string;
  token_symbol: string;
  token_model: TokenModel;
  decimals: number;
  total_supply: number;
  notes: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_notes: string | null;
  created_at: string;
}

// Extended asset type that includes submitted_by
interface AssetWithSubmitter extends Asset {
  submitted_by?: string | null;
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [asset, setAsset] = useState<AssetWithSubmitter | null>(null);
  const [proofFiles, setProofFiles] = useState<ProofOfReserveFile[]>([]);
  const [tokenDefinitions, setTokenDefinitions] = useState<TokenDefinition[]>([]);
  const [tokenProposals, setTokenProposals] = useState<TokenProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showProofModal, setShowProofModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showProposeTokenModal, setShowProposeTokenModal] = useState(false);
  const [selectedProofFile, setSelectedProofFile] = useState<ProofOfReserveFile | null>(null);

  // Check if current user is the original submitter
  const isOriginalSubmitter = user && asset?.submitted_by === user.id;
  const canUploadProofs = isAdmin || isOriginalSubmitter;
  const canProposeTokens = isOriginalSubmitter && !isAdmin;

  const fetchData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const [assetRes, proofsRes, tokensRes, proposalsRes] = await Promise.all([
        supabase.from('assets').select('*').eq('id', id).maybeSingle(),
        supabase.from('proof_of_reserve_files').select('*').eq('asset_id', id).order('uploaded_at', { ascending: false }),
        supabase.from('token_definitions').select('*').eq('asset_id', id).is('archived_at', null).order('created_at', { ascending: false }),
        supabase.from('token_definition_proposals').select('*').eq('asset_id', id).order('created_at', { ascending: false }),
      ]);

      if (assetRes.data) setAsset(assetRes.data as AssetWithSubmitter);
      if (proofsRes.data) setProofFiles(proofsRes.data as ProofOfReserveFile[]);
      if (tokensRes.data) setTokenDefinitions(tokensRes.data as TokenDefinition[]);
      if (proposalsRes.data) setTokenProposals(proposalsRes.data as TokenProposal[]);
    } catch (error) {
      console.error('Error fetching asset:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleArchive = async () => {
    if (!id || !user) return;
    
    try {
      const { error } = await supabase
        .from('assets')
        .update({
          archived_at: new Date().toISOString(),
          archived_by: user.id,
        })
        .eq('id', id);
      if (error) throw error;
      toast.success('Asset archived successfully');
      navigate('/assets');
    } catch (error: any) {
      toast.error(error.message || 'Failed to archive asset');
    }
  };

  const handleDeleteProof = async (file: ProofOfReserveFile) => {
    try {
      // Extract file path from URL and delete from storage
      const urlParts = file.file_url.split('/proof-of-reserve/');
      if (urlParts.length > 1) {
        const filePath = decodeURIComponent(urlParts[1]);
        await supabase.storage.from('proof-of-reserve').remove([filePath]);
      }

      // Delete from database
      const { error } = await supabase
        .from('proof_of_reserve_files')
        .delete()
        .eq('id', file.id);

      if (error) throw error;
      toast.success('Proof file deleted successfully');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete proof file');
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Loading..." subtitle="">
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!asset) {
    return (
      <DashboardLayout title="Asset Not Found" subtitle="">
        <div className="text-center py-12">
          <p className="text-muted-foreground">The requested asset could not be found.</p>
          <Button onClick={() => navigate('/assets')} className="mt-4">
            Back to Assets
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title={asset.name} 
      subtitle={ASSET_TYPE_LABELS[asset.asset_type]}
    >
      <div className="space-y-6 animate-fade-in">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/assets')}>
            <ArrowLeft className="h-4 w-4" />
            Back to Assets
          </Button>
          
          {isAdmin && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate(`/assets/${id}/edit`)}>
                <Edit className="h-4 w-4" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-amber-500 border-amber-500/50 hover:bg-amber-500/10">
                    <Archive className="h-4 w-4" />
                    Archive
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive Asset</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will archive this asset and hide it from the main view. Archived assets can be restored by an admin. Associated token definitions will also be hidden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleArchive} className="bg-amber-500 hover:bg-amber-600">Archive</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        {/* Asset Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Asset Details</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Quantity</p>
                <p className="text-2xl font-bold gold-text">
                  {Number(asset.quantity).toLocaleString()} <span className="text-sm text-muted-foreground">{asset.unit}</span>
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Asset Type</p>
                <span className={`inline-block mt-1 ${ASSET_TYPE_COLORS[asset.asset_type]}`}>
                  {ASSET_TYPE_LABELS[asset.asset_type]}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Owner Entity</p>
                <p className="text-foreground">{OWNER_ENTITY_LABELS[asset.owner_entity]}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Storage Location</p>
                <p className="text-foreground">{asset.storage_location || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Acquisition Date</p>
                <p className="text-foreground">
                  {asset.acquisition_date ? format(new Date(asset.acquisition_date), 'MMMM d, yyyy') : 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="text-foreground">{format(new Date(asset.created_at), 'MMM d, yyyy')}</p>
              </div>
            </div>
            {asset.description && (
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm text-muted-foreground mb-2">Description</p>
                <p className="text-foreground">{asset.description}</p>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="space-y-4">
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Proof Files</p>
                  <p className="text-2xl font-bold text-foreground">{proofFiles.length}</p>
                </div>
              </div>
            </div>
            <div className="glass-card p-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Token Definitions</p>
                  <p className="text-2xl font-bold text-foreground">{tokenDefinitions.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Submitter info banner */}
        {isOriginalSubmitter && !isAdmin && (
          <Alert className="border-primary/30 bg-primary/5">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You submitted this asset. You can upload additional proof files and propose token definitions for admin review.
            </AlertDescription>
          </Alert>
        )}

        {/* Proof of Reserve Files */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Proof of Reserve Files</h2>
              <p className="text-sm text-muted-foreground">Uploaded documents with SHA-256 verification</p>
            </div>
            {canUploadProofs && (
              <Button onClick={() => setShowProofModal(true)}>
                <Upload className="h-4 w-4" />
                Upload Proof
              </Button>
            )}
          </div>

          {proofFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No proof files uploaded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="text-left py-3 px-4">File Name</th>
                    <th className="text-left py-3 px-4">Type</th>
                    <th className="text-left py-3 px-4">Uploaded</th>
                    <th className="text-left py-3 px-4">SHA-256 Hash</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {proofFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-muted/30 transition-colors">
                      <td className="table-cell font-medium">{file.file_name}</td>
                      <td className="table-cell text-muted-foreground">{file.file_type}</td>
                      <td className="table-cell text-muted-foreground">
                        {format(new Date(file.uploaded_at), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="table-cell">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all">
                          {file.file_hash.slice(0, 16)}...{file.file_hash.slice(-8)}
                        </code>
                      </td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedProofFile(file)}
                            className="text-primary hover:text-primary/80"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          {canUploadProofs && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Proof File</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{file.title || file.file_name}"? 
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleDeleteProof(file)}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Token Definitions */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Token Definitions</h2>
              <p className="text-sm text-muted-foreground">Tokenization models for this asset</p>
            </div>
            <div className="flex gap-2">
              {canProposeTokens && (
                <Button variant="outline" onClick={() => setShowProposeTokenModal(true)}>
                  <Coins className="h-4 w-4" />
                  Propose Token
                </Button>
              )}
              {isAdmin && (
                <Button onClick={() => setShowTokenModal(true)}>
                  <Plus className="h-4 w-4" />
                  Create Token
                </Button>
              )}
            </div>
          </div>

          {tokenDefinitions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No token definitions created yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tokenDefinitions.map((token) => (
                <TokenDetailCard
                  key={token.id}
                  token={token}
                  isAdmin={isAdmin}
                  onUpdate={fetchData}
                />
              ))}
            </div>
          )}
        </div>

        {/* Token Proposals Section */}
        {(tokenProposals.length > 0 || canProposeTokens) && (
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Token Proposals</h2>
                <p className="text-sm text-muted-foreground">
                  {isAdmin ? 'Review and approve token definition proposals' : 'Your proposed token definitions awaiting admin approval'}
                </p>
              </div>
            </div>

            {tokenProposals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No token proposals yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tokenProposals.map((proposal) => (
                  <TokenProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    isAdmin={isAdmin}
                    isOwner={user?.id === proposal.proposed_by}
                    onUpdate={fetchData}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showProofModal && (
        <ProofUploadModal
          assetId={asset.id}
          onClose={() => setShowProofModal(false)}
          onSuccess={() => {
            setShowProofModal(false);
            fetchData();
          }}
        />
      )}

      {showTokenModal && (
        <TokenDefinitionModal
          asset={asset}
          onClose={() => setShowTokenModal(false)}
          onSuccess={() => {
            setShowTokenModal(false);
            fetchData();
          }}
        />
      )}

      {showProposeTokenModal && (
        <ProposeTokenDefinitionModal
          asset={asset}
          onClose={() => setShowProposeTokenModal(false)}
          onSuccess={() => {
            setShowProposeTokenModal(false);
            fetchData();
          }}
        />
      )}

      {selectedProofFile && (
        <MediaViewerModal
          file={selectedProofFile}
          files={proofFiles}
          open={!!selectedProofFile}
          onOpenChange={(open) => !open && setSelectedProofFile(null)}
          onFileChange={(file) => setSelectedProofFile(file)}
          canDelete={canUploadProofs}
          onDelete={async (file) => {
            await handleDeleteProof(file);
            // Navigate to next file or close modal
            const currentIdx = proofFiles.findIndex(f => f.id === file.id);
            if (proofFiles.length <= 1) {
              setSelectedProofFile(null);
            } else if (currentIdx < proofFiles.length - 1) {
              setSelectedProofFile(proofFiles[currentIdx + 1]);
            } else {
              setSelectedProofFile(proofFiles[currentIdx - 1]);
            }
          }}
        />
      )}
    </DashboardLayout>
  );
}
