import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Bug, Play, AlertTriangle, CheckCircle } from "lucide-react";

interface QuoteResult {
  success: boolean;
  leg: string;
  quote: any;
  error: string | null;
  errorCode: number | null;
  requestParams: Record<string, string>;
  retryAttempts: number;
  usedRelaxedConstraints: boolean;
  rawResponse?: string;
}

const POLYGON_TOKENS = {
  USDC: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
  WMATIC: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
  WETH: { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
};

export function QuoteDebugTool() {
  const [sellToken, setSellToken] = useState("USDC");
  const [buyToken, setBuyToken] = useState("WMATIC");
  const [sellAmount, setSellAmount] = useState("25000000000"); // 25k USDC
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuoteResult | null>(null);

  const runQuote = async (leg: string) => {
    setLoading(true);
    setResult(null);
    try {
      const sell = leg === "1" ? sellToken : buyToken;
      const buy = leg === "1" ? buyToken : sellToken;
      const amount = leg === "1" ? sellAmount : result?.quote?.buyAmount || sellAmount;

      const { data, error } = await supabase.functions.invoke("debug-quote", {
        body: {
          network: "POLYGON",
          sellToken: POLYGON_TOKENS[sell as keyof typeof POLYGON_TOKENS]?.address || sell,
          buyToken: POLYGON_TOKENS[buy as keyof typeof POLYGON_TOKENS]?.address || buy,
          sellAmount: amount,
          leg,
        },
      });

      if (error) throw error;
      setResult(data);
    } catch (e) {
      setResult({ success: false, leg, quote: null, error: String(e), errorCode: 0, requestParams: {}, retryAttempts: 0, usedRelaxedConstraints: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          Quote Debug Tool
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Sell Token</Label>
            <Select value={sellToken} onValueChange={setSellToken}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USDC">USDC</SelectItem>
                <SelectItem value="WMATIC">WMATIC</SelectItem>
                <SelectItem value="WETH">WETH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Buy Token</Label>
            <Select value={buyToken} onValueChange={setBuyToken}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USDC">USDC</SelectItem>
                <SelectItem value="WMATIC">WMATIC</SelectItem>
                <SelectItem value="WETH">WETH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sell Amount (base units)</Label>
            <Input value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => runQuote("1")} disabled={loading} variant="outline">
            <Play className="h-4 w-4 mr-1" /> Quote Leg 1
          </Button>
          <Button onClick={() => runQuote("2")} disabled={loading || !result?.quote} variant="outline">
            <Play className="h-4 w-4 mr-1" /> Quote Leg 2 (uses Leg1 output)
          </Button>
        </div>

        {result && (
          <div className="mt-4 p-3 bg-muted rounded-lg space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              )}
              <span className="font-medium">Leg {result.leg}: {result.success ? "Success" : "Failed"}</span>
              {result.usedRelaxedConstraints && <Badge variant="secondary">Relaxed</Badge>}
              <Badge variant="outline">Retries: {result.retryAttempts}</Badge>
            </div>
            
            {result.error && <div className="text-destructive">Error: {result.error}</div>}
            {result.errorCode && <div className="text-muted-foreground">HTTP {result.errorCode}</div>}
            
            {result.quote && (
              <pre className="text-xs bg-background p-2 rounded overflow-auto max-h-48">
                {JSON.stringify(result.quote, null, 2)}
              </pre>
            )}
            
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Request Params</summary>
              <pre className="mt-1 p-2 bg-background rounded">{JSON.stringify(result.requestParams, null, 2)}</pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
