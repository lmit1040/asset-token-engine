import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AssetCard } from '@/components/assets/AssetCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Asset, AssetType, OwnerEntity, ASSET_TYPE_LABELS, OWNER_ENTITY_LABELS } from '@/types/database';

export default function AssetsPage() {
  const { isAdmin, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'all' | 'my-assets'>('all');
  
  // All assets state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetType | 'all'>('all');
  const [ownerFilter, setOwnerFilter] = useState<OwnerEntity | 'all'>('all');

  // My assets state
  const [myAssets, setMyAssets] = useState<Asset[]>([]);
  const [isLoadingMyAssets, setIsLoadingMyAssets] = useState(true);
  const [mySearchQuery, setMySearchQuery] = useState('');
  const [myAssetTypeFilter, setMyAssetTypeFilter] = useState<AssetType | 'all'>('all');
  const [myOwnerFilter, setMyOwnerFilter] = useState<OwnerEntity | 'all'>('all');

  useEffect(() => {
    fetchAssets();
  }, []);

  useEffect(() => {
    if (user?.id) {
      fetchMyAssets();
    }
  }, [user?.id]);

  async function fetchAssets() {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (data && !error) {
      setAssets(data as Asset[]);
    }
    setIsLoading(false);
  }

  async function fetchMyAssets() {
    if (!user?.id) return;
    
    setIsLoadingMyAssets(true);
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('submitted_by', user.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (data && !error) {
      setMyAssets(data as Asset[]);
    }
    setIsLoadingMyAssets(false);
  }

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = assetTypeFilter === 'all' || asset.asset_type === assetTypeFilter;
    const matchesOwner = ownerFilter === 'all' || asset.owner_entity === ownerFilter;
    return matchesSearch && matchesType && matchesOwner;
  });

  const filteredMyAssets = myAssets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(mySearchQuery.toLowerCase()) ||
      asset.description?.toLowerCase().includes(mySearchQuery.toLowerCase());
    const matchesType = myAssetTypeFilter === 'all' || asset.asset_type === myAssetTypeFilter;
    const matchesOwner = myOwnerFilter === 'all' || asset.owner_entity === myOwnerFilter;
    return matchesSearch && matchesType && matchesOwner;
  });

  const renderFiltersBar = (
    search: string,
    setSearch: (v: string) => void,
    typeFilter: AssetType | 'all',
    setTypeFilter: (v: AssetType | 'all') => void,
    ownerFilterVal: OwnerEntity | 'all',
    setOwnerFilterVal: (v: OwnerEntity | 'all') => void,
    showAddButton: boolean
  ) => (
    <div className="glass-card p-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 input-dark"
          />
        </div>
        
        <div className="flex gap-3">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AssetType | 'all')}>
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

          <Select value={ownerFilterVal} onValueChange={(v) => setOwnerFilterVal(v as OwnerEntity | 'all')}>
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

          {showAddButton && isAdmin && (
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
  );

  const renderAssetsGrid = (assetsList: Asset[], loading: boolean, emptyMessage: string, showSubmitLink?: boolean) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    
    if (assetsList.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{emptyMessage}</p>
          {showSubmitLink && (
            <Button asChild className="mt-4">
              <Link to="/submit-asset">
                <Plus className="h-4 w-4 mr-2" />
                Submit New Asset
              </Link>
            </Button>
          )}
          {!showSubmitLink && isAdmin && (
            <Button asChild className="mt-4">
              <Link to="/assets/new">
                <Plus className="h-4 w-4" />
                Add Your First Asset
              </Link>
            </Button>
          )}
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assetsList.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout 
      title="Assets" 
      subtitle="Manage vault assets and reserves"
    >
      <div className="space-y-6 animate-fade-in">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'my-assets')}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="all" className="flex items-center gap-2">
              All Assets
              <Badge variant="secondary" className="ml-1">{assets.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="my-assets" className="flex items-center gap-2">
              My Assets
              <Badge variant="secondary" className="ml-1">{myAssets.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-6 mt-6">
            {renderFiltersBar(
              searchQuery,
              setSearchQuery,
              assetTypeFilter,
              setAssetTypeFilter,
              ownerFilter,
              setOwnerFilter,
              true
            )}
            {renderAssetsGrid(filteredAssets, isLoading, 'No assets found.')}
          </TabsContent>

          <TabsContent value="my-assets" className="space-y-6 mt-6">
            {renderFiltersBar(
              mySearchQuery,
              setMySearchQuery,
              myAssetTypeFilter,
              setMyAssetTypeFilter,
              myOwnerFilter,
              setMyOwnerFilter,
              false
            )}
            {renderAssetsGrid(
              filteredMyAssets, 
              isLoadingMyAssets, 
              "You haven't submitted any assets yet.",
              true
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}