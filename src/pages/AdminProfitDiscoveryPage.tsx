import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Search, Zap, ArrowRight, TrendingUp, TrendingDown, Loader2, RefreshCw, Target, Triangle, AlertTriangle, Gauge, Clock } from "lucide-react";

// Liquidity sources supported by 0x on Polygon
const POLYGON_SOURCES = [
  "Uniswap_V3",
  "QuickSwap",
  "QuickSwap_V3",
  "SushiSwap",
  "Curve",
  "Balancer_V2",
  "DODO_V2",
  "KyberSwap_Elastic",
];

type ScanMode = "SOURCE_MATRIX" | "TRIANGULAR";

// Scan speed presets
const SCAN_SPEED_PRESETS = [
  { value: 0, label: "Conservative", delayMs: 2000, batchPauseMs: 6000, batchSize: 2, description: "Slowest, avoids rate limits" },
  { value: 33, label: "Moderate", delayMs: 1200, batchPauseMs: 4000, batchSize: 3, description: "Balanced speed" },
  { value: 66, label: "Fast", delayMs: 600, batchPauseMs: 2000, batchSize: 4, description: "Faster but may hit limits" },
  { value: 100, label: "Aggressive", delayMs: 300, batchPauseMs: 1000, batchSize: 5, description: "Fastest, likely rate limited" },
];

interface ScanResult {
  mode: ScanMode;
  sourceA?: string;
  sourceB?: string;
  sourceC?: string;
  tokenPath: string[];
  notionalIn: string;
  notionalFormatted: string;
  expectedGrossProfit: string;
  grossProfitFormatted: string;
  expectedNetProfit: string;
  netProfitFormatted: string;
  profitBps: number;
  gasEstimate: string;
  slippageBuffer: string;
  status: "PROFITABLE" | "NOT_PROFITABLE" | "FAILED";
  reason?: string;
  leg1Quote?: { buyAmount: string; sources: string[] };
  leg2Quote?: { buyAmount: string; sources: string[] };
  leg3Quote?: { buyAmount: string; sources: string[] };
}

interface ScanProgress {
  current: number;
  total: number;
  currentCombination?: string;
  startTime: number;
}

