import { HelpCircle, BookOpen, MessageCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { FAQAccordion } from '@/components/help/FAQAccordion';
import { OnboardingTour } from '@/components/help/OnboardingTour';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function FAQPage() {
  const navigate = useNavigate();

  return (
    <DashboardLayout
      title="Frequently Asked Questions"
      subtitle="Find answers to common questions about MetallumX Vault"
    >
      <div className="space-y-8 animate-fade-in">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-6 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <HelpCircle className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Take the Tour</h3>
            <p className="text-sm text-muted-foreground mb-4">
              New to MetallumX? Take a guided tour of the platform.
            </p>
            <OnboardingTour />
          </div>

          <div className="glass-card p-6 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Documentation</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Download the complete user guide for offline reference.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/help/documentation')}
            >
              View Documentation
            </Button>
          </div>

          <div className="glass-card p-6 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <MessageCircle className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Contact Support</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Can't find what you're looking for? Reach out to our team.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = 'mailto:support@metallumx.io'}
            >
              Email Support
            </Button>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="glass-card p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">Search FAQs</h2>
            <p className="text-sm text-muted-foreground">
              Browse or search through our frequently asked questions
            </p>
          </div>
          <FAQAccordion />
        </div>
      </div>
    </DashboardLayout>
  );
}
