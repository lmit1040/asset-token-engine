import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Coins, ExternalLink, Globe, CheckCircle, XCircle, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { TokenDefinition, Asset, TOKEN_MODEL_LABELS, ASSET_TYPE_LABELS, BLOCKCHAIN_CHAIN_LABELS, BlockchainChain, NETWORK_TYPE_LABELS, NetworkType, DEPLOYMENT_STATUS_LABELS, DeploymentStatus } from '@/types/database';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface TokenWithAsset extends TokenDefinition {
  asset: Asset;
}

type SortField = 'token_name' | 'token_symbol' | 'total_supply' | 'created_at';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 10;

export default function TokensPage() {
  const [tokens, setTokens] = useState<TokenWithAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [chainFilter, setChainFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    async function fetchTokens() {
      const { data } = await supabase
        .from('token_definitions')
        .select('*, asset:assets(*)')
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      
      if (data) setTokens(data as unknown as TokenWithAsset[]);
      setIsLoading(false);
    }
    fetchTokens();
  }, []);

  // Filter and sort tokens
  const filteredAndSortedTokens = useMemo(() => {
    let result = [...tokens];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(token => 
        token.token_name.toLowerCase().includes(query) ||
        token.token_symbol.toLowerCase().includes(query) ||
        token.asset?.name?.toLowerCase().includes(query)
      );
    }
    
    // Apply chain filter
    if (chainFilter !== 'all') {
      result = result.filter(token => token.chain === chainFilter);
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(token => token.deployment_status === statusFilter);
    }
    
    // Apply model filter
    if (modelFilter !== 'all') {
      result = result.filter(token => token.token_model === modelFilter);
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'token_name':
          comparison = a.token_name.localeCompare(b.token_name);
          break;
        case 'token_symbol':
          comparison = a.token_symbol.localeCompare(b.token_symbol);
          break;
        case 'total_supply':
          comparison = Number(a.total_supply) - Number(b.total_supply);
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return result;
  }, [tokens, searchQuery, chainFilter, statusFilter, modelFilter, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedTokens.length / PAGE_SIZE);
  const paginatedTokens = filteredAndSortedTokens.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, chainFilter, statusFilter, modelFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-primary" />
      : <ArrowDown className="h-4 w-4 text-primary" />;
  };

  return (
    <DashboardLayout title="Tokens" subtitle="All tokenized assets">
      <div className="animate-fade-in space-y-4">
        {/* Filters */}
        <div className="glass-card p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, symbol, or asset..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={chainFilter} onValueChange={setChainFilter}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Blockchain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Chains</SelectItem>
                {Object.entries(BLOCKCHAIN_CHAIN_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="DEPLOYED">Deployed</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="NOT_DEPLOYED">Not Deployed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                {Object.entries(TOKEN_MODEL_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredAndSortedTokens.length === 0 ? (
          <div className="text-center py-12 glass-card">
            <Coins className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {tokens.length === 0 ? 'No tokens defined yet.' : 'No tokens match your filters.'}
            </p>
          </div>
        ) : (
          <>
            <div className="glass-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="text-left py-3 px-4">
                      <Button variant="ghost" size="sm" onClick={() => handleSort('token_name')} className="gap-1 -ml-2">
                        Token <SortIcon field="token_name" />
                      </Button>
                    </th>
                    <th className="text-left py-3 px-4">Model</th>
                    <th className="text-left py-3 px-4">
                      <Button variant="ghost" size="sm" onClick={() => handleSort('total_supply')} className="gap-1 -ml-2">
                        Total Supply <SortIcon field="total_supply" />
                      </Button>
                    </th>
                    <th className="text-left py-3 px-4">Backing Asset</th>
                    <th className="text-left py-3 px-4">Blockchain</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTokens.map((token) => (
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1}-{Math.min(currentPage * PAGE_SIZE, filteredAndSortedTokens.length)} of {filteredAndSortedTokens.length} tokens
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setCurrentPage(pageNum)}
                            isActive={currentPage === pageNum}
                            className="cursor-pointer"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}