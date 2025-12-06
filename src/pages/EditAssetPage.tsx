import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AssetForm } from '@/components/assets/AssetForm';
import { supabase } from '@/integrations/supabase/client';
import { Asset } from '@/types/database';
import { toast } from 'sonner';

export default function EditAssetPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (id) fetchAsset();
  }, [id]);

  async function fetchAsset() {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      toast.error('Asset not found');
      navigate('/assets');
      return;
    }
    setAsset(data as Asset);
    setIsLoading(false);
  }

  const handleSubmit = async (data: Partial<Asset>) => {
    if (!id) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('assets')
        .update(data)
        .eq('id', id);

      if (error) throw error;

      toast.success('Asset updated successfully');
      navigate(`/assets/${id}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update asset');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout title="Edit Asset" subtitle="Loading..." requireAdmin>
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout 
      title="Edit Asset" 
      subtitle={asset?.name || 'Update asset details'}
      requireAdmin
    >
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="glass-card p-8">
          {asset && (
            <AssetForm 
              asset={asset} 
              onSubmit={handleSubmit} 
              isSubmitting={isSubmitting} 
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
