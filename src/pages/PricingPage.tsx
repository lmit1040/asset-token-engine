import { useEffect, useState } from "react";
import { Check, Building2, Users, Briefcase, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface PricingTier {
  key: string;
  name: string;
  description: string;
  annualPrice: string;
  icon: React.ReactNode;
  features: string[];
  cta: string;
  isEnterprise?: boolean;
  popular?: boolean;
}

const tiers: PricingTier[] = [
  {
    key: "RETAIL",
    name: "Individual / Retail",
    description: "Perfect for individual investors looking to tokenize personal precious metal holdings.",
    annualPrice: "Free",
    icon: <Users className="h-8 w-8" />,
    features: [
      "Personal asset tokenization",
      "Standard transaction fees",
      "Community support",
      "Basic reporting",
      "Mobile access",
    ],
    cta: "Get Started",
  },
  {
    key: "TRUST",
    name: "Trust / LLC / Family Office",
    description: "Designed for trusts, LLCs, and family offices managing diversified metal portfolios.",
    annualPrice: "$1,000",
    icon: <Building2 className="h-8 w-8" />,
    features: [
      "Everything in Retail",
      "Multi-user access",
      "Reduced transaction fees",
      "Priority support",
      "Advanced reporting & analytics",
      "Custom token definitions",
      "Dedicated account manager",
    ],
    cta: "Upgrade to Trust",
    popular: true,
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise / Institutional",
    description: "Full-service solution for institutions requiring custom contracts and dedicated support.",
    annualPrice: "Custom",
    icon: <Briefcase className="h-8 w-8" />,
    features: [
      "Everything in Trust",
      "Custom contract terms",
      "White-glove onboarding",
      "SLA guarantees",
      "API access",
      "Custom integrations",
      "Compliance & audit support",
      "Invoice-based billing",
    ],
    cta: "Contact Sales",
    isEnterprise: true,
  },
];

export default function PricingPage() {
  const { user } = useAuth();
  const [userTier, setUserTier] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserTier = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('pricing_tier')
        .eq('id', user.id)
        .single();
      setUserTier(data?.pricing_tier || 'RETAIL');
    };
    fetchUserTier();
  }, [user]);

  const handleCtaClick = (tier: PricingTier) => {
    if (tier.isEnterprise) {
      window.location.href = "mailto:sales@metallumx.com?subject=Enterprise%20Inquiry";
    } else if (tier.key === "RETAIL") {
      window.location.href = "/auth";
    } else if (tier.key === "TRUST") {
      window.location.href = "/trust-dashboard";
    } else {
      window.location.href = "mailto:sales@metallumx.com?subject=Trust%20Tier%20Upgrade";
    }
  };

  const isCurrentTier = (tierKey: string) => userTier === tierKey;

  return (
    <DashboardLayout title="Pricing">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Whether you're an individual investor or a large institution, we have the right solution for your precious metals tokenization needs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {tiers.map((tier) => (
            <Card 
              key={tier.key} 
              className={`relative flex flex-col ${tier.popular ? 'border-primary shadow-lg scale-105' : ''} ${isCurrentTier(tier.key) ? 'ring-2 ring-primary' : ''}`}
            >
              {tier.popular && !isCurrentTier(tier.key) && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              {isCurrentTier(tier.key) && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500">
                  Your Plan
                </Badge>
              )}
              {isCurrentTier("ENTERPRISE") && tier.key === "ENTERPRISE" && (
                <Badge className="absolute -top-3 right-4 bg-gradient-to-r from-purple-500/80 to-blue-500/80">
                  <FileCheck className="h-3 w-3 mr-1" />
                  Under Contract
                </Badge>
              )}
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10 text-primary w-fit">
                  {tier.icon}
                </div>
                <CardTitle className="text-2xl">{tier.name}</CardTitle>
                <CardDescription className="text-sm min-h-[48px]">
                  {tier.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="text-center mb-6">
                  <span className="text-4xl font-bold">{tier.annualPrice}</span>
                  {tier.annualPrice !== "Free" && tier.annualPrice !== "Custom" && (
                    <span className="text-muted-foreground">/year</span>
                  )}
                </div>
                <ul className="space-y-3">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {isCurrentTier(tier.key) ? (
                  <Button className="w-full" variant="outline" disabled>
                    Current Plan
                  </Button>
                ) : isCurrentTier("ENTERPRISE") ? (
                  <Button className="w-full" variant="outline" disabled>
                    Contact Account Manager
                  </Button>
                ) : (
                  <Button 
                    className="w-full" 
                    variant={tier.popular ? "default" : "outline"}
                    onClick={() => handleCtaClick(tier)}
                  >
                    {tier.cta}
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="mt-16 text-center">
          <h2 className="text-2xl font-semibold mb-4">Need a Custom Solution?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Our Enterprise tier offers fully customized pricing and features tailored to your institution's specific requirements.
          </p>
          <Button variant="outline" size="lg" asChild>
            <a href="mailto:sales@metallumx.com?subject=Custom%20Enterprise%20Solution">
              Talk to Our Team
            </a>
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
