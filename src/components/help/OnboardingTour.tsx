import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TourStep {
  id: string;
  title: string;
  description: string;
  target?: string; // CSS selector for highlighting
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to MetallumX Vault! 🏆',
    description: 'This platform allows you to tokenize and manage precious metal assets on the blockchain. Let\'s take a quick tour of the main features.',
    position: 'center',
  },
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    description: 'Your dashboard shows your portfolio value, token holdings, and recent activity. Monitor your assets at a glance.',
    position: 'center',
  },
  {
    id: 'assets',
    title: 'Explore Assets',
    description: 'Browse all vault assets including gold, silver, and copper. Each asset is verified and can be tokenized.',
    position: 'center',
  },
  {
    id: 'tokens',
    title: 'Token Holdings',
    description: 'View your tokenized asset holdings. Tokens represent fractional ownership of physical precious metals.',
    position: 'center',
  },
  {
    id: 'submit',
    title: 'Submit Your Assets',
    description: 'Have precious metals to tokenize? Submit them for review and earn 10 MXG tokens as a reward!',
    position: 'center',
  },
  {
    id: 'governance',
    title: 'Participate in Governance',
    description: 'Hold MXG tokens to vote on proposals and shape the future of the platform. Earn rewards for active participation.',
    position: 'center',
  },
  {
    id: 'earn',
    title: 'Earn MXG Tokens',
    description: 'Stake tokens, refer friends, and complete activities to earn MXG governance tokens.',
    position: 'center',
  },
  {
    id: 'wallet',
    title: 'Connect Your Wallet',
    description: 'Link your Solana or EVM wallet to receive tokens on-chain. Manage your connected wallets in your profile.',
    position: 'center',
  },
  {
    id: 'complete',
    title: 'You\'re All Set! 🎉',
    description: 'Explore the platform and start your tokenized precious metals journey. Visit the FAQ or Help page if you have questions.',
    position: 'center',
  },
];

interface OnboardingTourProps {
  onComplete?: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenTour, setHasSeenTour] = useState(true);

  useEffect(() => {
    const seen = localStorage.getItem('metallumx-tour-completed');
    if (!seen) {
      setHasSeenTour(false);
      // Auto-show tour after a short delay for new users
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleComplete = useCallback(() => {
    localStorage.setItem('metallumx-tour-completed', 'true');
    setIsOpen(false);
    setHasSeenTour(true);
    onComplete?.();
  }, [onComplete]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const startTour = () => {
    setCurrentStep(0);
    setIsOpen(true);
  };

  const step = tourSteps[currentStep];

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={startTour}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        {hasSeenTour ? 'Replay Tour' : 'Start Tour'}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Tour Card */}
      <div 
        className={cn(
          "absolute glass-card p-6 w-full max-w-md shadow-xl border-primary/20",
          step.position === 'center' && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        )}
      >
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Progress indicator */}
        <div className="flex gap-1 mb-4">
          {tourSteps.map((_, index) => (
            <div
              key={index}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                index <= currentStep ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-foreground mb-2">
            {step.title}
          </h3>
          <p className="text-muted-foreground">
            {step.description}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-muted-foreground"
          >
            Skip tour
          </Button>

          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleNext}
              className="gold-gradient text-primary-foreground"
            >
              {currentStep === tourSteps.length - 1 ? 'Get Started' : 'Next'}
              {currentStep < tourSteps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Step {currentStep + 1} of {tourSteps.length}
        </p>
      </div>
    </div>
  );
}
