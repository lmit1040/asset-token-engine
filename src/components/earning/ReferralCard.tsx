import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Users, Copy, Share2, Check, UserPlus, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ReferralCode, Referral } from '@/types/rewards';

interface ReferralCardProps {
  signupReward: number;
  onboardingReward: number;
}

export function ReferralCard({ signupReward, onboardingReward }: ReferralCardProps) {
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch user's referral code
      const { data: codes } = await supabase
        .from('referral_codes')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1);

      if (codes && codes.length > 0) {
        setReferralCode(codes[0] as ReferralCode);
      }

      // Fetch user's referrals
      const { data: refs } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (refs) {
        setReferrals(refs as Referral[]);
      }
    } catch (error) {
      console.error('Error fetching referral data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateCode = async () => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('generate-referral-code', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) throw response.error;

      setReferralCode({
        id: '',
        user_id: session.user.id,
        code: response.data.code,
        uses_count: response.data.uses_count,
        is_active: true,
        created_at: response.data.created_at,
      });

      toast.success('Referral code generated!');
    } catch (error: any) {
      console.error('Error generating code:', error);
      toast.error(error.message || 'Failed to generate code');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyCode = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode.code);
    setCopied(true);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = () => {
    if (!referralCode) return;
    const url = `${window.location.origin}/auth?ref=${referralCode.code}`;
    navigator.clipboard.writeText(url);
    toast.success('Referral link copied!');
  };

  const completedReferrals = referrals.filter(r => r.onboarding_completed).length;
  const pendingReferrals = referrals.filter(r => !r.onboarding_completed).length;
  const totalEarned = referrals.reduce((sum, r) => sum + (r.reward_amount || 0), 0);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Referral Program
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-4">Loading...</div>
        ) : referralCode ? (
          <>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Your Referral Code</label>
              <div className="flex gap-2">
                <Input 
                  value={referralCode.code} 
                  readOnly 
                  className="font-mono text-lg tracking-wider"
                />
                <Button variant="outline" size="icon" onClick={copyCode}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="icon" onClick={shareLink}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{referralCode.uses_count}</p>
                <p className="text-xs text-muted-foreground">Total Signups</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{completedReferrals}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold text-primary">{totalEarned}</p>
                <p className="text-xs text-muted-foreground">MXG Earned</p>
              </div>
            </div>

            {pendingReferrals > 0 && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-center gap-2 text-sm">
                  <UserPlus className="h-4 w-4 text-yellow-500" />
                  <span>{pendingReferrals} referral(s) pending onboarding</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4">
            <Gift className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">Generate your unique referral code to start earning!</p>
            <Button onClick={generateCode} disabled={isGenerating}>
              {isGenerating ? 'Generating...' : 'Generate Referral Code'}
            </Button>
          </div>
        )}

        <div className="pt-3 border-t border-border space-y-2">
          <p className="text-sm font-medium">Rewards</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Friend signs up</span>
            <Badge variant="secondary">+{signupReward} MXG</Badge>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Friend completes onboarding</span>
            <Badge variant="secondary">+{onboardingReward} MXG</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
