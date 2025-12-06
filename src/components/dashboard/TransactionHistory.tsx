import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Plus, History, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TransactionDetails {
  amount?: number;
  token_symbol?: string;
  token_id?: string;
  from_user_id?: string;
  from_user_email?: string;
  to_user_id?: string;
  to_user_email?: string;
  user_id?: string;
  user_email?: string;
}

interface Transaction {
  id: string;
  action_type: string;
  entity_type: string;
  entity_name: string | null;
  performed_by: string | null;
  details: Json;
  created_at: string;
}

interface TransactionHistoryProps {
  userId?: string;
  pageSize?: number;
  showAllUsers?: boolean;
  showFilters?: boolean;
  compact?: boolean;
}

type FilterType = 'all' | 'assignments' | 'transfers' | 'received' | 'sent';

export function TransactionHistory({ 
  userId, 
  pageSize = 10, 
  showAllUsers = false,
  showFilters = true,
  compact = false 
}: TransactionHistoryProps) {
  const { user } = useAuth();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [tokenFilter, setTokenFilter] = useState<string>('all');
  const [availableTokens, setAvailableTokens] = useState<string[]>([]);

  const targetUserId = userId || user?.id;

  useEffect(() => {
    async function fetchTransactions() {
      if (!targetUserId && !showAllUsers) return;

      setIsLoading(true);
      try {
        const query = supabase
          .from('activity_logs')
          .select('*')
          .in('action_type', ['tokens_assigned', 'tokens_transferred'])
          .order('created_at', { ascending: false })
          .limit(500); // Fetch more for client-side filtering

        const { data } = await query;

        if (data) {
          let processedData = data as Transaction[];
          
          if (!showAllUsers && targetUserId) {
            // Filter transactions where user is involved
            processedData = processedData.filter((tx) => {
              const details = tx.details as TransactionDetails | null;
              if (!details) return false;
              
              if (tx.action_type === 'tokens_assigned' && details.user_id === targetUserId) {
                return true;
              }
              
              if (tx.action_type === 'tokens_transferred') {
                return details.from_user_id === targetUserId || details.to_user_id === targetUserId;
              }
              
              return false;
            });
          }

          // Extract unique tokens for filter
          const tokens = new Set<string>();
          processedData.forEach((tx) => {
            const details = tx.details as TransactionDetails | null;
            if (details?.token_symbol) {
              tokens.add(details.token_symbol);
            }
          });
          setAvailableTokens(Array.from(tokens).sort());

          setAllTransactions(processedData);
        }
      } catch (error) {
        console.error('Error fetching transactions:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTransactions();
  }, [targetUserId, showAllUsers]);

  // Apply filters
  useEffect(() => {
    let filtered = [...allTransactions];

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter((tx) => {
        const details = tx.details as TransactionDetails | null;
        
        switch (filterType) {
          case 'assignments':
            return tx.action_type === 'tokens_assigned';
          case 'transfers':
            return tx.action_type === 'tokens_transferred';
          case 'received':
            if (tx.action_type === 'tokens_assigned') return true;
            if (tx.action_type === 'tokens_transferred' && details?.to_user_id === targetUserId) return true;
            return false;
          case 'sent':
            return tx.action_type === 'tokens_transferred' && details?.from_user_id === targetUserId;
          default:
            return true;
        }
      });
    }

    // Filter by token
    if (tokenFilter !== 'all') {
      filtered = filtered.filter((tx) => {
        const details = tx.details as TransactionDetails | null;
        return details?.token_symbol === tokenFilter;
      });
    }

    setFilteredTransactions(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  }, [allTransactions, filterType, tokenFilter, targetUserId]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedTransactions = filteredTransactions.slice(startIndex, startIndex + pageSize);

  const getTransactionIcon = (tx: Transaction) => {
    const details = tx.details as TransactionDetails | null;
    
    if (tx.action_type === 'tokens_assigned') {
      return <Plus className="h-4 w-4 text-success" />;
    }
    
    if (tx.action_type === 'tokens_transferred' && details) {
      if (details.from_user_id === targetUserId) {
        return <ArrowUpRight className="h-4 w-4 text-destructive" />;
      }
      return <ArrowDownRight className="h-4 w-4 text-success" />;
    }
    
    return <History className="h-4 w-4 text-muted-foreground" />;
  };

  const getTransactionDescription = (tx: Transaction) => {
    const details = tx.details as TransactionDetails | null;
    
    if (!details) return 'Unknown transaction';
    
    if (tx.action_type === 'tokens_assigned') {
      return `Received ${details.amount?.toLocaleString() || 0} ${details.token_symbol || 'tokens'}`;
    }
    
    if (tx.action_type === 'tokens_transferred') {
      if (showAllUsers) {
        return `${details.amount?.toLocaleString() || 0} ${details.token_symbol || 'tokens'} from ${details.from_user_email} to ${details.to_user_email}`;
      }
      
      if (details.from_user_id === targetUserId) {
        return `Sent ${details.amount?.toLocaleString() || 0} ${details.token_symbol || 'tokens'} to ${details.to_user_email}`;
      }
      return `Received ${details.amount?.toLocaleString() || 0} ${details.token_symbol || 'tokens'} from ${details.from_user_email}`;
    }
    
    return tx.entity_name || 'Transaction';
  };

  const getTransactionType = (tx: Transaction) => {
    const details = tx.details as TransactionDetails | null;
    
    if (tx.action_type === 'tokens_assigned') {
      return 'Assignment';
    }
    
    if (tx.action_type === 'tokens_transferred') {
      if (showAllUsers) {
        return 'Transfer';
      }
      if (details?.from_user_id === targetUserId) {
        return 'Sent';
      }
      return 'Received';
    }
    
    return 'Transaction';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (allTransactions.length === 0) {
    return (
      <div className="text-center py-8">
        <History className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">No transaction history yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filter:</span>
          </div>
          
          <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
            <SelectTrigger className="w-[140px] h-9 input-dark">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="assignments">Assignments</SelectItem>
              <SelectItem value="transfers">Transfers</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
            </SelectContent>
          </Select>

          {availableTokens.length > 0 && (
            <Select value={tokenFilter} onValueChange={setTokenFilter}>
              <SelectTrigger className="w-[130px] h-9 input-dark">
                <SelectValue placeholder="Token" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tokens</SelectItem>
                {availableTokens.map((token) => (
                  <SelectItem key={token} value={token}>
                    {token}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Transactions List */}
      {paginatedTransactions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground text-sm">No transactions match the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedTransactions.map((tx) => {
            const details = tx.details as TransactionDetails | null;
            const isOutgoing = tx.action_type === 'tokens_transferred' && details?.from_user_id === targetUserId;
            
            return (
              <div
                key={tx.id}
                className={`flex items-center gap-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors ${
                  compact ? 'p-2' : 'p-3'
                }`}
              >
                <div className={`rounded-full flex items-center justify-center ${
                  isOutgoing ? 'bg-destructive/10' : 'bg-success/10'
                } ${compact ? 'h-8 w-8' : 'h-10 w-10'}`}>
                  {getTransactionIcon(tx)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-foreground truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                    {getTransactionDescription(tx)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(tx.created_at), compact ? 'MMM d, yyyy' : 'MMM d, yyyy • h:mm a')}
                  </p>
                </div>
                
                <div className="text-right">
                  <p className={`font-mono font-medium ${
                    isOutgoing ? 'text-destructive' : 'text-success'
                  } ${compact ? 'text-xs' : 'text-sm'}`}>
                    {isOutgoing ? '-' : '+'}{details?.amount?.toLocaleString() || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getTransactionType(tx)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            
            {/* Page numbers */}
            <div className="hidden sm:flex items-center gap-1">
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
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'ghost'}
                    size="sm"
                    className="w-9 h-9"
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}