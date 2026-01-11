import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FeeScheduleTable } from '@/components/fees/FeeScheduleTable';
import { PricingTier, TIER_LABELS, MXU_DISCOUNT_ELIGIBLE_TYPES, FEE_TYPE_LABELS } from '@/types/fees';
import { DollarSign, Award, HelpCircle, User, Building, Building2 } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from "@/integrations/supabase/client";

const TIER_ICONS: Record<PricingTier, React.ReactNode> = {
  RETAIL: <User className="h-4 w-4" />,
  TRUST: <Building className="h-4 w-4" />,
  ENTERPRISE: <Building2 className="h-4 w-4" />,
};

const TIER_DESCRIPTIONS: Record<PricingTier, string> = {
  RETAIL: 'Pay-per-use pricing for individual collectors, preppers, and small-scale asset owners.',
  TRUST: 'Comprehensive solutions for trusts, LLCs, and family offices with volume-based pricing.',
  ENTERPRISE: 'Custom enterprise solutions with dedicated support and tailored pricing.',
};
async function runStripeTestCharge() {
  const { data, error } = await supabase.functions.invoke(
    "create-checkout-session",
    {
      body: {
        fee_id: "8f881d7d-4f1d-468b-a28b-953b6e40f7f3",
        purpose: "TEST_PAYMENT",
        quantity: 1
      }
    }
  );

  if (error) {
    console.error("Stripe test error:", error);
    alert("Stripe error — check console");
    return;
  }

  window.location.href = data.checkout_url;
}

export default function FeesPage() {
  const [selectedTier, setSelectedTier] = useState<PricingTier>('RETAIL');

  return (
    <DashboardLayout title="Fee Schedule">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Fee Schedule</h1>
            <p className="text-muted-foreground mt-1">
              Transparent, flat-rate pricing for all MetallumX services. No hidden fees or percentage-based charges.
            </p>
          </div>
        </div>

        {/* Tier Tabs */}
        <Tabs value={selectedTier} onValueChange={(v) => setSelectedTier(v as PricingTier)}>
          <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
            {(['RETAIL', 'TRUST', 'ENTERPRISE'] as PricingTier[]).map((tier) => (
              <TabsTrigger key={tier} value={tier} className="flex items-center gap-2">
                {TIER_ICONS[tier]}
                {TIER_LABELS[tier]}
              </TabsTrigger>
            ))}
          </TabsList>

          {(['RETAIL', 'TRUST', 'ENTERPRISE'] as PricingTier[]).map((tier) => (
            <TabsContent key={tier} value={tier} className="mt-6">
              <Card className="mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    {TIER_ICONS[tier]}
                    {TIER_LABELS[tier]} Pricing
                  </CardTitle>
                  <CardDescription>{TIER_DESCRIPTIONS[tier]}</CardDescription>
                </CardHeader>
              </Card>
              
              <FeeScheduleTable tier={tier} showMxuEligibility={tier !== 'ENTERPRISE'} />
            </TabsContent>
          ))}
        </Tabs>

        {/* MXU Discount Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              MXU Holder Discounts
            </CardTitle>
            <CardDescription>
              Hold MXU tokens to unlock fee discounts on eligible transactions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-amber-600/30 bg-amber-700/10 p-4">
                <p className="text-sm font-semibold text-amber-600">Bronze</p>
                <p className="text-2xl font-bold text-foreground">5%</p>
                <p className="text-xs text-muted-foreground">100+ MXU</p>
              </div>
              <div className="rounded-lg border border-slate-400/30 bg-slate-400/10 p-4">
                <p className="text-sm font-semibold text-slate-500">Silver</p>
                <p className="text-2xl font-bold text-foreground">10%</p>
                <p className="text-xs text-muted-foreground">500+ MXU</p>
              </div>
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                <p className="text-sm font-semibold text-yellow-600">Gold</p>
                <p className="text-2xl font-bold text-foreground">15%</p>
                <p className="text-xs text-muted-foreground">1,000+ MXU</p>
              </div>
              <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-4">
                <p className="text-sm font-semibold text-violet-500">Platinum</p>
                <p className="text-2xl font-bold text-foreground">20%</p>
                <p className="text-xs text-muted-foreground">5,000+ MXU</p>
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm font-medium text-foreground mb-2">Discount-Eligible Fee Types:</p>
              <div className="flex flex-wrap gap-2">
                {MXU_DISCOUNT_ELIGIBLE_TYPES.map((type) => (
                  <span 
                    key={type} 
                    className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                  >
                    {FEE_TYPE_LABELS[type]}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Note: MXU discounts do not apply to recurring fees (Monthly, Annual).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Frequently Asked Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger>Are there any hidden fees or percentage-based charges?</AccordionTrigger>
                <AccordionContent>
                  No. All MetallumX fees are flat-rate and clearly listed on this page. We do not charge 
                  percentage-based fees, trading fees, or any hidden costs. What you see is what you pay.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>How do MXU discounts work?</AccordionTrigger>
                <AccordionContent>
                  MXU discounts are automatically applied when you hold MXU tokens in your wallet. The discount 
                  tier is determined by your MXU balance. Discounts apply to one-time, per-execution, and 
                  per-transaction fees only.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>What's the difference between fee types?</AccordionTrigger>
                <AccordionContent>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li><strong>One-Time:</strong> Paid once when the action is performed (e.g., asset submission)</li>
                    <li><strong>Per Transaction:</strong> Paid for each individual transaction (e.g., token transfer)</li>
                    <li><strong>Per Execution:</strong> Paid each time a service is executed (e.g., attestation)</li>
                    <li><strong>Monthly:</strong> Recurring monthly fee for ongoing services</li>
                    <li><strong>Annual:</strong> Recurring annual fee for yearly subscriptions</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4">
                <AccordionTrigger>Can I upgrade my pricing tier?</AccordionTrigger>
                <AccordionContent>
                  Yes! You can upgrade from Retail to Trust tier at any time. Enterprise tier requires a 
                  custom contract. Contact our team for more information about tier upgrades.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-5">
                <AccordionTrigger>How are payments processed?</AccordionTrigger>
                <AccordionContent>
                  Payments are processed securely through Stripe. We accept all major credit cards. 
                  Enterprise clients can arrange invoice-based billing.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
       <Button
  onClick={runStripeTestCharge}
  style={{
    marginTop: "2rem",
    padding: "12px 18px",
    backgroundColor: "#635bff",
    color: "#fff",
    borderRadius: "6px",
    fontWeight: "600"
  }}
>
  🔒 Stripe $1 Test Charge
</Button>
    </DashboardLayout>
  );
}
