import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Trash2, Upload, FileText, Shield, Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Asset, TokenDefinition, ProofOfReserveFile, ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, OWNER_ENTITY_LABELS, TOKEN_MODEL_LABELS } from '@/types/database';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ProofUploadModal } from '@/components/assets/ProofUploadModal';
import { TokenDefinitionModal } from '@/components/assets/TokenDefinitionModal';
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

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [proofFiles, setProofFiles] = useState<ProofOfReserveFile[]>([]);
  const [tokenDefinitions, setTokenDefinitions] = useState<TokenDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showProofModal, setShowProofModal] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const [assetRes, proofsRes, tokensRes] = await Promise.all([
        supabase.from('assets').select('*').eq('id', id).maybeSingle(),
        supabase.from('proof_of_reserve_files').select('*').eq('asset_id', id).order('uploaded_at', { ascending: false }),
        supabase.from('token_definitions').select('*').eq('asset_id', id).order('created_at', { ascending: false }),
      ]);

      if (assetRes.data) setAsset(assetRes.data as Asset);
      if (proofsRes.data) setProofFiles(proofsRes.data as ProofOfReserveFile[]);
      if (tokensRes.data) setTokenDefinitions(tokensRes.data as TokenDefinition[]);
    } catch (error) {
      console.error('Error fetching asset:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async () => {
    if (!id) return;
    
    try {
      const { error } = await supabase.from('assets').delete().eq('id', id);
      if (error) throw error;
      toast.success('Asset deleted successfully');
      navigate('/assets');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete asset');
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
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Asset</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this asset and all associated proof files and token definitions. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
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

        {/* Proof of Reserve Files */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Proof of Reserve Files</h2>
              <p className="text-sm text-muted-foreground">Uploaded documents with SHA-256 verification</p>
            </div>
            {isAdmin && (
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
                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-sm"
                        >
                          View File
                        </a>
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
            {isAdmin && (
              <Button onClick={() => setShowTokenModal(true)}>
                <Plus className="h-4 w-4" />
                Create Token
              </Button>
            )}
          </div>

          {tokenDefinitions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No token definitions created yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tokenDefinitions.map((token) => (
                <div key={token.id} className="bg-muted/30 rounded-lg p-4 border border-border">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{token.token_name}</h3>
                      <p className="text-sm font-mono text-primary">{token.token_symbol}</p>
                    </div>
                    <span className="badge-gold text-xs">{TOKEN_MODEL_LABELS[token.token_model]}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Supply</span>
                      <span className="font-mono text-foreground">{Number(token.total_supply).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Decimals</span>
                      <span className="font-mono text-foreground">{token.decimals}</span>
                    </div>
                  </div>
                  {token.notes && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                      {token.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
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
    </DashboardLayout>
  );
}
