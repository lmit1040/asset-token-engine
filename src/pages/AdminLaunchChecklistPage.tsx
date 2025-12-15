import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Shield, 
  Server, 
  TestTube, 
  Rocket,
  Wallet,
  TrendingUp,
  Zap,
  Key,
  FileCheck,
  Scale,
  RefreshCw,
  Info,
  Loader2
} from 'lucide-react';
import { 
  AutoDetectionResult, 
  LaunchStatusResponse, 
  AUTO_DETECTABLE_ITEMS,
  DetectionStatus 
} from '@/types/launchChecklist';
import { toast } from 'sonner';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium';
  category: string;
  link?: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  // ========== MAINNET API & INFRASTRUCTURE ==========
  {
    id: 'mainnet-rpc-solana',
    title: 'Configure Solana mainnet RPC endpoint',
    description: 'Replace Devnet RPC with production endpoint (Helius, QuickNode, or Triton). Set SOLANA_MAINNET_RPC_URL secret.',
    priority: 'critical',
    category: 'Mainnet API & Infrastructure',
  },
  {
    id: 'mainnet-solana-rpc',
    title: 'Fund Solana mainnet RPC provider',
    description: 'Ensure your RPC provider (Helius, QuickNode, Triton) has sufficient credits/quota for production traffic.',
    priority: 'critical',
    category: 'Mainnet API & Infrastructure',
  },
  {
    id: 'mainnet-rpc-evm',
    title: 'Configure EVM mainnet RPC endpoints',
    description: 'Set up production RPC URLs via secrets: EVM_POLYGON_RPC_URL, EVM_ETHEREUM_RPC_URL, EVM_ARBITRUM_RPC_URL, EVM_BSC_RPC_URL (Alchemy, Infura, or QuickNode).',
    priority: 'critical',
    category: 'Mainnet API & Infrastructure',
  },
  {
    id: 'mainnet-0x-api',
    title: 'Verify 0x API mainnet access',
    description: 'Confirm ZEROX_API_KEY has mainnet permissions. Test quote fetching on mainnet chains before enabling real trades.',
    priority: 'critical',
    category: 'Mainnet API & Infrastructure',
  },
  {
    id: 'deploy-flash-receiver-mainnet',
    title: 'Deploy MetallumFlashReceiver to Polygon mainnet',
    description: 'Deploy flash loan receiver contract to Polygon mainnet via Remix. Requires mainnet POL for gas.',
    priority: 'critical',
    category: 'Mainnet API & Infrastructure',
  },
  {
    id: 'verify-flash-receiver-contract',
    title: 'Verify flash loan receiver on Polygonscan',
    description: 'Verify and publish contract source code on Polygonscan for transparency and trust.',
    priority: 'high',
    category: 'Mainnet API & Infrastructure',
  },
  {
    id: 'update-flash-loan-providers',
    title: 'Configure flash_loan_providers for mainnet',
    description: 'Update flash_loan_providers table with Aave V3 Polygon mainnet addresses and deployed receiver contract address.',
    priority: 'critical',
    category: 'Mainnet API & Infrastructure',
    link: '/admin/arbitrage/flash-loans',
  },

  // ========== WALLET FUNDING ==========
  {
    id: 'fund-solana-ops',
    title: 'Fund Solana OPS_WALLET with mainnet SOL',
    description: 'Transfer sufficient SOL to OPS wallet for fee payer funding and arbitrage capital. Recommended: 5-10 SOL minimum.',
    priority: 'critical',
    category: 'Wallet Funding',
  },
  {
    id: 'fund-evm-ops',
    title: 'Fund EVM_OPS wallet with mainnet tokens',
    description: 'Transfer ETH, POL, and other native tokens to EVM OPS wallet for multi-chain operations.',
    priority: 'critical',
    category: 'Wallet Funding',
  },
  {
    id: 'generate-mainnet-solana-fee-payers',
    title: 'Generate mainnet Solana fee payers',
    description: 'Generate new fee payer wallets for mainnet and fund each with ~0.5 SOL initial balance.',
    priority: 'high',
    category: 'Wallet Funding',
    link: '/admin/fee-payers',
  },
  {
    id: 'generate-mainnet-evm-fee-payers',
    title: 'Generate mainnet EVM fee payers',
    description: 'Generate fee payer wallets for each EVM chain (Polygon, Ethereum, Arbitrum, BSC) with native token funding.',
    priority: 'high',
    category: 'Wallet Funding',
    link: '/admin/evm-fee-payers',
  },
  {
    id: 'verify-refill-thresholds',
    title: 'Adjust wallet refill thresholds for mainnet gas costs',
    description: 'Review MIN_BALANCE_THRESHOLD and TOP_UP_AMOUNT values - mainnet gas may require higher thresholds.',
    priority: 'high',
    category: 'Wallet Funding',
  },

  // ========== TOKEN & TREASURY DEPLOYMENT ==========
  {
    id: 'redeploy-mxu-mainnet',
    title: 'Redeploy MXU token to Solana mainnet',
    description: 'Deploy MXU utility token to mainnet with 100M supply. Update token_definitions with new contract address.',
    priority: 'critical',
    category: 'Token & Treasury',
  },
  {
    id: 'redeploy-asset-tokens-mainnet',
    title: 'Redeploy asset-backed tokens (GBX, MXS, MXC, GCX)',
    description: 'Deploy all asset-backed tokens to mainnet. Verify total supply matches backing assets.',
    priority: 'critical',
    category: 'Token & Treasury',
    link: '/tokens',
  },
  {
    id: 'fund-treasury-accounts',
    title: 'Fund mainnet treasury accounts',
    description: 'Mint tokens to treasury accounts after mainnet deployment. Verify treasury balances match expected supply.',
    priority: 'critical',
    category: 'Token & Treasury',
    link: '/admin/deliver',
  },
  {
    id: 'update-token-definitions',
    title: 'Update token_definitions with mainnet addresses',
    description: 'Replace all testnet contract_address and treasury_account values with mainnet addresses.',
    priority: 'critical',
    category: 'Token & Treasury',
  },

  // ========== ARBITRAGE & FLASH LOANS ==========
  {
    id: 'remove-mock-mode',
    title: 'Enable mainnet mode for arbitrage',
    description: 'Enable is_mainnet_mode in system settings to switch from testnet mock mode to real trade execution.',
    priority: 'critical',
    category: 'Arbitrage & Flash Loans',
  },
  {
    id: 'update-strategy-thresholds',
    title: 'Update arbitrage strategy thresholds for mainnet',
    description: 'Adjust min_expected_profit_native, min_profit_to_gas_ratio (recommend 3.0+), and max_trade_value_native for mainnet conditions.',
    priority: 'high',
    category: 'Arbitrage & Flash Loans',
    link: '/admin/arbitrage/strategies',
  },
  {
    id: 'configure-safe-mode-mainnet',
    title: 'Configure safe_mode thresholds for mainnet',
    description: 'Set appropriate max_global_daily_loss_native in system_settings. Start conservative (e.g., 0.5 ETH equivalent).',
    priority: 'high',
    category: 'Arbitrage & Flash Loans',
    link: '/admin/arbitrage/automated',
  },
  {
    id: 'test-small-mainnet-arb',
    title: 'Execute test arbitrage with minimal amounts',
    description: 'Run a single small arbitrage trade on mainnet to verify entire flow works before enabling automation.',
    priority: 'high',
    category: 'Arbitrage & Flash Loans',
  },
  {
    id: 'test-flash-loan-mainnet',
    title: 'Test flash loan execution on mainnet',
    description: 'Execute a small flash loan arbitrage on Polygon mainnet to verify receiver contract and Aave integration.',
    priority: 'high',
    category: 'Arbitrage & Flash Loans',
  },

  // ========== ENVIRONMENT & SECRETS ==========
  {
    id: 'new-fee-payer-encryption-key',
    title: 'Generate new FEE_PAYER_ENCRYPTION_KEY for production',
    description: 'Create a fresh encryption key for mainnet fee payer private key storage. Never reuse testnet keys.',
    priority: 'critical',
    category: 'Environment & Secrets',
  },
  {
    id: 'new-ops-wallet-keys',
    title: 'Generate new OPS wallet keypairs for mainnet',
    description: 'Create fresh OPS_WALLET_SECRET_KEY and EVM_OPS_PRIVATE_KEY for production. Never reuse testnet keys.',
    priority: 'critical',
    category: 'Environment & Secrets',
  },
  {
    id: 'verify-resend-api-production',
    title: 'Verify RESEND_API_KEY for production emails',
    description: 'Confirm Resend API key works for production domain and email sending limits are adequate.',
    priority: 'high',
    category: 'Environment & Secrets',
  },
  {
    id: 'verify-pinata-production',
    title: 'Verify PINATA_JWT for production IPFS',
    description: 'Confirm Pinata JWT has adequate storage limits for production token metadata uploads.',
    priority: 'medium',
    category: 'Environment & Secrets',
  },

  // ========== SECURITY ==========
  {
    id: 'leaked-password',
    title: 'Enable Leaked Password Protection',
    description: 'Enable in Supabase dashboard under Auth settings to prevent compromised passwords.',
    priority: 'critical',
    category: 'Security',
  },
  {
    id: 'email-exposure',
    title: 'Review email data exposure in profiles',
    description: 'Ensure email data is properly protected and not exposed through admin access unnecessarily.',
    priority: 'critical',
    category: 'Security',
  },
  {
    id: 'activity-logging',
    title: 'Implement comprehensive activity logging',
    description: 'Ensure all sensitive operations are logged for audit trail compliance. Review activity_logs coverage.',
    priority: 'high',
    category: 'Security',
    link: '/admin/activity',
  },
  {
    id: 'rate-limiting',
    title: 'Add rate limiting to edge functions',
    description: 'Prevent abuse by limiting request frequency on critical endpoints (auth, transfers, arbitrage).',
    priority: 'high',
    category: 'Security',
  },
  {
    id: 'rls-audit',
    title: 'Final RLS policy audit',
    description: 'Review all Row Level Security policies for production appropriateness. Test with different user roles.',
    priority: 'high',
    category: 'Security',
  },

  // ========== TESTING ==========
  {
    id: 'e2e-auth-testing',
    title: 'Test authentication flows end-to-end',
    description: 'Verify signup, login, password reset, NDA signing all work correctly in production environment.',
    priority: 'critical',
    category: 'Testing',
  },
  {
    id: 'e2e-token-testing',
    title: 'Test token operations end-to-end',
    description: 'Verify token assignment, transfers, and delivery work correctly on mainnet.',
    priority: 'critical',
    category: 'Testing',
  },
  {
    id: 'e2e-arbitrage-testing',
    title: 'Test arbitrage automation end-to-end',
    description: 'Run complete automation cycle: scan → decision → execution → refill on mainnet with small amounts.',
    priority: 'high',
    category: 'Testing',
  },
  {
    id: 'load-testing',
    title: 'Perform load testing',
    description: 'Verify system handles expected user load without degradation. Test concurrent operations.',
    priority: 'high',
    category: 'Testing',
  },
  {
    id: 'fee-payer-rotation-test',
    title: 'Test fee payer rotation on mainnet',
    description: 'Verify fee payer selection and rotation works correctly with mainnet transactions.',
    priority: 'high',
    category: 'Testing',
  },

  // ========== INFRASTRUCTURE ==========
  {
    id: 'monitoring',
    title: 'Set up monitoring and alerting',
    description: 'Configure alerts for errors, downtime, low wallet balances, and safe mode triggers.',
    priority: 'high',
    category: 'Infrastructure',
  },
  {
    id: 'backup-recovery',
    title: 'Validate backup and recovery procedures',
    description: 'Test database backups and document recovery process. Verify point-in-time recovery works.',
    priority: 'high',
    category: 'Infrastructure',
  },
  {
    id: 'edge-function-scaling',
    title: 'Review edge function timeouts and scaling',
    description: 'Ensure edge functions have appropriate timeout settings for mainnet blockchain operations.',
    priority: 'medium',
    category: 'Infrastructure',
  },

  // ========== COMPLIANCE ==========
  {
    id: 'legal-review',
    title: 'Complete legal/compliance review',
    description: 'Ensure all disclaimers, terms, and compliance measures are in place. Review NDA text with legal.',
    priority: 'high',
    category: 'Compliance',
  },
  {
    id: 'terms-privacy-policy',
    title: 'Publish Terms of Service and Privacy Policy',
    description: 'Ensure legal documents are accessible and linked from footer/auth pages.',
    priority: 'high',
    category: 'Compliance',
  },
  {
    id: 'licensing-final-check',
    title: 'Final licensing compliance verification',
    description: 'Confirm no features trigger MSB, securities, or exchange licensing requirements.',
    priority: 'high',
    category: 'Compliance',
  },

  // ========== DOCUMENTATION ==========
  {
    id: 'documentation',
    title: 'Finalize user documentation',
    description: 'Complete help docs, FAQs, and onboarding guides for users.',
    priority: 'medium',
    category: 'Documentation',
  },
  {
    id: 'admin-runbook',
    title: 'Create admin operations runbook',
    description: 'Document procedures for common admin tasks, troubleshooting, and incident response.',
    priority: 'medium',
    category: 'Documentation',
  },
  {
    id: 'api-documentation',
    title: 'Document edge function APIs',
    description: 'Create internal documentation for all edge functions, parameters, and expected responses.',
    priority: 'medium',
    category: 'Documentation',
  },
];

