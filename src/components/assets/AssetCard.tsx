import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Eye } from 'lucide-react';
import { Asset, ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, OWNER_ENTITY_LABELS } from '@/types/database';
import { format } from 'date-fns';
import { AssetViewerModal } from './AssetViewerModal';

interface AssetCardProps {
  asset: Asset;
}

export function AssetCard({ asset }: AssetCardProps) {
  const navigate = useNavigate();
  const [showViewer, setShowViewer] = useState(false);

  return (
    <>
      <div 
        className="glass-card-hover block p-6 group cursor-pointer"
        onClick={() => setShowViewer(true)}
      >
        <div className="flex items-start justify-between mb-4">
          <span className={ASSET_TYPE_COLORS[asset.asset_type]}>
            {ASSET_TYPE_LABELS[asset.asset_type]}
          </span>
          <Eye className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>

        <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
          {asset.name}
        </h3>

        <div className="flex items-center gap-2 text-2xl font-bold text-foreground mb-4">
          <span className="gold-text">{Number(asset.quantity).toLocaleString()}</span>
          <span className="text-sm font-normal text-muted-foreground">{asset.unit}</span>
        </div>

        {asset.description && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {asset.description}
          </p>
        )}

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{asset.storage_location || 'Location not specified'}</span>
          </div>
          {asset.acquisition_date && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Acquired {format(new Date(asset.acquisition_date), 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {OWNER_ENTITY_LABELS[asset.owner_entity]}
          </span>
        </div>
      </div>

      <AssetViewerModal
        assetId={asset.id}
        open={showViewer}
        onOpenChange={setShowViewer}
        onNavigateToFull={() => {
          setShowViewer(false);
          navigate(`/assets/${asset.id}`);
        }}
      />
    </>
  );
}
