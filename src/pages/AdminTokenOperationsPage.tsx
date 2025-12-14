import { useState } from 'react';
import { Coins, RefreshCw, Send, ArrowRight, Info, CheckCircle2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import AssignTokensTab from '@/components/token-operations/AssignTokensTab';
import TransferTokensTab from '@/components/token-operations/TransferTokensTab';
import DeliverTokensTab from '@/components/token-operations/DeliverTokensTab';

const workflowSteps = [
  {
    id: 'assign',
    title: 'Assign',
    description: 'Create holdings in database',
    icon: Coins,
    detail: 'Admin assigns tokens from treasury to users. Tokens are recorded in the database but not yet on-chain.',
  },
  {
    id: 'transfer',
    title: 'Transfer',
    description: 'Move between users (DB)',
    icon: RefreshCw,
    detail: 'Admin moves tokens between users off-chain. Balances are updated in the database.',
  },
  {
    id: 'deliver',
    title: 'Deliver',
    description: 'Send to blockchain wallet',
    icon: Send,
    detail: 'Transfer actual tokens from treasury to user wallets on the blockchain. This is an on-chain transaction.',
  },
];

export default function AdminTokenOperationsPage() {
  const [activeTab, setActiveTab] = useState('assign');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  return (
    <DashboardLayout
      title="Token Operations"
      subtitle="Unified hub for token assignment, transfer, and on-chain delivery"
      requireAdmin
    >
      <div className="space-y-6 animate-fade-in">
        {/* Workflow Visualization */}
        <Card className="p-4 bg-card/50 border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Token Lifecycle</h3>
            <Collapsible open={isGuideOpen} onOpenChange={setIsGuideOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  {isGuideOpen ? 'Hide Guide' : 'How It Works'}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>

          {/* Visual Pipeline */}
          <div className="flex items-center justify-center gap-2 md:gap-4">
            {workflowSteps.map((step, index) => (
              <div key={step.id} className="flex items-center gap-2 md:gap-4">
                <button
                  onClick={() => setActiveTab(step.id)}
                  className={`flex flex-col items-center p-3 md:p-4 rounded-xl border-2 transition-all min-w-[80px] md:min-w-[120px] ${
                    activeTab === step.id
                      ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                      : 'border-border bg-muted/30 hover:border-muted-foreground/50'
                  }`}
                >
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center mb-2 ${
                      activeTab === step.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <step.icon className="h-5 w-5" />
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      activeTab === step.id ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {step.title}
                  </span>
                  <span className="text-[10px] md:text-xs text-muted-foreground text-center mt-0.5 hidden md:block">
                    {step.description}
                  </span>
                </button>
                {index < workflowSteps.length - 1 && (
                  <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}
          </div>

          {/* Collapsible Guide */}
          <Collapsible open={isGuideOpen} onOpenChange={setIsGuideOpen}>
            <CollapsibleContent>
              <div className="mt-4 pt-4 border-t border-border space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  {workflowSteps.map((step) => (
                    <div key={step.id} className="flex gap-3 p-3 rounded-lg bg-muted/30">
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-sm text-foreground">{step.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-sm text-amber-200">
                    <strong>Note:</strong> Only "Deliver" performs an actual blockchain transaction. Assign and Transfer
                    operations update database records only.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Tabs Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full max-w-md mx-auto">
            <TabsTrigger value="assign" className="gap-2">
              <Coins className="h-4 w-4" />
              <span className="hidden sm:inline">Assign</span>
            </TabsTrigger>
            <TabsTrigger value="transfer" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Transfer</span>
            </TabsTrigger>
            <TabsTrigger value="deliver" className="gap-2">
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Deliver</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assign">
            <AssignTokensTab />
          </TabsContent>

          <TabsContent value="transfer">
            <TransferTokensTab />
          </TabsContent>

          <TabsContent value="deliver">
            <DeliverTokensTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
