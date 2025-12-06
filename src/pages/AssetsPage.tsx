import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssetCard } from '@/components/assets/AssetCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Asset, AssetType, OwnerEntity, ASSET_TYPE_LABELS, OWNER_ENTITY_LABELS } from '@/types/database';

export default function AssetsPage() {
  const { isAdmin } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetType | 'all'>('all');
  const [ownerFilter, setOwnerFilter] = useState<OwnerEntity | 'all'>('all');

  useEffect(() => {
    fetchAssets();
  }, []);

  async function fetchAssets() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .order('created_at', { ascending: false });

    if (data && !error) {
      setAssets(data as Asset[]);
    }
    setIsLoading(false);
  }

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = assetTypeFilter === 'all' || asset.asset_type === assetTypeFilter;
    const matchesOwner = ownerFilter === 'all' || asset.owner_entity === ownerFilter;
    return matchesSearch && matchesType && matchesOwner;
  });

  return (
    <DashboardLayout 
      title="Assets" 
      subtitle="Manage vault assets and reserves"
    >
      <div className="space-y-6 animate-fade-in">
        {/* Filters Bar */}
        <div className="glass-card p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 input-dark"
              />
            </div>
            
            <div className="flex gap-3">
              <Select value={assetTypeFilter} onValueChange={(v) => setAssetTypeFilter(v as AssetType | 'all')}>
                <SelectTrigger className="w-[180px] input-dark">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Asset Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={ownerFilter} onValueChange={(v) => setOwnerFilter(v as OwnerEntity | 'all')}>
                <SelectTrigger className="w-[180px] input-dark">
                  <SelectValue placeholder="Owner Entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {Object.entries(OWNER_ENTITY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isAdmin && (
                <Button asChild>
                  <Link to="/assets/new">
                    <Plus className="h-4 w-4" />
                    Add Asset
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Assets Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No assets found.</p>
            {isAdmin && (
              <Button asChild className="mt-4">
                <Link to="/assets/new">
                  <Plus className="h-4 w-4" />
                  Add Your First Asset
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
