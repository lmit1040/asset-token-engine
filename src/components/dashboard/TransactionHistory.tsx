import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Plus, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { Json } from '@/integrations/supabase/types';

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
  limit?: number;
  showAllUsers?: boolean;
}

export function TransactionHistory({ userId, limit = 10, showAllUsers = false }: TransactionHistoryProps) {
  const { user, isAdmin } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const targetUserId = userId || user?.id;

  useEffect(() => {
    async function fetchTransactions() {
      if (!targetUserId && !showAllUsers) return;

      setIsLoading(true);
      try {
        let query = supabase
          .from('activity_logs')
          .select('*')
          .in('action_type', ['tokens_assigned', 'tokens_transferred'])
          .order('created_at', { ascending: false })
          .limit(limit);

        // If not showing all users, filter by user involvement
        // We can't directly filter by JSONB in a simple way, so we fetch and filter client-side
        const { data } = await query;

        if (data) {
          let filteredData = data as Transaction[];
          
          if (!showAllUsers && targetUserId) {
            // Filter transactions where user is involved
            filteredData = filteredData.filter((tx) => {
              const details = tx.details as TransactionDetails | null;
              if (!details) return false;
              
              // Check if user is the receiver of an assignment
              if (tx.action_type === 'tokens_assigned' && details.user_id === targetUserId) {
                return true;
              }
              
              // Check if user is sender or receiver of a transfer
              if (tx.action_type === 'tokens_transferred') {
                return details.from_user_id === targetUserId || details.to_user_id === targetUserId;
              }
              
              return false;
            });
          }

          setTransactions(filteredData.slice(0, limit));
        }
      } catch (error) {
        console.error('Error fetching transactions:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTransactions();
  }, [targetUserId, limit, showAllUsers]);

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

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8">
        <History className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">No transaction history yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx) => {
        const details = tx.details as TransactionDetails | null;
        const isOutgoing = tx.action_type === 'tokens_transferred' && details?.from_user_id === targetUserId;
        
        return (
          <div
            key={tx.id}
            className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
              isOutgoing ? 'bg-destructive/10' : 'bg-success/10'
            }`}>
              {getTransactionIcon(tx)}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {getTransactionDescription(tx)}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(tx.created_at), 'MMM d, yyyy • h:mm a')}
              </p>
            </div>
            
            <div className="text-right">
              <p className={`text-sm font-mono font-medium ${
                isOutgoing ? 'text-destructive' : 'text-success'
              }`}>
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
  );
}