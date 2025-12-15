import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, RotateCcw, Globe, TestTube } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RpcConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

interface RpcConfig {
  rpc_solana_mainnet_url: string | null;
  rpc_solana_devnet_url: string | null;
  rpc_polygon_url: string | null;
  rpc_ethereum_url: string | null;
  rpc_arbitrum_url: string | null;
  rpc_bsc_url: string | null;
}

const RPC_FIELDS = [
  { key: 'rpc_solana_mainnet_url', label: 'Solana Mainnet', placeholder: 'https://api.mainnet-beta.solana.com', isMainnet: true },
  { key: 'rpc_solana_devnet_url', label: 'Solana Devnet', placeholder: 'https://api.devnet.solana.com', isMainnet: false },
  { key: 'rpc_polygon_url', label: 'Polygon Mainnet', placeholder: 'https://polygon-rpc.com', isMainnet: true },
  { key: 'rpc_ethereum_url', label: 'Ethereum Mainnet', placeholder: 'https://eth.llamarpc.com', isMainnet: true },
  { key: 'rpc_arbitrum_url', label: 'Arbitrum Mainnet', placeholder: 'https://arb1.arbitrum.io/rpc', isMainnet: true },
  { key: 'rpc_bsc_url', label: 'BSC Mainnet', placeholder: 'https://bsc-dataseed1.binance.org', isMainnet: true },
] as const;

export function RpcConfigModal({ open, onOpenChange, onSaved }: RpcConfigModalProps) {
  const [config, setConfig] = useState<RpcConfig>({
    rpc_solana_mainnet_url: null,
    rpc_solana_devnet_url: null,
    rpc_polygon_url: null,
    rpc_ethereum_url: null,
    rpc_arbitrum_url: null,
    rpc_bsc_url: null,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('rpc_solana_mainnet_url, rpc_solana_devnet_url, rpc_polygon_url, rpc_ethereum_url, rpc_arbitrum_url, rpc_bsc_url')
        .limit(1)
        .single();

      if (error) throw error;

      setConfig({
        rpc_solana_mainnet_url: data.rpc_solana_mainnet_url || null,
        rpc_solana_devnet_url: data.rpc_solana_devnet_url || null,
        rpc_polygon_url: data.rpc_polygon_url || null,
        rpc_ethereum_url: data.rpc_ethereum_url || null,
        rpc_arbitrum_url: data.rpc_arbitrum_url || null,
        rpc_bsc_url: data.rpc_bsc_url || null,
      });
    } catch (error) {
      console.error('Error loading RPC config:', error);
      toast.error('Failed to load RPC configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({
          rpc_solana_mainnet_url: config.rpc_solana_mainnet_url || null,
          rpc_solana_devnet_url: config.rpc_solana_devnet_url || null,
          rpc_polygon_url: config.rpc_polygon_url || null,
          rpc_ethereum_url: config.rpc_ethereum_url || null,
          rpc_arbitrum_url: config.rpc_arbitrum_url || null,
          rpc_bsc_url: config.rpc_bsc_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', (await supabase.from('system_settings').select('id').limit(1).single()).data?.id);

      if (error) throw error;

      toast.success('RPC configuration saved');
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving RPC config:', error);
      toast.error('Failed to save RPC configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = (key: keyof RpcConfig) => {
    setConfig(prev => ({ ...prev, [key]: null }));
  };

  const handleChange = (key: keyof RpcConfig, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value || null }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configure RPC Endpoints</DialogTitle>
          <DialogDescription>
            Set custom RPC URLs for each network. Leave blank to use default public endpoints.
            Custom RPCs from secrets (if configured) take priority over these settings.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {RPC_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={field.key} className="font-medium">
                    {field.label}
                  </Label>
                  <Badge 
                    variant="outline" 
                    className={field.isMainnet 
                      ? 'border-destructive/50 text-destructive text-[10px]' 
                      : 'border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px]'
                    }
                  >
                    {field.isMainnet ? <Globe className="h-2.5 w-2.5 mr-1" /> : <TestTube className="h-2.5 w-2.5 mr-1" />}
                    {field.isMainnet ? 'Mainnet' : 'Testnet'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Input
                    id={field.key}
                    type="url"
                    placeholder={field.placeholder}
                    value={config[field.key] || ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className="font-mono text-sm"
                  />
                  {config[field.key] && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleClear(field.key)}
                      title="Clear to use default"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Default: {field.placeholder}
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
