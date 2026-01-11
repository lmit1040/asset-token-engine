import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";

type PaymentStatus = "pending" | "paid" | "failed" | "refunded" | "canceled" | string;

const PaymentSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [purpose, setPurpose] = useState<string>("");
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>("usd");
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    if (loading) return "Verifying Payment";
    if (status === "paid") return "Payment Successful";
    if (status === "pending") return "Payment Pending";
    return "Payment Not Confirmed";
  }, [loading, status]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);

        if (!sessionId) {
          setStatus("failed");
          setError("Missing session_id in URL.");
          return;
        }

        // Poll a few times because webhook may land a moment after redirect.
        const maxAttempts = 8;
        const delayMs = 1200;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const { data, error: dbErr } = await supabase
            .from("payments")
            .select("status, purpose, amount_cents, currency, metadata")
            .eq("stripe_checkout_session_id", sessionId)
            .maybeSingle();

          if (dbErr) {
            throw dbErr;
          }

          if (data?.status) {
            if (cancelled) return;
            setStatus(data.status);
            setPurpose(data.purpose ?? "");
            setAmount(typeof data.amount_cents === "number" ? data.amount_cents : null);
            setCurrency((data.currency ?? "usd").toLowerCase());

            // Stop early if paid
            if (data.status === "paid") break;
          }

          // wait before next poll
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Verification failed.");
        setStatus("failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const amountDisplay =
    amount == null ? null : `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;

  return (
    <DashboardLayout title={title}>
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            {loading ? (
              <div className="flex justify-center mb-4">
                <Loader2 className="h-16 w-16 text-primary animate-spin" />
              </div>
            ) : status === "paid" ? (
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-16 w-16 text-green-600" />
              </div>
            ) : (
              <div className="flex justify-center mb-4">
                <XCircle className="h-16 w-16 text-red-600" />
              </div>
            )}

            <CardTitle className="text-2xl">
              {loading ? "Verifying..." : status === "paid" ? "Payment Confirmed" : "Not Confirmed Yet"}
            </CardTitle>

            <CardDescription>
              {loading
                ? "Please wait while we verify your payment."
                : status === "paid"
                ? "Your payment has been recorded and your action is unlocked."
                : "Your payment has not been confirmed yet. If you just paid, refresh in a moment."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm text-red-600">
                {error}
              </div>
            )}

            {!loading && (
              <div className="text-sm text-muted-foreground space-y-1">
                {purpose && <div><span className="font-medium">Purpose:</span> {purpose}</div>}
                {amountDisplay && <div><span className="font-medium">Amount:</span> {amountDisplay}</div>}
                {sessionId && <div className="break-all"><span className="font-medium">Session:</span> {sessionId}</div>}
                <div><span className="font-medium">Status:</span> {String(status)}</div>
              </div>
            )}

            <div className="flex gap-2 justify-center">
              <Button asChild variant="outline">
                <Link to="/dashboard">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Link>
              </Button>

              <Button asChild>
                <Link to="/fees">View Fees</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default PaymentSuccessPage;