export default function AdminProfitDiscoveryPage() {
  const { toast } = useToast();
  
  // Scan configuration
  const [mode, setMode] = useState<ScanMode>("SOURCE_MATRIX");
  const [tokenPair, setTokenPair] = useState("USDC_WETH");
  const [triangularPath, setTriangularPath] = useState("USDC_WETH_WMATIC");
  const [selectedSources, setSelectedSources] = useState<string[]>(["Uniswap_V3", "QuickSwap", "SushiSwap"]);
  const [notional, setNotional] = useState("1000");
  const [maxCombinations, setMaxCombinations] = useState("20");
  const [scanSpeed, setScanSpeed] = useState(33); // Default to moderate
  
  // Results state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scanStats, setScanStats] = useState<{
    totalScanned: number;
    profitable: number;
    notProfitable: number;
    failed: number;
    rateLimitCount: number;
    abortedDueToRateLimit: boolean;
    durationMs: number;
  } | null>(null);
  
  // Detail modal
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null);
  
  // Progress simulation interval ref
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const toggleSource = (source: string) => {
    setSelectedSources(prev => 
      prev.includes(source) 
        ? prev.filter(s => s !== source)
        : [...prev, source]
    );
  };

  // Get current speed preset
  const getCurrentSpeedPreset = () => {
    if (scanSpeed <= 16) return SCAN_SPEED_PRESETS[0];
    if (scanSpeed <= 50) return SCAN_SPEED_PRESETS[1];
    if (scanSpeed <= 83) return SCAN_SPEED_PRESETS[2];
    return SCAN_SPEED_PRESETS[3];
  };
  
  const currentPreset = getCurrentSpeedPreset();
  
  // Calculate estimated time based on combinations and speed
  const calculateEstimatedTime = () => {
    const numCombinations = Math.min(
      parseInt(maxCombinations) || 20,
      selectedSources.length * (selectedSources.length - 1)
    );
    const preset = getCurrentSpeedPreset();
    const legsPerCombination = mode === "TRIANGULAR" ? 3 : 2;
    const totalQuotes = numCombinations * legsPerCombination;
    const batches = Math.ceil(totalQuotes / preset.batchSize);
    const estimatedMs = (totalQuotes * preset.delayMs) + (batches * preset.batchPauseMs);
    return Math.ceil(estimatedMs / 1000);
  };
  
  // Calculate ETA based on progress
  const calculateEta = () => {
    if (!scanProgress || scanProgress.current === 0) return null;
    const elapsed = Date.now() - scanProgress.startTime;
    const avgTimePerItem = elapsed / scanProgress.current;
    const remaining = scanProgress.total - scanProgress.current;
    const etaMs = remaining * avgTimePerItem;
    return Math.ceil(etaMs / 1000);
  };
  
  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const runScan = async () => {
    if (selectedSources.length < 2) {
      toast({
        title: "Invalid Configuration",
        description: "Select at least 2 sources for cross-venue scanning",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    setResults([]);
    setScanStats(null);
    
    // Calculate total combinations for progress
    const numCombinations = Math.min(
      parseInt(maxCombinations) || 20,
      selectedSources.length * (selectedSources.length - 1)
    );
    
    // Initialize progress
    setScanProgress({
      current: 0,
      total: numCombinations,
      startTime: Date.now(),
    });
    
    // Start progress simulation (updates every second based on estimated speed)
    const preset = getCurrentSpeedPreset();
    const estimatedMsPerCombination = (preset.delayMs * 2) + (preset.batchPauseMs / preset.batchSize);
    
    progressIntervalRef.current = setInterval(() => {
      setScanProgress(prev => {
        if (!prev || prev.current >= prev.total) return prev;
        const elapsed = Date.now() - prev.startTime;
        const estimatedCurrent = Math.min(
          Math.floor(elapsed / estimatedMsPerCombination),
          prev.total - 1 // Keep at least 1 remaining until complete
        );
        return { ...prev, current: estimatedCurrent };
      });
    }, 500);

    try {
      const { data, error } = await supabase.functions.invoke("scan-polygon-profit-discovery", {
        body: {
          mode,
          tokenPair: mode === "SOURCE_MATRIX" ? tokenPair : undefined,
          triangularPath: mode === "TRIANGULAR" ? triangularPath : undefined,
          includedSources: selectedSources,
          notionalOverride: parseFloat(notional),
          maxCombinations: parseInt(maxCombinations),
          // Pass speed settings
          scanSpeed: {
            delayMs: preset.delayMs,
            batchPauseMs: preset.batchPauseMs,
            batchSize: preset.batchSize,
          },
        },
      });

      if (error) throw error;

      // Complete progress
      setScanProgress(prev => prev ? { ...prev, current: prev.total } : null);

      if (data.success) {
        setResults(data.topResults || []);
        setScanStats({
          totalScanned: data.totalScanned,
          profitable: data.profitable,
          notProfitable: data.notProfitable,
          failed: data.failed,
          rateLimitCount: data.rateLimitCount || 0,
          abortedDueToRateLimit: data.abortedDueToRateLimit || false,
          durationMs: data.durationMs,
        });

        toast({
          title: "Scan Complete",
          description: `Scanned ${data.totalScanned} combinations in ${(data.durationMs / 1000).toFixed(1)}s`,
        });
      } else {
        throw new Error(data.error || "Scan failed");
      }
    } catch (err: any) {
      console.error("Scan error:", err);
      toast({
        title: "Scan Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PROFITABLE":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Profitable</Badge>;
      case "NOT_PROFITABLE":
        return <Badge variant="secondary">Not Profitable</Badge>;
      case "FAILED":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatProfit = (profit: string, bps: number) => {
    const isPositive = !profit.startsWith("-") && profit !== "0";
    const color = isPositive ? "text-emerald-400" : "text-red-400";
    return (
      <div className={`flex items-center gap-1 ${color}`}>
        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        <span>{profit}</span>
        <span className="text-xs text-muted-foreground">({bps} bps)</span>
      </div>
    );
  };

  return (
    <DashboardLayout title="Profit Discovery" subtitle="Cross-venue arbitrage scanner with source constraints" requireAdmin>
      <div className="space-y-6">

        {/* Configuration */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Mode Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Scan Mode
              </CardTitle>
              <CardDescription>Choose scanning strategy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as ScanMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOURCE_MATRIX">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Source Matrix (A→B pairs)
                      </div>
                    </SelectItem>
                    <SelectItem value="TRIANGULAR">
                      <div className="flex items-center gap-2">
                        <Triangle className="h-4 w-4" />
                        Triangular (A→B→C)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode === "SOURCE_MATRIX" && (
                <div className="space-y-2">
                  <Label>Token Pair</Label>
                  <Select value={tokenPair} onValueChange={setTokenPair}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USDC_WETH">USDC ↔ WETH</SelectItem>
                      <SelectItem value="USDC_WMATIC">USDC ↔ WMATIC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {mode === "TRIANGULAR" && (
                <div className="space-y-2">
                  <Label>Path</Label>
                  <Select value={triangularPath} onValueChange={setTriangularPath}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USDC_WETH_WMATIC">USDC → WETH → WMATIC → USDC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Notional (USDC)</Label>
                  <Input
                    type="number"
                    value={notional}
                    onChange={(e) => setNotional(e.target.value)}
                    placeholder="1000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Combinations</Label>
                  <Input
                    type="number"
                    value={maxCombinations}
                    onChange={(e) => setMaxCombinations(e.target.value)}
                    placeholder="20"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Source Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Liquidity Sources</CardTitle>
              <CardDescription>Select DEXes for cross-venue scanning</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {POLYGON_SOURCES.map((source) => (
                  <label
                    key={source}
                    className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-accent cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedSources.includes(source)}
                      onCheckedChange={() => toggleSource(source)}
                    />
                    <span className="text-sm">{source.replace(/_/g, " ")}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Selected: {selectedSources.length} sources ({selectedSources.length * (selectedSources.length - 1)} possible combinations)
              </p>
            </CardContent>
          </Card>
        </div>
        
        {/* Scan Speed Control */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              Scan Speed
            </CardTitle>
            <CardDescription>
              Balance between speed and rate limit avoidance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{currentPreset.label}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Est. ~{calculateEstimatedTime()}s
                </span>
              </div>
              <Slider
                value={[scanSpeed]}
                onValueChange={(v) => setScanSpeed(v[0])}
                max={100}
                step={1}
                className="w-full"
                disabled={isScanning}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Conservative</span>
                <span>Aggressive</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
              {currentPreset.description} • {currentPreset.delayMs}ms delay • Batch of {currentPreset.batchSize}
            </p>
          </CardContent>
        </Card>

        {/* Run Scan Button & Progress */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Button
              size="lg"
              onClick={runScan}
              disabled={isScanning || selectedSources.length < 2}
              className="w-full"
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  Run {mode === "SOURCE_MATRIX" ? "Source Matrix" : "Triangular"} Scan
                </>
              )}
            </Button>
            
            {/* Progress Bar */}
            {scanProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Scanning combination {scanProgress.current + 1} of {scanProgress.total}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {calculateEta() !== null ? `~${calculateEta()}s remaining` : "Calculating..."}
                  </span>
                </div>
                <Progress 
                  value={(scanProgress.current / scanProgress.total) * 100} 
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{Math.round((scanProgress.current / scanProgress.total) * 100)}%</span>
                  <span>Elapsed: {Math.round((Date.now() - scanProgress.startTime) / 1000)}s</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Summary */}
        {scanStats && (
          <>
            {scanStats.abortedDueToRateLimit && (
              <Card className="border-amber-500/50 bg-amber-500/10">
                <CardContent className="pt-6 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                  <div>
                    <p className="font-medium text-amber-400">Scan aborted due to rate limiting</p>
                    <p className="text-sm text-muted-foreground">
                      The 0x API rate limit was reached. Try reducing sources or max combinations.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="grid gap-4 md:grid-cols-7">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{scanStats.totalScanned}</div>
                  <p className="text-xs text-muted-foreground">Total Scanned</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-emerald-400">{scanStats.profitable}</div>
                  <p className="text-xs text-muted-foreground">Profitable</p>
                </CardContent>
              </Card>
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-emerald-400">{scanStats.profitable}</div>
                  <p className="text-xs text-muted-foreground">Strategies Created</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-amber-400">{scanStats.notProfitable}</div>
                  <p className="text-xs text-muted-foreground">Not Profitable</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-red-400">{scanStats.failed}</div>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className={`text-2xl font-bold ${scanStats.rateLimitCount > 0 ? 'text-amber-400' : ''}`}>
                    {scanStats.rateLimitCount}
                  </div>
                  <p className="text-xs text-muted-foreground">Rate Limits</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{(scanStats.durationMs / 1000).toFixed(1)}s</div>
                  <p className="text-xs text-muted-foreground">Duration</p>
                </CardContent>
              </Card>
            </div>
            
            {/* Strategies Created Notice */}
            {scanStats.profitable > 0 && (
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="pt-6 flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                  <div>
                    <p className="font-medium text-emerald-400">
                      {scanStats.profitable} arbitrage {scanStats.profitable === 1 ? 'strategy' : 'strategies'} auto-created
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Created as disabled. Review and enable them in the Strategies page.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Results Table */}
        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Results</CardTitle>
              <CardDescription>Sorted by expected net profit</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead>Sources</TableHead>
                    <TableHead>Notional</TableHead>
                    <TableHead>Net Profit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          {result.tokenPath.map((token, i) => (
                            <span key={i} className="flex items-center">
                              {i > 0 && <ArrowRight className="h-3 w-3 mx-1 text-muted-foreground" />}
                              <span className="font-medium">{token}</span>
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          <div>
                            <span className="text-muted-foreground">L1:</span> {result.sourceA || "any"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">L2:</span> {result.sourceB || "any"}
                          </div>
                          {result.sourceC && (
                            <div>
                              <span className="text-muted-foreground">L3:</span> {result.sourceC}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{result.notionalFormatted}</TableCell>
                      <TableCell>
                        {formatProfit(result.netProfitFormatted, result.profitBps)}
                      </TableCell>
                      <TableCell>{getStatusBadge(result.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedResult(result)}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Detail Modal */}
        <Dialog open={!!selectedResult} onOpenChange={() => setSelectedResult(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Scan Result Details</DialogTitle>
              <DialogDescription>
                {selectedResult?.tokenPath.join(" → ")}
              </DialogDescription>
            </DialogHeader>
            {selectedResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Mode</Label>
                    <p className="font-medium">{selectedResult.mode}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <div>{getStatusBadge(selectedResult.status)}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Sources Used</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">L1: {selectedResult.sourceA || "any"}</Badge>
                    <Badge variant="outline">L2: {selectedResult.sourceB || "any"}</Badge>
                    {selectedResult.sourceC && (
                      <Badge variant="outline">L3: {selectedResult.sourceC}</Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Notional</Label>
                    <p className="font-medium">{selectedResult.notionalFormatted}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Gross Profit</Label>
                    <p className="font-medium">{selectedResult.grossProfitFormatted}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Net Profit</Label>
                    <p className="font-medium">{selectedResult.netProfitFormatted} ({selectedResult.profitBps} bps)</p>
                  </div>
                </div>

                {selectedResult.leg1Quote && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Leg 1 Quote</Label>
                    <div className="p-3 bg-muted rounded-md text-sm">
                      <p>Buy Amount: {selectedResult.leg1Quote.buyAmount}</p>
                      <p>Sources: {selectedResult.leg1Quote.sources.join(", ") || "N/A"}</p>
                    </div>
                  </div>
                )}

                {selectedResult.leg2Quote && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Leg 2 Quote</Label>
                    <div className="p-3 bg-muted rounded-md text-sm">
                      <p>Buy Amount: {selectedResult.leg2Quote.buyAmount}</p>
                      <p>Sources: {selectedResult.leg2Quote.sources.join(", ") || "N/A"}</p>
                    </div>
                  </div>
                )}

                {selectedResult.leg3Quote && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Leg 3 Quote</Label>
                    <div className="p-3 bg-muted rounded-md text-sm">
                      <p>Buy Amount: {selectedResult.leg3Quote.buyAmount}</p>
                      <p>Sources: {selectedResult.leg3Quote.sources.join(", ") || "N/A"}</p>
                    </div>
                  </div>
                )}

                {selectedResult.reason && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Notes/Reason</Label>
                    <p className="text-sm">{selectedResult.reason}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
