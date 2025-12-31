import { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { z } from 'zod';
import { FooterLegalText } from '@/components/layout/LegalDisclaimer';
import { supabase } from '@/integrations/supabase/client';
import MetallumXLogo from '@/assets/MetallumXLogo.png';
import { NDAModal, NDA_VERSION, NDA_CONTENT } from '@/components/auth/NDAModal';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().optional(),
  referralCode: z.string().optional(),
});

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

const passwordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type AuthMode = 'login' | 'signup' | 'forgot-password' | 'reset-password';

// Generate SHA-256 hash of signature data
async function generateSignatureHash(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const { signIn, signUp, user } = useAuth();
  
  // NDA state
  const [showNDA, setShowNDA] = useState(false);
  const [pendingSignup, setPendingSignup] = useState<{ email: string; password: string; name?: string } | null>(null);
  const [isRecordingNDA, setIsRecordingNDA] = useState(false);

  // Check if user came from password reset link
  useEffect(() => {
    const modeParam = searchParams.get('mode');
    if (modeParam === 'reset') {
      setMode('reset-password');
    }
  }, [searchParams]);

  if (user && mode !== 'reset-password') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleNDAAccept = async (signatureName: string) => {
    if (!pendingSignup) return;
    
    setIsRecordingNDA(true);
    
    try {
      // First, create the account
      const { error: signupError } = await signUp(
        pendingSignup.email, 
        pendingSignup.password, 
        pendingSignup.name
      );
      
      if (signupError) {
        if (signupError.message?.includes('already registered')) {
          toast.error('This email is already registered. Try signing in instead.');
        } else {
          toast.error(signupError.message || 'Failed to create account');
        }
        setIsRecordingNDA(false);
        return;
      }

      // Get the session to record NDA
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        toast.error('Failed to get session after signup');
        setIsRecordingNDA(false);
        return;
      }

      const userId = sessionData.session.user.id;
      const signedAt = new Date().toISOString();
      
      // Generate signature hash
      const signatureData = `${signatureName}|${pendingSignup.email}|${NDA_VERSION}|${signedAt}|${NDA_CONTENT}`;
      const signatureHash = await generateSignatureHash(signatureData);

      // Record NDA signature via edge function
      const { data: ndaResult, error: ndaError } = await supabase.functions.invoke('record-nda-signature', {
        body: {
          userId,
          signerName: signatureName,
          signerEmail: pendingSignup.email,
          ndaVersion: NDA_VERSION,
          signatureHash,
          userAgent: navigator.userAgent,
        }
      });

      if (ndaError) {
        console.error('NDA recording error:', ndaError);
        toast.error('Account created, but NDA recording failed. Please contact support.');
      } else if (ndaResult?.blockchainTxSignature) {
        toast.success(
          <div>
            <p>Account created successfully!</p>
            <p className="text-xs mt-1">NDA recorded on Solana blockchain</p>
          </div>
        );
      } else {
        toast.success('Account created successfully!');
      }

      // Process referral if code was provided
      if (referralCode.trim()) {
        try {
          await supabase.functions.invoke('process-referral', {
            body: {
              referralCode: referralCode.trim(),
              referredUserId: userId,
            }
          });
        } catch (refError) {
          console.error('Referral processing error:', refError);
        }
      }

      setShowNDA(false);
      setPendingSignup(null);
      setReferralCode('');
      
    } catch (error) {
      console.error('Signup error:', error);
      toast.error('Failed to complete signup');
    } finally {
      setIsRecordingNDA(false);
    }
  };

  const handleNDACancel = () => {
    setShowNDA(false);
    setPendingSignup(null);
    toast.info('Signup cancelled. You must agree to the NDA to create an account.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'reset-password') {
        const validated = passwordSchema.parse({ password, confirmPassword });
        const { error } = await supabase.auth.updateUser({
          password: validated.password,
        });
        if (error) {
          toast.error(error.message || 'Failed to reset password');
        } else {
          toast.success('Password updated successfully!');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        }
      } else if (mode === 'forgot-password') {
        const validated = emailSchema.parse({ email });
        const { error } = await supabase.auth.resetPasswordForEmail(validated.email, {
          redirectTo: `${window.location.origin}/auth?mode=reset`,
        });
        if (error) {
          toast.error(error.message || 'Failed to send reset email');
        } else {
          toast.success('Password reset email sent! Check your inbox.');
          setMode('login');
        }
      } else if (mode === 'login') {
        const validated = authSchema.parse({ email, password });
        const { error } = await signIn(validated.email, validated.password);
        if (error) {
          toast.error(error.message || 'Failed to sign in');
        } else {
          toast.success('Welcome back!');
        }
      } else {
        // Signup - show NDA first
        const validated = authSchema.parse({ email, password, name });
        setPendingSignup({ email: validated.email, password: validated.password, name: validated.name });
        setShowNDA(true);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'reset-password': return 'Set New Password';
      case 'forgot-password': return 'Reset Password';
      case 'signup': return 'Create Account';
      default: return 'Welcome Back';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'reset-password': return 'Enter your new password below';
      case 'forgot-password': return 'Enter your email to receive a reset link';
      case 'signup': return 'Start managing your precious assets';
      default: return 'Sign in to access your vault';
    }
  };

  const getButtonText = () => {
    switch (mode) {
      case 'reset-password': return 'Update Password';
      case 'forgot-password': return 'Send Reset Link';
      case 'signup': return 'Continue';
      default: return 'Sign In';
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-4 mb-8">
            <img src={MetallumXLogo} alt="MetallumX" className="h-44 w-auto" />
          </div>
          
          <h2 className="text-4xl font-bold text-foreground mb-6 leading-tight">
            Tokenize Your<br />
            <span className="gold-text">Precious Assets</span>
          </h2>
          
          <p className="text-lg text-muted-foreground max-w-md mb-8">
            A secure platform for managing and tokenizing precious metals, 
            Goldbacks, and historic currency with verifiable proof of reserves.
          </p>

          <div className="space-y-4">
            {[
              'Multi-asset tokenization support',
              'SHA-256 proof of reserve verification',
              'Fractional ownership models',
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-accent/5 rounded-full blur-3xl" />
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <img src={MetallumXLogo} alt="MetallumX" className="h-32 w-auto" />
          </div>

          <div className="glass-card p-8">
            {(mode === 'forgot-password' || mode === 'reset-password') && (
              <button
                type="button"
                onClick={() => setMode('login')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            )}

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">
                {getTitle()}
              </h2>
              <p className="text-muted-foreground mt-2">
                {getSubtitle()}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'signup' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm text-muted-foreground">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="John Doe"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-10 input-dark"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="referralCode" className="text-sm text-muted-foreground">
                      Referral Code <span className="text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="referralCode"
                      type="text"
                      placeholder="Enter referral code"
                      value={referralCode}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      className="input-dark"
                    />
                  </div>
                </>
              )}

              {mode !== 'reset-password' && (
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm text-muted-foreground">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 input-dark"
                      required
                    />
                  </div>
                </div>
              )}

              {mode !== 'forgot-password' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm text-muted-foreground">
                      {mode === 'reset-password' ? 'New Password' : 'Password'}
                    </Label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => setMode('forgot-password')}
                        className="text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 input-dark"
                      required
                    />
                  </div>
                </div>
              )}

              {mode === 'reset-password' && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 input-dark"
                      required
                    />
                  </div>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full" 
                size="lg"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {getButtonText()}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            {mode !== 'forgot-password' && mode !== 'reset-password' && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {mode === 'login' 
                    ? "Don't have an account? Sign up" 
                    : 'Already have an account? Sign in'}
                </button>
              </div>
            )}

            {(mode === 'signup' || mode === 'reset-password') && (
              <p className="mt-4 text-xs text-muted-foreground text-center">
                Password must be 8+ characters with uppercase, lowercase, and number.
              </p>
            )}
          </div>

          {/* Legal footer */}
          <div className="mt-8">
            <FooterLegalText />
          </div>
        </div>
      </div>

      {/* NDA Modal */}
      <NDAModal
        open={showNDA}
        onAccept={handleNDAAccept}
        onCancel={handleNDACancel}
        userName={pendingSignup?.name || name}
        userEmail={pendingSignup?.email || email}
        isSubmitting={isRecordingNDA}
      />
    </div>
  );
}
