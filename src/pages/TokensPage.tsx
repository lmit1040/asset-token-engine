import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, ExternalLink, Globe, CheckCircle, XCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { TokenDefinition, Asset, TOKEN_MODEL_LABELS, ASSET_TYPE_LABELS, BLOCKCHAIN_CHAIN_LABELS, BlockchainChain, NETWORK_TYPE_LABELS, NetworkType, DEPLOYMENT_STATUS_LABELS, DeploymentStatus } from '@/types/database';

interface TokenWithAsset extends TokenDefinition {
  asset: Asset;
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenWithAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTokens() {
      const { data } = await supabase
        .from('token_definitions')
        .select('*, asset:assets(*)')
        .order('created_at', { ascending: false });
      
      if (data) setTokens(data as unknown as TokenWithAsset[]);
      setIsLoading(false);
    }
    fetchTokens();
  }, []);

  return (
    <DashboardLayout title="Tokens" subtitle="All tokenized assets">
      <div className="animate-fade-in">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center py-12 glass-card">
            <Coins className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No tokens defined yet.</p>
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
                  <th className="text-left py-3 px-4">Blockchain</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id} className="hover:bg-muted/30 transition-colors">
                    <td className="table-cell">
                      <p className="font-medium text-foreground">{token.token_name}</p>
                      <p className="text-sm font-mono text-primary">{token.token_symbol}</p>
                    </td>
                    <td className="table-cell">
                      <span className="badge-gold">{TOKEN_MODEL_LABELS[token.token_model]}</span>
                    </td>
                    <td className="table-cell font-mono">{Number(token.total_supply).toLocaleString()}</td>
                    <td className="table-cell">
                      <p className="text-foreground">{token.asset?.name}</p>
                      <p className="text-xs text-muted-foreground">{ASSET_TYPE_LABELS[token.asset?.asset_type]}</p>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {BLOCKCHAIN_CHAIN_LABELS[(token.chain as BlockchainChain) || 'NONE']}
                        </span>
                      </div>
                      {(token.network as NetworkType) !== 'NONE' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {NETWORK_TYPE_LABELS[(token.network as NetworkType)]}
                        </p>
                      )}
                      {token.contract_address && (
                        <p className="text-xs font-mono text-muted-foreground mt-1">
                          {token.contract_address.slice(0, 6)}...{token.contract_address.slice(-4)}
                        </p>
                      )}
                    </td>
                    <td className="table-cell">
                      {(token.deployment_status as DeploymentStatus) === 'DEPLOYED' ? (
                        <span className="inline-flex items-center gap-1 text-success text-sm">
                          <CheckCircle className="h-4 w-4" />
                          Deployed
                        </span>
                      ) : (token.deployment_status as DeploymentStatus) === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1 text-warning text-sm">
                          <div className="h-4 w-4 border-2 border-warning border-t-transparent rounded-full animate-spin" />
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground text-sm">
                          <XCircle className="h-4 w-4" />
                          Not Deployed
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      <Link to={`/assets/${token.asset_id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                        View Asset <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