const STORAGE_KEY = 'metallumx-launch-checklist';

const CATEGORY_ORDER = [
  'Mainnet API & Infrastructure',
  'Wallet Funding',
  'Token & Treasury',
  'Arbitrage & Flash Loans',
  'Environment & Secrets',
  'Security',
  'Testing',
  'Infrastructure',
  'Compliance',
  'Documentation',
];

export default function AdminLaunchChecklistPage() {
  const { isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [autoDetectedItems, setAutoDetectedItems] = useState<Map<string, AutoDetectionResult>>(new Map());
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [isAdmin, isLoading, navigate]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setCheckedItems(new Set(JSON.parse(saved)));
    }
  }, []);

  const runAutoDetection = useCallback(async () => {
    setIsDetecting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error('Not authenticated');
        return;
      }

      const { data, error } = await supabase.functions.invoke<LaunchStatusResponse>('check-launch-status');

      if (error) {
        console.error('Auto-detection error:', error);
        toast.error('Failed to run auto-detection');
        return;
      }

      if (data?.results) {
        const newMap = new Map<string, AutoDetectionResult>();
        for (const result of data.results) {
          newMap.set(result.itemId, result);
        }
        setAutoDetectedItems(newMap);
        setLastCheckedAt(data.checkedAt);
        
        const autoVerifiedCount = data.results.filter(r => r.isComplete).length;
        toast.success(`Auto-detection complete: ${autoVerifiedCount} items verified`);
      }
    } catch (err) {
      console.error('Auto-detection failed:', err);
      toast.error('Auto-detection failed');
    } finally {
      setIsDetecting(false);
    }
  }, []);

  // Run auto-detection on mount
  useEffect(() => {
    if (isAdmin && !isLoading) {
      runAutoDetection();
    }
  }, [isAdmin, isLoading, runAutoDetection]);

  const toggleItem = (id: string) => {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setCheckedItems(newChecked);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...newChecked]));
  };

  const getItemStatus = (itemId: string): DetectionStatus => {
    if (isDetecting && AUTO_DETECTABLE_ITEMS.includes(itemId)) {
      return 'loading';
    }
    const autoResult = autoDetectedItems.get(itemId);
    if (autoResult) {
      return autoResult.isComplete ? 'auto-verified' : 'auto-incomplete';
    }
    if (AUTO_DETECTABLE_ITEMS.includes(itemId)) {
      return 'loading';
    }
    return 'manual-required';
  };

  const isItemComplete = (itemId: string): boolean => {
    // Auto-verified items are always complete
    const autoResult = autoDetectedItems.get(itemId);
    if (autoResult?.isComplete) return true;
    // Otherwise check manual checkbox
    return checkedItems.has(itemId);
  };

  const categories = CATEGORY_ORDER.filter(cat => 
    CHECKLIST_ITEMS.some(item => item.category === cat)
  );
  
  const completedCount = CHECKLIST_ITEMS.filter(item => isItemComplete(item.id)).length;
  const totalCount = CHECKLIST_ITEMS.length;
  const progress = Math.round((completedCount / totalCount) * 100);

  const criticalRemaining = CHECKLIST_ITEMS.filter(
    item => item.priority === 'critical' && !isItemComplete(item.id)
  ).length;

  const autoVerifiedCount = Array.from(autoDetectedItems.values()).filter(r => r.isComplete).length;

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">High</Badge>;
      default:
        return <Badge variant="secondary">Medium</Badge>;
    }
  };

  const getStatusBadge = (itemId: string) => {
    const status = getItemStatus(itemId);
    const autoResult = autoDetectedItems.get(itemId);

    switch (status) {
      case 'loading':
        return (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking
          </Badge>
        );
      case 'auto-verified':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="default" className="bg-green-600 hover:bg-green-700 gap-1">
                  <Zap className="h-3 w-3" />
                  Auto-verified
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="font-medium">{autoResult?.reason}</p>
                {autoResult?.detectedValue !== undefined && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Value: {autoResult.detectedValue}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'auto-incomplete':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1">
                  <Info className="h-3 w-3" />
                  Not configured
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <p className="font-medium">{autoResult?.reason}</p>
                {autoResult?.detectedValue !== undefined && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Current: {autoResult.detectedValue}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Manual check
          </Badge>
        );
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Security':
        return <Shield className="h-5 w-5" />;
      case 'Testing':
        return <TestTube className="h-5 w-5" />;
      case 'Infrastructure':
        return <Server className="h-5 w-5" />;
      case 'Mainnet API & Infrastructure':
        return <Rocket className="h-5 w-5" />;
      case 'Wallet Funding':
        return <Wallet className="h-5 w-5" />;
      case 'Token & Treasury':
        return <FileCheck className="h-5 w-5" />;
      case 'Arbitrage & Flash Loans':
        return <TrendingUp className="h-5 w-5" />;
      case 'Environment & Secrets':
        return <Key className="h-5 w-5" />;
      case 'Compliance':
        return <Scale className="h-5 w-5" />;
      case 'Documentation':
        return <Clock className="h-5 w-5" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };

  if (isLoading) {
    return <DashboardLayout title="Launch Checklist"><div className="p-6">Loading...</div></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Mainnet Launch Checklist" subtitle="Complete all critical items before going live">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">Mainnet Launch Checklist</h1>
            <p className="text-muted-foreground">
              {totalCount} tasks across {categories.length} categories for production deployment
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={runAutoDetection}
              disabled={isDetecting}
            >
              {isDetecting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh Status
            </Button>
            {criticalRemaining > 0 ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-medium">{criticalRemaining} critical items remaining</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">All critical items complete!</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Summary */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Overall Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{progress}%</div>
              <Progress value={progress} className="h-2 mt-2" />
              <p className="text-xs text-muted-foreground mt-1">{completedCount} of {totalCount} tasks</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Auto-Verified</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{autoVerifiedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {AUTO_DETECTABLE_ITEMS.length} detectable items
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Critical Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{criticalRemaining}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {CHECKLIST_ITEMS.filter(i => i.priority === 'critical').length} total critical
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">High Priority</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">
                {CHECKLIST_ITEMS.filter(i => i.priority === 'high' && !isItemComplete(i.id)).length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {CHECKLIST_ITEMS.filter(i => i.priority === 'high').length} total high
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ready Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${criticalRemaining === 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                {criticalRemaining === 0 ? 'Ready' : 'Not Ready'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {criticalRemaining === 0 ? 'All blockers resolved' : 'Critical blockers remain'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Last checked timestamp */}
        {lastCheckedAt && (
          <p className="text-xs text-muted-foreground">
            Last auto-check: {new Date(lastCheckedAt).toLocaleString()}
          </p>
        )}

        {/* Category Cards */}
        <div className="grid gap-6">
          {categories.map(category => {
            const categoryItems = CHECKLIST_ITEMS.filter(item => item.category === category);
            const categoryCompleted = categoryItems.filter(item => isItemComplete(item.id)).length;
            const categoryCritical = categoryItems.filter(i => i.priority === 'critical' && !isItemComplete(i.id)).length;
            
            return (
              <Card key={category}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(category)}
                      <CardTitle>{category}</CardTitle>
                      {categoryCritical > 0 && (
                        <Badge variant="destructive" className="ml-2">{categoryCritical} critical</Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {categoryCompleted}/{categoryItems.length} complete
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {categoryItems.map(item => {
                    const isComplete = isItemComplete(item.id);
                    const autoResult = autoDetectedItems.get(item.id);
                    const isAutoVerified = autoResult?.isComplete === true;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          isComplete
                            ? isAutoVerified 
                              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900' 
                              : 'bg-muted/50 border-muted'
                            : 'bg-background border-border hover:bg-muted/30'
                        }`}
                      >
                        <Checkbox
                          id={item.id}
                          checked={isComplete}
                          onCheckedChange={() => toggleItem(item.id)}
                          className="mt-1"
                          disabled={isAutoVerified}
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <label
                              htmlFor={item.id}
                              className={`font-medium cursor-pointer ${
                                isComplete ? 'line-through text-muted-foreground' : ''
                              }`}
                            >
                              {item.title}
                            </label>
                            {item.link && (
                              <a 
                                href={item.link} 
                                className="text-xs text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Open →
                              </a>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {getPriorityBadge(item.priority)}
                          {getStatusBadge(item.id)}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
