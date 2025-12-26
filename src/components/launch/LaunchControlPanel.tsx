import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ConfirmationDialog } from './ConfirmationDialog';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  Globe,
  Server,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface LaunchSettings {
  id: string;
  safe_mode_enabled: boolean;
  arb_execution_locked: boolean;
  arb_execution_locked_reason: string | null;
  is_mainnet_mode: boolean;
  launch_stage: string;
  auto_arbitrage_enabled: boolean;
  auto_flash_loans_enabled: boolean;
  last_safety_check_at: string | null;
}

interface LaunchControlPanelProps {
  settings: LaunchSettings | null;
  onSettingsChange: (settings: LaunchSettings) => void;
  onRefresh: () => void;
}

type ConfirmAction = 'enable_mainnet' | 'unlock_execution' | 'disable_safe_mode' | null;

export function LaunchControlPanel({ settings, onSettingsChange, onRefresh }: LaunchControlPanelProps) {
  const [updating, setUpdating] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  if (!settings) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading launch settings...
        </CardContent>
      </Card>
    );
  }

  const updateSettings = async (
    updates: Partial<LaunchSettings>,
    action?: string,
    confirmationPhrase?: string
  ) => {
    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      const response = await supabase.functions.invoke('update-launch-settings', {
        body: { updates, action, confirmationPhrase },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      onSettingsChange({ ...settings, ...response.data.settings });
      toast.success('Settings updated successfully');
      setConfirmAction(null);
    } catch (error) {
      console.error('Failed to update settings:', error);
      toast.error(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleEmergencyStop = async () => {
    await updateSettings({
      safe_mode_enabled: true,
      arb_execution_locked: true,
      arb_execution_locked_reason: 'Emergency stop activated',
      auto_arbitrage_enabled: false,
      auto_flash_loans_enabled: false,
    });
    toast.warning('Emergency stop activated - all execution halted');
  };

  const handleToggleSafeMode = () => {
    if (settings.safe_mode_enabled) {
      setConfirmAction('disable_safe_mode');
    } else {
      updateSettings({ safe_mode_enabled: true });
    }
  };

  const handleToggleExecutionLock = () => {
    if (settings.arb_execution_locked) {
      setConfirmAction('unlock_execution');
    } else {
      updateSettings({
        arb_execution_locked: true,
        arb_execution_locked_reason: 'Manually locked by admin',
      });
    }
  };

  const handleToggleMainnetMode = () => {
    if (!settings.is_mainnet_mode) {
      setConfirmAction('enable_mainnet');
    } else {
      updateSettings({ is_mainnet_mode: false });
    }
  };

  const confirmDialogConfig: Record<NonNullable<ConfirmAction>, {
    title: string;
    description: string;
    phrase: string;
    variant: 'danger' | 'warning' | 'critical';
    updates: Partial<LaunchSettings>;
  }> = {
    enable_mainnet: {
      title: 'Enable Mainnet Mode',
      description: 'This will switch all operations to MAINNET. Real funds will be at risk. Ensure all safety checks are complete.',
      phrase: 'I CONFIRM MAINNET',
      variant: 'critical',
      updates: { is_mainnet_mode: true, launch_stage: 'LIVE' },
    },
    unlock_execution: {
      title: 'Unlock Execution',
      description: 'This will allow the arbitrage system to execute real trades. Ensure safe mode and risk limits are properly configured.',
      phrase: 'UNLOCK EXECUTION',
      variant: 'danger',
      updates: { arb_execution_locked: false, arb_execution_locked_reason: null },
    },
    disable_safe_mode: {
      title: 'Disable Safe Mode',
      description: 'Safe mode provides an additional layer of protection. Only disable if you are confident the system is operating correctly.',
      phrase: 'DISABLE SAFE MODE',
      variant: 'warning',
      updates: { safe_mode_enabled: false },
    },
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'DEVELOPMENT': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'STAGING': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'PRE_LAUNCH': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'LIVE': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <>
      <Card className="border-2 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Launch Control Panel</CardTitle>
                <CardDescription>Critical system controls for mainnet launch</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${getStageColor(settings.launch_stage)} border`}>
                {settings.launch_stage}
              </Badge>
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={updating}>
                <RefreshCw className={`h-4 w-4 ${updating ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Status Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Safe Mode */}
            <div className={`p-4 rounded-lg border-2 ${
              settings.safe_mode_enabled 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-amber-500/10 border-amber-500/30'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {settings.safe_mode_enabled ? (
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-amber-500" />
                  )}
                  <span className="font-medium">Safe Mode</span>
                </div>
                <Switch
                  checked={settings.safe_mode_enabled}
                  onCheckedChange={handleToggleSafeMode}
                  disabled={updating}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {settings.safe_mode_enabled 
                  ? 'Active - Additional safety checks enabled'
                  : 'Disabled - Operating without safety net'}
              </p>
            </div>

            {/* Execution Lock */}
            <div className={`p-4 rounded-lg border-2 ${
              settings.arb_execution_locked 
                ? 'bg-red-500/10 border-red-500/30' 
                : 'bg-green-500/10 border-green-500/30'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {settings.arb_execution_locked ? (
                    <Lock className="h-5 w-5 text-red-500" />
                  ) : (
                    <Unlock className="h-5 w-5 text-green-500" />
                  )}
                  <span className="font-medium">Execution</span>
                </div>
                <Switch
                  checked={!settings.arb_execution_locked}
                  onCheckedChange={handleToggleExecutionLock}
                  disabled={updating}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {settings.arb_execution_locked 
                  ? 'Locked - No trades can execute'
                  : 'Unlocked - System can execute trades'}
              </p>
            </div>

            {/* Network Mode */}
            <div className={`p-4 rounded-lg border-2 ${
              settings.is_mainnet_mode 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-blue-500/10 border-blue-500/30'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {settings.is_mainnet_mode ? (
                    <Globe className="h-5 w-5 text-green-500" />
                  ) : (
                    <Server className="h-5 w-5 text-blue-500" />
                  )}
                  <span className="font-medium">Network</span>
                </div>
                <Switch
                  checked={settings.is_mainnet_mode}
                  onCheckedChange={handleToggleMainnetMode}
                  disabled={updating}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {settings.is_mainnet_mode 
                  ? 'MAINNET - Real funds at risk!'
                  : 'Testnet - Development mode'}
              </p>
            </div>
          </div>

          <Separator />

          {/* Additional Controls */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-arb" className="text-sm">Auto Arbitrage</Label>
              <Switch
                id="auto-arb"
                checked={settings.auto_arbitrage_enabled}
                onCheckedChange={(checked) => updateSettings({ auto_arbitrage_enabled: checked })}
                disabled={updating}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-flash" className="text-sm">Auto Flash Loans</Label>
              <Switch
                id="auto-flash"
                checked={settings.auto_flash_loans_enabled}
                onCheckedChange={(checked) => updateSettings({ auto_flash_loans_enabled: checked })}
                disabled={updating}
              />
            </div>
            <div className="flex-1" />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEmergencyStop}
              disabled={updating}
              className="gap-2"
            >
              <AlertOctagon className="h-4 w-4" />
              Emergency Stop
            </Button>
          </div>

          {/* Current Status Summary */}
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="gap-1">
              {settings.safe_mode_enabled ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 text-amber-500" />
              )}
              Safe Mode {settings.safe_mode_enabled ? 'ON' : 'OFF'}
            </Badge>
            <Badge variant="outline" className="gap-1">
              {settings.arb_execution_locked ? (
                <Lock className="h-3 w-3 text-red-500" />
              ) : (
                <Unlock className="h-3 w-3 text-green-500" />
              )}
              Execution {settings.arb_execution_locked ? 'LOCKED' : 'UNLOCKED'}
            </Badge>
            <Badge variant="outline" className="gap-1">
              {settings.is_mainnet_mode ? (
                <Globe className="h-3 w-3 text-green-500" />
              ) : (
                <Server className="h-3 w-3 text-blue-500" />
              )}
              {settings.is_mainnet_mode ? 'MAINNET' : 'TESTNET'}
            </Badge>
            {settings.last_safety_check_at && (
              <Badge variant="outline" className="text-muted-foreground">
                Last check: {new Date(settings.last_safety_check_at).toLocaleString()}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialogs */}
      {confirmAction && (
        <ConfirmationDialog
          open={!!confirmAction}
          onOpenChange={(open) => !open && setConfirmAction(null)}
          title={confirmDialogConfig[confirmAction].title}
          description={confirmDialogConfig[confirmAction].description}
          confirmPhrase={confirmDialogConfig[confirmAction].phrase}
          variant={confirmDialogConfig[confirmAction].variant}
          isLoading={updating}
          onConfirm={() => {
            updateSettings(
              confirmDialogConfig[confirmAction].updates,
              confirmAction,
              confirmDialogConfig[confirmAction].phrase
            );
          }}
        />
      )}
    </>
  );
}
