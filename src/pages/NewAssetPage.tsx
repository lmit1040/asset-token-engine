import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AssetForm } from '@/components/assets/AssetForm';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export default function NewAssetPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    if (!user) return;
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('assets')
        .insert({
          ...data,
          created_by: user.id,
        });

      if (error) throw error;

      toast.success('Asset created successfully');
      navigate('/assets');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create asset');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout 
      title="Add New Asset" 
      subtitle="Register a new asset in the vault"
      requireAdmin
    >
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="glass-card p-8">
          <AssetForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </div>
      </div>
    </DashboardLayout>
  );
}
