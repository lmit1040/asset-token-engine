import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Activity, Filter, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { ActivityLog } from '@/types/database';

const ACTION_TYPES = [
  { value: 'all', label: 'All Actions' },
  { value: 'asset_created', label: 'Asset Created' },
  { value: 'asset_updated', label: 'Asset Updated' },
  { value: 'proof_uploaded', label: 'Proof Uploaded' },
  { value: 'token_created', label: 'Token Created' },
  { value: 'tokens_assigned', label: 'Tokens Assigned' },
];

const ENTITY_TYPES = [
  { value: 'all', label: 'All Entities' },
  { value: 'asset', label: 'Assets' },
  { value: 'token_definition', label: 'Token Definitions' },
  { value: 'proof_of_reserve', label: 'Proof of Reserve' },
  { value: 'user_token_holding', label: 'Token Holdings' },
];

const ACTION_ICONS: Record<string, string> = {
  asset_created: '📦',
  asset_updated: '✏️',
  proof_uploaded: '📄',
  token_created: '🪙',
  tokens_assigned: '🎯',
};

export default function AdminActivityPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');

  useEffect(() => {
    fetchLogs();
  }, []);

  async function fetchLogs() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (data && !error) {
      setLogs(data as ActivityLog[]);
    }
    setIsLoading(false);
  }

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = 
      log.entity_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;
    const matchesEntity = entityFilter === 'all' || log.entity_type === entityFilter;
    return matchesSearch && matchesAction && matchesEntity;
  });

  return (
    <DashboardLayout 
      title="Activity Log" 
      subtitle="Track all administrative actions"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Filters Bar */}
        <div className="glass-card p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search activities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 input-dark"
              />
            </div>
            
            <div className="flex gap-3">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[180px] input-dark">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Action Type" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[180px] input-dark">
                  <SelectValue placeholder="Entity Type" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Activity List */}
        <div className="glass-card">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No activity logs found.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Activities will appear here as actions are performed.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                      {ACTION_ICONS[log.action_type] || '📋'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground capitalize">
                          {log.action_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {log.entity_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {log.entity_name && (
                        <p className="text-sm text-muted-foreground">
                          {log.entity_name}
                        </p>
                      )}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 font-mono">
                          {JSON.stringify(log.details)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), 'MMM d, yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
