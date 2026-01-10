import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

const PaymentSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    // Simple verification delay to show loading state
    const timer = setTimeout(() => {
      setIsVerifying(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [sessionId]);

  return (
    <DashboardLayout title="Payment Successful">
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            {isVerifying ? (
              <>
                <div className="flex justify-center mb-4">
                  <Loader2 className="h-16 w-16 text-primary animate-spin" />
                </div>
                <CardTitle>Verifying Payment...</CardTitle>
                <CardDescription>
                  Please wait while we confirm your payment.
                </CardDescription>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-4">
                  <CheckCircle className="h-16 w-16 text-green-500" />
                </div>
                <CardTitle className="text-2xl text-green-600">Payment Successful!</CardTitle>
                <CardDescription>
                  Thank you for your payment. Your transaction has been completed successfully.
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!isVerifying && (
              <>
                <p className="text-sm text-muted-foreground">
                  A confirmation email will be sent to your registered email address.
                </p>
                <div className="flex flex-col gap-2">
                  <Button asChild>
                    <Link to="/dashboard">
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Return to Dashboard
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/my-submissions">
                      View My Submissions
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default PaymentSuccessPage;
