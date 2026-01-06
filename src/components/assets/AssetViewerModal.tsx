import { useState, useEffect, useCallback } from 'react';
import { X, Shield, FileText, MapPin, Calendar, Coins, ExternalLink, Eye, Download, File, Image as ImageIcon, FileVideo, FileAudio } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Asset, TokenDefinition, ProofOfReserveFile, ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, OWNER_ENTITY_LABELS } from '@/types/database';
import { format } from 'date-fns';
import { MediaViewerModal } from './MediaViewerModal';

interface AssetViewerModalProps {
  assetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateToFull?: () => void;
}

export function AssetViewerModal({ assetId, open, onOpenChange, onNavigateToFull }: AssetViewerModalProps) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [proofFiles, setProofFiles] = useState<ProofOfReserveFile[]>([]);
  const [tokenDefinitions, setTokenDefinitions] = useState<TokenDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<ProofOfReserveFile | null>(null);

  const fetchData = useCallback(async () => {
    if (!assetId) return;

    setIsLoading(true);
    try {
      const [assetRes, proofsRes, tokensRes] = await Promise.all([
        supabase.from('assets').select('*').eq('id', assetId).maybeSingle(),
        supabase.from('proof_of_reserve_files').select('*').eq('asset_id', assetId).order('uploaded_at', { ascending: false }),
        supabase.from('token_definitions').select('*').eq('asset_id', assetId).is('archived_at', null).order('created_at', { ascending: false }),
      ]);

      if (assetRes.data) setAsset(assetRes.data as Asset);
      if (proofsRes.data) setProofFiles(proofsRes.data as ProofOfReserveFile[]);
      if (tokensRes.data) setTokenDefinitions(tokensRes.data as TokenDefinition[]);
    } catch (error) {
      console.error('Error fetching asset:', error);
    } finally {
      setIsLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    if (open && assetId) {
      fetchData();
    }
  }, [open, assetId, fetchData]);

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <ImageIcon className="h-4 w-4" />;
    if (fileType.startsWith('video/')) return <FileVideo className="h-4 w-4" />;
    if (fileType.startsWith('audio/')) return <FileAudio className="h-4 w-4" />;
    if (fileType === 'application/pdf') return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const canPreviewInline = (fileType: string) => {
    return fileType.startsWith('image/') || 
           fileType.startsWith('video/') || 
           fileType.startsWith('audio/') ||
           fileType === 'application/pdf';
  };

  if (!open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {asset && (
                  <span className={`text-xs px-2 py-1 rounded-full ${ASSET_TYPE_COLORS[asset.asset_type]}`}>
                    {ASSET_TYPE_LABELS[asset.asset_type]}
                  </span>
                )}
                <DialogTitle className="text-lg font-semibold">
                  {isLoading ? 'Loading...' : asset?.name || 'Asset Details'}
                </DialogTitle>
              </div>
              {onNavigateToFull && (
                <Button variant="ghost" size="sm" onClick={onNavigateToFull} className="mr-8">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Full Page
                </Button>
              )}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[calc(90vh-80px)]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !asset ? (
              <div className="text-center py-12 text-muted-foreground">
                Asset not found.
              </div>
            ) : (
              <Tabs defaultValue="details" className="w-full">
                <div className="px-6 pt-4 border-b border-border bg-background sticky top-0 z-10">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="proofs" className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5" />
                      Proofs ({proofFiles.length})
                    </TabsTrigger>
                    <TabsTrigger value="tokens" className="flex items-center gap-2">
                      <Coins className="h-3.5 w-3.5" />
                      Tokens ({tokenDefinitions.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="details" className="p-6 mt-0">
                  <div className="space-y-6">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold gold-text">
                          {Number(asset.quantity).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">{asset.unit}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{proofFiles.length}</p>
                        <p className="text-xs text-muted-foreground">Proof Files</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">{tokenDefinitions.length}</p>
                        <p className="text-xs text-muted-foreground">Tokens</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <Badge variant="outline" className="text-xs">
                          {OWNER_ENTITY_LABELS[asset.owner_entity]}
                        </Badge>
                      </div>
                    </div>

                    {/* Asset Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Location:</span>
                        <span className="text-foreground">{asset.storage_location || 'Not specified'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Acquired:</span>
                        <span className="text-foreground">
                          {asset.acquisition_date 
                            ? format(new Date(asset.acquisition_date), 'MMM d, yyyy') 
                            : 'Not specified'}
                        </span>
                      </div>
                    </div>

                    {asset.description && (
                      <div className="border-t border-border pt-4">
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                        <p className="text-foreground text-sm">{asset.description}</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="proofs" className="p-6 mt-0">
                  {proofFiles.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No proof files uploaded yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {proofFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors group cursor-pointer"
                          onClick={() => canPreviewInline(file.file_type) && setSelectedFile(file)}
                        >
                          {/* Thumbnail Preview */}
                          <div className="h-12 w-12 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {file.file_type.startsWith('image/') ? (
                              <img 
                                src={file.file_url} 
                                alt={file.file_name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary">
                                {getFileIcon(file.file_type)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {file.title || file.file_name}
                            </p>
                            {file.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {file.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(file.uploaded_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {canPreviewInline(file.file_type) ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedFile(file);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                asChild
                              >
                                <a href={file.file_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              asChild
                            >
                              <a href={file.file_url} download={file.file_name} onClick={(e) => e.stopPropagation()}>
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="tokens" className="p-6 mt-0">
                  {tokenDefinitions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No token definitions created yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {tokenDefinitions.map((token) => (
                        <div
                          key={token.id}
                          className="p-4 rounded-lg border border-border bg-muted/20"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {token.token_image_url && (
                                <img 
                                  src={token.token_image_url} 
                                  alt={token.token_symbol}
                                  className="h-8 w-8 rounded-full object-cover"
                                />
                              )}
                              <div>
                                <h4 className="font-semibold text-foreground">{token.token_name}</h4>
                                <p className="text-xs text-muted-foreground">{token.token_symbol}</p>
                              </div>
                            </div>
                            <Badge 
                              variant={token.deployment_status === 'DEPLOYED' ? 'default' : 'outline'}
                              className="text-xs"
                            >
                              {token.deployment_status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Supply: </span>
                              <span className="text-foreground">{Number(token.total_supply).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Chain: </span>
                              <span className="text-foreground">{token.chain}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Media Viewer for proof files */}
      {selectedFile && (
        <MediaViewerModal
          file={selectedFile}
          files={proofFiles}
          open={!!selectedFile}
          onOpenChange={(open) => !open && setSelectedFile(null)}
          onFileChange={setSelectedFile}
        />
      )}
    </>
  );
}
