import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, Clock, Shield, Server, TestTube, Rocket } from 'lucide-react';

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium';
  category: string;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  // Critical Blockers
  {
    id: 'mainnet-rpc',
    title: 'Configure mainnet RPC endpoints',
    description: 'Replace Devnet/Testnet RPC URLs with mainnet endpoints for Solana and EVM chains',
    priority: 'critical',
    category: 'Mainnet Migration',
  },
  {
    id: 'mainnet-tokens',
    title: 'Redeploy tokens to mainnet',
    description: 'All tokens are currently on Testnet/Devnet - need fresh deployments on mainnet',
    priority: 'critical',
    category: 'Mainnet Migration',
  },
  {
    id: 'leaked-password',
    title: 'Enable Leaked Password Protection',
    description: 'Enable in Supabase dashboard under Auth settings to prevent compromised passwords',
    priority: 'critical',
    category: 'Security',
  },
  {
    id: 'email-exposure',
    title: 'Review email data exposure in profiles',
    description: 'Ensure email data is properly protected and not exposed through admin access unnecessarily',
    priority: 'critical',
    category: 'Security',
  },
  {
    id: 'e2e-testing',
    title: 'Complete end-to-end testing',
    description: 'Test all critical user flows: auth, token assignment, transfers, proof uploads',
    priority: 'critical',
    category: 'Testing',
  },
  
  // High Priority
  {
    id: 'activity-logging',
    title: 'Implement append-only activity logging',
    description: 'Ensure all sensitive operations are logged for audit trail compliance',
    priority: 'high',
    category: 'Security',
  },
  {
    id: 'rate-limiting',
    title: 'Add rate limiting to edge functions',
    description: 'Prevent abuse by limiting request frequency on critical endpoints',
    priority: 'high',
    category: 'Security',
  },
  {
    id: 'monitoring',
    title: 'Set up monitoring and alerting',
    description: 'Configure alerts for errors, downtime, and suspicious activity',
    priority: 'high',
    category: 'Infrastructure',
  },
  {
    id: 'backup-recovery',
    title: 'Validate backup and recovery procedures',
    description: 'Test database backups and document recovery process',
    priority: 'high',
    category: 'Infrastructure',
  },
  {
    id: 'load-testing',
    title: 'Perform load testing',
    description: 'Verify system handles expected user load without degradation',
    priority: 'high',
    category: 'Testing',
  },
  
  // Medium Priority
  {
    id: 'jupiter-routing',
    title: 'Configure production Jupiter routing',
    description: 'Update Jupiter API configuration for mainnet DEX routing',
    priority: 'medium',
    category: 'Infrastructure',
  },
  {
    id: 'fee-payer-funding',
    title: 'Fund mainnet fee payer wallets',
    description: 'Ensure fee payer wallets have sufficient SOL/native tokens for mainnet operations',
    priority: 'medium',
    category: 'Infrastructure',
  },
  {
    id: 'ops-wallet-funding',
    title: 'Fund mainnet OPS wallets',
    description: 'Transfer required funds to Solana and EVM OPS wallets for mainnet',
    priority: 'medium',
    category: 'Infrastructure',
  },
  {
    id: 'legal-review',
    title: 'Complete legal/compliance review',
    description: 'Ensure all disclaimers and compliance measures are in place',
    priority: 'medium',
    category: 'Compliance',
  },
  {
    id: 'documentation',
    title: 'Finalize user documentation',
    description: 'Complete help docs, FAQs, and onboarding guides',
    priority: 'medium',
    category: 'Documentation',
  },
];

const STORAGE_KEY = 'metallumx-launch-checklist';

export default function AdminLaunchChecklistPage() {
  const { isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

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

  const categories = [...new Set(CHECKLIST_ITEMS.map(item => item.category))];
  const completedCount = checkedItems.size;
  const totalCount = CHECKLIST_ITEMS.length;
  const progress = Math.round((completedCount / totalCount) * 100);

  const criticalRemaining = CHECKLIST_ITEMS.filter(
    item => item.priority === 'critical' && !checkedItems.has(item.id)
  ).length;

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'high':
        return <Badge variant="default" className="bg-amber-500">High</Badge>;
      default:
        return <Badge variant="secondary">Medium</Badge>;
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
      case 'Mainnet Migration':
        return <Rocket className="h-5 w-5" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };

  if (isLoading) {
    return <DashboardLayout title="Launch Checklist"><div className="p-6">Loading...</div></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Launch Checklist">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Launch Checklist</h1>
            <p className="text-muted-foreground">Track production readiness tasks before going live</p>
          </div>
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Overall Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{completedCount} of {totalCount} tasks completed</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {categories.map(category => {
            const categoryItems = CHECKLIST_ITEMS.filter(item => item.category === category);
            const categoryCompleted = categoryItems.filter(item => checkedItems.has(item.id)).length;
            
            return (
              <Card key={category}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(category)}
                      <CardTitle>{category}</CardTitle>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {categoryCompleted}/{categoryItems.length} complete
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {categoryItems.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        checkedItems.has(item.id) 
                          ? 'bg-muted/50 border-muted' 
                          : 'bg-background border-border hover:bg-muted/30'
                      }`}
                    >
                      <Checkbox
                        id={item.id}
                        checked={checkedItems.has(item.id)}
                        onCheckedChange={() => toggleItem(item.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-1">
                        <label
                          htmlFor={item.id}
                          className={`font-medium cursor-pointer ${
                            checkedItems.has(item.id) ? 'line-through text-muted-foreground' : ''
                          }`}
                        >
                          {item.title}
                        </label>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      {getPriorityBadge(item.priority)}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
