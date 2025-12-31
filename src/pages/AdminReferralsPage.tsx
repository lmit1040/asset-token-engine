import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { 
  Users, 
  UserPlus, 
  CheckCircle, 
  Clock, 
  Coins,
  Search,
  RefreshCw
} from "lucide-react";

interface ReferralData {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code_id: string | null;
  onboarding_completed: boolean | null;
  reward_distributed: boolean | null;
  reward_amount: number | null;
  created_at: string | null;
  referrer_email?: string;
  referred_email?: string;
  referral_code?: string;
}

interface ReferralCodeData {
  id: string;
  user_id: string;
  code: string;
  uses_count: number | null;
  is_active: boolean | null;
  created_at: string | null;
  user_email?: string;
}

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<ReferralData[]>([]);
  const [codes, setCodes] = useState<ReferralCodeData[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { email: string }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"referrals" | "codes">("referrals");
  const [stats, setStats] = useState({
    totalReferrals: 0,
    completedOnboarding: 0,
    pendingOnboarding: 0,
    totalRewardsDistributed: 0,
    activeCodes: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [referralsRes, codesRes, profilesRes] = await Promise.all([
        supabase.from("referrals").select("*").order("created_at", { ascending: false }),
        supabase.from("referral_codes").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, email")
      ]);

      if (referralsRes.error) throw referralsRes.error;
      if (codesRes.error) throw codesRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const profileMap: Record<string, { email: string }> = {};
      (profilesRes.data || []).forEach(p => {
        profileMap[p.id] = { email: p.email };
      });
      setProfiles(profileMap);

      const codeMap: Record<string, string> = {};
      (codesRes.data || []).forEach(c => {
        codeMap[c.id] = c.code;
      });

      const enrichedReferrals = (referralsRes.data || []).map(r => ({
        ...r,
        referrer_email: profileMap[r.referrer_id]?.email,
        referred_email: profileMap[r.referred_id]?.email,
        referral_code: r.referral_code_id ? codeMap[r.referral_code_id] : undefined
      }));

      const enrichedCodes = (codesRes.data || []).map(c => ({
        ...c,
        user_email: profileMap[c.user_id]?.email
      }));

      setReferrals(enrichedReferrals);
      setCodes(enrichedCodes);

      setStats({
        totalReferrals: referralsRes.data?.length || 0,
        completedOnboarding: referralsRes.data?.filter(r => r.onboarding_completed).length || 0,
        pendingOnboarding: referralsRes.data?.filter(r => !r.onboarding_completed).length || 0,
        totalRewardsDistributed: referralsRes.data?.reduce((sum, r) => sum + (r.reward_amount || 0), 0) || 0,
        activeCodes: codesRes.data?.filter(c => c.is_active).length || 0
      });
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load referral data");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredReferrals = referrals.filter(r =>
    r.referrer_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.referred_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.referral_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCodes = codes.filter(c =>
    c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.user_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout
      title="Referral Management"
      subtitle="View and manage user referrals and referral codes"
      requireAdmin
    >
      <div className="space-y-6 animate-fade-in">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Referrals</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalReferrals}</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-foreground">{stats.completedOnboarding}</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-foreground">{stats.pendingOnboarding}</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Coins className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rewards Given</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalRewardsDistributed} MXG</p>
              </div>
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Codes</p>
                <p className="text-2xl font-bold text-foreground">{stats.activeCodes}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs and Search */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between">
          <div className="flex gap-2">
            <Button
              variant={activeTab === "referrals" ? "default" : "outline"}
              onClick={() => setActiveTab("referrals")}
            >
              Referrals
            </Button>
            <Button
              variant={activeTab === "codes" ? "default" : "outline"}
              onClick={() => setActiveTab("codes")}
            >
              Referral Codes
            </Button>
          </div>
          <div className="flex gap-2">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 input-dark w-64"
              />
            </div>
            <Button variant="outline" onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="glass-card overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeTab === "referrals" ? (
            filteredReferrals.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No referrals found.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="text-left py-3 px-4">Referrer</th>
                    <th className="text-left py-3 px-4">Referred User</th>
                    <th className="text-left py-3 px-4">Code Used</th>
                    <th className="text-center py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Reward</th>
                    <th className="text-right py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReferrals.map((referral) => (
                    <tr key={referral.id} className="hover:bg-muted/30 transition-colors border-t border-border/50">
                      <td className="py-3 px-4">
                        <span className="text-sm">{referral.referrer_email || referral.referrer_id.slice(0, 8)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm">{referral.referred_email || referral.referred_id.slice(0, 8)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {referral.referral_code || "-"}
                        </code>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {referral.onboarding_completed ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400">Completed</Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-400 border-amber-400/50">Pending</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-primary font-medium">
                          {referral.reward_amount ? `${referral.reward_amount} MXG` : "-"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-muted-foreground">
                        {referral.created_at ? format(new Date(referral.created_at), "MMM d, yyyy") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            filteredCodes.length === 0 ? (
              <div className="text-center py-12">
                <UserPlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No referral codes found.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="table-header">
                    <th className="text-left py-3 px-4">Code</th>
                    <th className="text-left py-3 px-4">Owner</th>
                    <th className="text-center py-3 px-4">Uses</th>
                    <th className="text-center py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.map((code) => (
                    <tr key={code.id} className="hover:bg-muted/30 transition-colors border-t border-border/50">
                      <td className="py-3 px-4">
                        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                          {code.code}
                        </code>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm">{code.user_email || code.user_id.slice(0, 8)}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-medium">{code.uses_count || 0}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {code.is_active ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-muted-foreground">
                        {code.created_at ? format(new Date(code.created_at), "MMM d, yyyy") : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
