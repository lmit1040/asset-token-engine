import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  AlertDialog, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { 
  CreditCard, 
  TestTube, 
  AlertTriangle, 
  Loader2,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface StripeEnvironmentCardProps {
  isTestMode: boolean;
  onToggle: (testMode: boolean) => Promise<void>;
  isUpdating?: boolean;
  lastToggledAt?: string | null;
  lastToggledBy?: string | null;
}

const CONFIRMATION_PHRASE = 'I CONFIRM LIVE PAYMENTS';

export function StripeEnvironmentCard({ 
  isTestMode, 
  onToggle, 
  isUpdating,
  lastToggledAt,
  lastToggledBy
}: StripeEnvironmentCardProps) {
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [confirmStep, setConfirmStep] = useState(1);
  const [confirmationInput, setConfirmationInput] = useState('');

  const handleToggleAttempt = async (checked: boolean) => {
    if (!checked) {
      // Switching TO live mode requires confirmation
      setConfirmStep(1);
      setConfirmationInput('');
      setShowLiveConfirm(true);
    } else {
      // Switching to test mode is safe
      onToggle(true);
    }
  };

  const handleLiveConfirm = async () => {
    if (confirmStep === 1) {
      setConfirmStep(2);
    } else {
      if (confirmationInput !== CONFIRMATION_PHRASE) {
        toast.error('Confirmation phrase does not match');
        return;
      }
      setShowLiveConfirm(false);
      setConfirmStep(1);
      setConfirmationInput('');
      await onToggle(false); // false = not test mode = live mode
    }
  };

  const handleCancel = () => {
    setShowLiveConfirm(false);
    setConfirmStep(1);
    setConfirmationInput('');
  };

  const isLiveMode = !isTestMode;

  return (
    <>
      <Card className={`border-2 ${isLiveMode ? 'border-destructive bg-destructive/5' : 'border-amber-500 bg-amber-500/5'}`}>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isLiveMode ? (
                <div className="p-2 rounded-full bg-destructive/20">
                  <CreditCard className="h-6 w-6 text-destructive" />
                </div>
              ) : (
                <div className="p-2 rounded-full bg-amber-500/20">
                  <TestTube className="h-6 w-6 text-amber-500" />
                </div>
              )}
              <div>
                <CardTitle className="flex items-center gap-2">
                  Stripe Environment
                  <Badge 
                    variant={isLiveMode ? 'destructive' : 'outline'} 
                    className={isTestMode ? 'border-amber-500 text-amber-600 dark:text-amber-400' : ''}
                  >
                    {isLiveMode ? 'LIVE' : 'SANDBOX'}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {isLiveMode 
                    ? 'Processing real payments with real cards' 
                    : 'Using Stripe test mode for development'}
                </CardDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-end gap-1">
                <Label htmlFor="stripe-mode" className="text-sm font-medium">
                  {isTestMode ? 'Test Mode' : 'Live Mode'}
                </Label>
                <span className="text-xs text-muted-foreground">
                  {isTestMode ? 'sk_test_...' : 'sk_live_...'}
                </span>
              </div>
              <Switch
                id="stripe-mode"
                checked={isTestMode}
                onCheckedChange={handleToggleAttempt}
                disabled={isUpdating}
                className={isLiveMode ? 'data-[state=unchecked]:bg-destructive' : ''}
              />
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Mode indicators */}
          {isLiveMode ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="destructive">Real Payments</Badge>
              <Badge variant="destructive">Real Charges</Badge>
              <Badge variant="destructive">Live Webhooks</Badge>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                Test Cards Only
              </Badge>
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                No Real Charges
              </Badge>
              <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">
                Test Webhooks
              </Badge>
            </div>
          )}

          {/* Test card hint in sandbox mode */}
          {isTestMode && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
              <p className="font-medium flex items-center gap-2">
                <TestTube className="h-4 w-4" />
                Sandbox Test Cards
              </p>
              <p className="text-muted-foreground font-mono text-xs">
                4242 4242 4242 4242 — Successful payment
              </p>
              <p className="text-muted-foreground font-mono text-xs">
                4000 0000 0000 0002 — Card declined
              </p>
            </div>
          )}

          {/* Last toggled info */}
          {lastToggledAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                Last changed: {new Date(lastToggledAt).toLocaleString()}
                {lastToggledBy && ` by ${lastToggledBy}`}
              </span>
            </div>
          )}

          {/* Warning for live mode */}
          {isLiveMode && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Live mode is active. All payments will process real charges to customer cards.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Mode Confirmation Dialog */}
      <AlertDialog open={showLiveConfirm} onOpenChange={setShowLiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {confirmStep === 1 ? 'Enable Live Payments?' : 'Final Confirmation Required'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                {confirmStep === 1 ? (
                  <>
                    <p>
                      <strong>Warning:</strong> Enabling live mode will process real payments 
                      with real customer credit cards.
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>All checkout sessions will charge real money</li>
                      <li>Subscriptions will create real billing cycles</li>
                      <li>Refunds will return real money to customers</li>
                      <li>Stripe fees will be charged to your account</li>
                    </ul>
                    <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">
                        Make sure STRIPE_SECRET_KEY (sk_live_...) is configured
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-destructive">
                      Type the following phrase to confirm:
                    </p>
                    <p className="font-mono text-center p-2 bg-muted rounded">
                      {CONFIRMATION_PHRASE}
                    </p>
                    <Input
                      value={confirmationInput}
                      onChange={(e) => setConfirmationInput(e.target.value)}
                      placeholder="Type confirmation phrase..."
                      className="font-mono"
                    />
                    {confirmationInput && confirmationInput !== CONFIRMATION_PHRASE && (
                      <p className="text-sm text-destructive">Phrase does not match</p>
                    )}
                    {confirmationInput === CONFIRMATION_PHRASE && (
                      <p className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        Phrase confirmed
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
            <Button 
              variant="destructive" 
              onClick={handleLiveConfirm}
              disabled={confirmStep === 2 && confirmationInput !== CONFIRMATION_PHRASE}
            >
              {confirmStep === 1 ? 'Continue' : 'Enable Live Payments'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
