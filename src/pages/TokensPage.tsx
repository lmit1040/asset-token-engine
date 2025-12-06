import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coins, ExternalLink } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { TokenDefinition, Asset, TOKEN_MODEL_LABELS, ASSET_TYPE_LABELS } from '@/types/database';

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
