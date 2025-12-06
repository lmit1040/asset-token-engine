import { Link } from 'react-router-dom';
import { ExternalLink, Wallet } from 'lucide-react';
import { Asset, TokenDefinition, UserTokenHolding, ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from '@/types/database';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface HoldingWithDetails extends UserTokenHolding {
  token_definition: TokenDefinition & { asset: Asset };
}

interface HoldingsTableProps {
  holdings: HoldingWithDetails[];
  isLoading: boolean;
}

export function HoldingsTable({ holdings, isLoading }: HoldingsTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No token holdings yet.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Contact an administrator to receive tokens.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="table-header">
            <th className="text-left py-3 px-4">Token</th>
            <th className="text-left py-3 px-4">Balance</th>
            <th className="text-left py-3 px-4">Delivery Wallet</th>
            <th className="text-left py-3 px-4">Backing Asset</th>
            <th className="text-left py-3 px-4">Asset Type</th>
            <th className="text-right py-3 px-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => (
            <tr key={holding.id} className="hover:bg-muted/30 transition-colors">
              <td className="table-cell">
                <div>
                  <p className="font-medium text-foreground">
                    {holding.token_definition.token_name}
                  </p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {holding.token_definition.token_symbol}
                  </p>
                </div>
              </td>
              <td className="table-cell">
                <span className="font-mono text-lg font-semibold text-primary">
                  {Number(holding.balance).toLocaleString()}
                </span>
              </td>
              <td className="table-cell">
                {holding.delivery_wallet_address ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2">
                          <Wallet className="h-4 w-4 text-emerald-500" />
                          <span className="font-mono text-xs text-foreground">
                            {holding.delivery_wallet_address.slice(0, 6)}...{holding.delivery_wallet_address.slice(-4)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({holding.delivery_wallet_type})
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="font-mono text-xs">{holding.delivery_wallet_address}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <span className="text-muted-foreground text-sm">Not linked</span>
                )}
              </td>
              <td className="table-cell">
                <p className="text-foreground">
                  {holding.token_definition.asset?.name}
                </p>
              </td>
              <td className="table-cell">
                <span className={ASSET_TYPE_COLORS[holding.token_definition.asset?.asset_type]}>
                  {ASSET_TYPE_LABELS[holding.token_definition.asset?.asset_type]}
                </span>
              </td>
              <td className="table-cell text-right">
                <Link 
                  to={`/assets/${holding.token_definition.asset_id}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  View Asset
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
