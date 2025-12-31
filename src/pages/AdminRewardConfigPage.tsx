import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Gift, 
  Coins, 
  Save,
  RefreshCw,
  TrendingUp
} from "lucide-react";

interface RewardConfig {
  id: string;
  reward_type: string;
  mxg_amount: number;
  description: string | null;
  is_active: boolean | null;
  max_per_user_daily: number | null;
  updated_at: string | null;
}

export default function AdminRewardConfigPage() {
  const [configs, setConfigs] = useState<RewardConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editedConfigs, setEditedConfigs] = useState<Record<string, Partial<RewardConfig>>>({});
  const [stats, setStats] = useState({
    totalDistributed: 0,
    pendingRewards: 0,
    activeConfigs: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [configsRes, rewardsRes] = await Promise.all([
        supabase.from("reward_configurations").select("*").order("reward_type"),
        supabase.from("activity_rewards").select("mxg_amount, status")
      ]);

      if (configsRes.error) throw configsRes.error;
      setConfigs(configsRes.data || []);

      const rewards = rewardsRes.data || [];
      setStats({
        totalDistributed: rewards
          .filter(r => r.status === 'distributed')
          .reduce((sum, r) => sum + r.mxg_amount, 0),
        pendingRewards: rewards
          .filter(r => r.status === 'pending')
          .reduce((sum, r) => sum + r.mxg_amount, 0),
        activeConfigs: (configsRes.data || []).filter(c => c.is_active).length
      });
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load reward configurations");
    } finally {
      setIsLoading(false);
    }
  }

  function handleConfigChange(id: string, field: keyof RewardConfig, value: number | boolean | null) {
    setEditedConfigs(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  }

  async function saveChanges() {
    setIsSaving(true);
    try {
      for (const [id, changes] of Object.entries(editedConfigs)) {
        const { error } = await supabase
          .from("reward_configurations")
          .update({ ...changes, updated_at: new Date().toISOString() })
          .eq("id", id);
        
        if (error) throw error;
      }
      
      toast.success("Reward configurations updated");
      setEditedConfigs({});
      fetchData();
    } catch (error) {
      console.error("Error saving:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }

  function getDisplayName(type: string): string {
    const names: Record<string, string> = {
      asset_submission: "Asset Submission",
      profile_complete: "Profile Completion",
      governance_vote: "Governance Vote",
      referral_signup: "Referral Signup",
      referral_onboarding: "Referral Onboarding"
    };
    return names[type] || type;
  }

  const hasChanges = Object.keys(editedConfigs).length > 0;

  return (
    <DashboardLayout
      title="Reward Configuration"
      subtitle="Manage MXG reward amounts and settings"
      requireAdmin
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Coins className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Distributed</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalDistributed.toFixed(2)} MXG</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Gift className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Rewards</p>
                <p className="text-2xl font-bold text-foreground">{stats.pendingRewards.toFixed(2)} MXG</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Rewards</p>
                <p className="text-2xl font-bold text-foreground">{stats.activeConfigs}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <Button variant="outline" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {hasChanges && (
            <Button onClick={saveChanges} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </div>

        {/* Configuration Table */}
        <div className="glass-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="text-left py-3 px-4">Reward Type</th>
                  <th className="text-left py-3 px-4">Description</th>
                  <th className="text-left py-3 px-4">Amount (MXG)</th>
                  <th className="text-left py-3 px-4">Daily Limit</th>
                  <th className="text-center py-3 px-4">Active</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => {
                  const edited = editedConfigs[config.id] || {};
                  const currentAmount = edited.mxg_amount ?? config.mxg_amount;
                  const currentLimit = edited.max_per_user_daily ?? config.max_per_user_daily;
                  const currentActive = edited.is_active ?? config.is_active;

                  return (
                    <tr key={config.id} className="hover:bg-muted/30 transition-colors border-t border-border/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{getDisplayName(config.reward_type)}</span>
                          {edited && Object.keys(edited).length > 0 && (
                            <Badge variant="outline" className="text-xs">Modified</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">
                        {config.description || "-"}
                      </td>
                      <td className="py-3 px-4">
                        <Input
                          type="number"
                          value={currentAmount}
                          onChange={(e) => handleConfigChange(config.id, "mxg_amount", parseFloat(e.target.value) || 0)}
                          className="w-24 input-dark"
                          min={0}
                          step={1}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <Input
                          type="number"
                          value={currentLimit ?? ""}
                          onChange={(e) => handleConfigChange(
                            config.id, 
                            "max_per_user_daily", 
                            e.target.value ? parseInt(e.target.value) : null
                          )}
                          className="w-24 input-dark"
                          min={1}
                          placeholder="∞"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Switch
                          checked={currentActive ?? true}
                          onCheckedChange={(checked) => handleConfigChange(config.id, "is_active", checked)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
