import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, RotateCcw, Coins, Box, ExternalLink } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ASSET_TYPE_LABELS, TOKEN_MODEL_LABELS } from '@/types/database';
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

interface ArchivedAsset {
  id: string;
  name: string;
  asset_type: string;
  quantity: number;
  unit: string;
  archived_at: string;
}

interface ArchivedToken {
  id: string;
  token_name: string;
  token_symbol: string;
  token_model: string;
  total_supply: number;
  archived_at: string;
  asset: { name: string } | null;
}

export default function AdminArchivedPage() {
  const { user } = useAuth();
  const [archivedAssets, setArchivedAssets] = useState<ArchivedAsset[]>([]);
  const [archivedTokens, setArchivedTokens] = useState<ArchivedToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    fetchArchivedItems();
  }, []);

  async function fetchArchivedItems() {
    setIsLoading(true);
    
    const [assetsRes, tokensRes] = await Promise.all([
      supabase
        .from('assets')
        .select('id, name, asset_type, quantity, unit, archived_at')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false }),
      supabase
        .from('token_definitions')
        .select('id, token_name, token_symbol, token_model, total_supply, archived_at, asset:assets(name)')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false }),
    ]);

    if (assetsRes.data) setArchivedAssets(assetsRes.data as ArchivedAsset[]);
    if (tokensRes.data) setArchivedTokens(tokensRes.data as unknown as ArchivedToken[]);
    setIsLoading(false);
  }

  const handleRestoreAsset = async (assetId: string) => {
    setRestoringId(assetId);
    try {
      const { error } = await supabase
        .from('assets')
        .update({ archived_at: null, archived_by: null })
        .eq('id', assetId);

      if (error) throw error;
      toast.success('Asset restored successfully');
      fetchArchivedItems();
    } catch (error: any) {
      toast.error(error.message || 'Failed to restore asset');
    } finally {
      setRestoringId(null);
    }
  };

  const handleRestoreToken = async (tokenId: string) => {
    setRestoringId(tokenId);
    try {
      const { error } = await supabase
        .from('token_definitions')
        .update({ archived_at: null, archived_by: null })
        .eq('id', tokenId);

      if (error) throw error;
      toast.success('Token restored successfully');
      fetchArchivedItems();
    } catch (error: any) {
      toast.error(error.message || 'Failed to restore token');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <DashboardLayout title="Archived Items" subtitle="Restore or permanently manage archived assets and tokens" requireAdmin>
      <div className="space-y-6 animate-fade-in">
        <Tabs defaultValue="assets" className="w-full">
          <TabsList className="glass-card p-1">
            <TabsTrigger value="assets" className="flex items-center gap-2">
              <Box className="h-4 w-4" />
              Assets ({archivedAssets.length})
            </TabsTrigger>
            <TabsTrigger value="tokens" className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Tokens ({archivedTokens.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assets" className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : archivedAssets.length === 0 ? (
              <div className="glass-card p-12 text-center">
                <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No archived assets.</p>
              </div>
            ) : (
              <div className="glass-card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="text-left py-3 px-4">Asset</th>
                      <th className="text-left py-3 px-4">Type</th>
                      <th className="text-left py-3 px-4">Quantity</th>
                      <th className="text-left py-3 px-4">Archived</th>
                      <th className="text-right py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedAssets.map((asset) => (
                      <tr key={asset.id} className="hover:bg-muted/30 transition-colors">
                        <td className="table-cell font-medium text-foreground">{asset.name}</td>
                        <td className="table-cell text-muted-foreground">
                          {ASSET_TYPE_LABELS[asset.asset_type as keyof typeof ASSET_TYPE_LABELS] || asset.asset_type}
                        </td>
                        <td className="table-cell font-mono">
                          {Number(asset.quantity).toLocaleString()} {asset.unit}
                        </td>
                        <td className="table-cell text-muted-foreground">
                          {format(new Date(asset.archived_at), 'MMM d, yyyy')}
                        </td>
                        <td className="table-cell text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={restoringId === asset.id}
                              >
                                {restoringId === asset.id ? (
                                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <RotateCcw className="h-4 w-4" />
                                    Restore
                                  </>
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Restore Asset</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will restore "{asset.name}" to the active assets list.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRestoreAsset(asset.id)}>
                                  Restore
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tokens" className="mt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : archivedTokens.length === 0 ? (
              <div className="glass-card p-12 text-center">
                <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No archived tokens.</p>
              </div>
            ) : (
              <div className="glass-card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="table-header">
                      <th className="text-left py-3 px-4">Token</th>
                      <th className="text-left py-3 px-4">Model</th>
                      <th className="text-left py-3 px-4">Total Supply</th>
                      <th className="text-left py-3 px-4">Backing Asset</th>
                      <th className="text-left py-3 px-4">Archived</th>
                      <th className="text-right py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedTokens.map((token) => (
                      <tr key={token.id} className="hover:bg-muted/30 transition-colors">
                        <td className="table-cell">
                          <p className="font-medium text-foreground">{token.token_name}</p>
                          <p className="text-sm font-mono text-primary">{token.token_symbol}</p>
                        </td>
                        <td className="table-cell">
                          <span className="badge-gold">
                            {TOKEN_MODEL_LABELS[token.token_model as keyof typeof TOKEN_MODEL_LABELS] || token.token_model}
                          </span>
                        </td>
                        <td className="table-cell font-mono">
                          {Number(token.total_supply).toLocaleString()}
                        </td>
                        <td className="table-cell text-muted-foreground">
                          {token.asset?.name || 'Unknown'}
                        </td>
                        <td className="table-cell text-muted-foreground">
                          {format(new Date(token.archived_at), 'MMM d, yyyy')}
                        </td>
                        <td className="table-cell text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={restoringId === token.id}
                              >
                                {restoringId === token.id ? (
                                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <RotateCcw className="h-4 w-4" />
                                    Restore
                                  </>
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Restore Token</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will restore "{token.token_name}" to the active tokens list.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRestoreToken(token.id)}>
                                  Restore
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
