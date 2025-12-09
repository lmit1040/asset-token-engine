import { useState, useEffect } from 'react';
import { Shield, CheckCircle2, XCircle, Clock, Search, ExternalLink, Coins, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReserveSummary {
  assetType: string;
  totalQuantity: number;
  unit: string;
  verifiedCount: number;
}

interface TokenBacking {
  tokenSymbol: string;
  tokenName: string;
  contractAddress: string | null;
  chain: string;
  network: string;
  assetType: string;
  backingQuantity: number;
  isVerified: boolean;
}

interface RecentAttestation {
  date: string;
  assetType: string;
  status: string;
}

interface ReserveData {
  summary: ReserveSummary[];
  tokenBacking: TokenBacking[];
  recentAttestations: RecentAttestation[];
  lastVerifiedAt: string | null;
  totalVerifiedAssets: number;
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  GOLDBACK: 'Goldback',
  SILVER: 'Silver',
  COPPER: 'Copper',
  GOLD_CERTIFICATE: 'Gold Certificate',
  SILVER_CERTIFICATE: 'Silver Certificate',
  OTHER: 'Other',
};

const ASSET_TYPE_COLORS: Record<string, string> = {
  GOLDBACK: 'bg-primary/15 text-primary',
  SILVER: 'bg-muted text-muted-foreground',
  COPPER: 'bg-orange-500/15 text-orange-400',
  GOLD_CERTIFICATE: 'bg-primary/15 text-primary',
  SILVER_CERTIFICATE: 'bg-muted text-muted-foreground',
  OTHER: 'bg-secondary text-secondary-foreground',
};

export default function ProofOfReservePage() {
  const [reserveData, setReserveData] = useState<ReserveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hashInput, setHashInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    message: string;
    assetType?: string;
    uploadedAt?: string;
  } | null>(null);

  useEffect(() => {
    fetchReserveData();
  }, []);

  const fetchReserveData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('public-reserve-data');
      
      if (error) throw error;
      setReserveData(data);
    } catch (error) {
      console.error('Error fetching reserve data:', error);
      toast.error('Failed to load reserve data');
    } finally {
      setLoading(false);
    }
  };

  const verifyHash = async () => {
    if (!hashInput.trim()) {
      toast.error('Please enter a hash to verify');
      return;
    }

    setVerifying(true);
    setVerificationResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('verify-reserve-hash', {
        body: { hash: hashInput.trim() }
      });

      if (error) throw error;
      setVerificationResult(data);
    } catch (error) {
      console.error('Error verifying hash:', error);
      setVerificationResult({
        verified: false,
        message: 'Verification service error'
      });
    } finally {
      setVerifying(false);
    }
  };

  const getExplorerUrl = (chain: string, address: string) => {
    if (chain === 'SOLANA') {
      return `https://solscan.io/token/${address}?cluster=devnet`;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading reserve data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg gold-gradient flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">MetallumX Vault</h1>
                <p className="text-xs text-muted-foreground">Proof of Reserve Verification</p>
              </div>
            </div>
            <a href="/auth" className="text-sm text-primary hover:text-primary/80 transition-colors">
              Sign In →
            </a>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 space-y-12">
        {/* Hero Section */}
        <section className="text-center space-y-4 max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold gold-text">Verify Our Reserves</h2>
          <p className="text-lg text-muted-foreground">
            Independently verify that all tokens are backed by real, audited physical assets. 
            Our proof-of-reserve system ensures complete transparency.
          </p>
        </section>

        {/* Summary Stats */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-success/15 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    {reserveData?.totalVerifiedAssets || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Verified Assets</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Coins className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    {reserveData?.tokenBacking?.length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Backed Tokens</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-accent/15 flex items-center justify-center">
                  <FileCheck className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    {reserveData?.lastVerifiedAt || 'N/A'}
                  </p>
                  <p className="text-sm text-muted-foreground">Last Verification</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Hash Verification Tool */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Document Hash Verification
            </CardTitle>
            <CardDescription>
              Verify that a document's SHA-256 hash matches our reserve records
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Input
                placeholder="Enter SHA-256 hash (64 hexadecimal characters)"
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                className="font-mono text-sm"
              />
              <Button 
                onClick={verifyHash} 
                disabled={verifying}
                className="gold-gradient text-primary-foreground"
              >
                {verifying ? 'Verifying...' : 'Verify'}
              </Button>
            </div>

            {verificationResult && (
              <div className={`p-4 rounded-lg flex items-start gap-3 ${
                verificationResult.verified 
                  ? 'bg-success/10 border border-success/30' 
                  : 'bg-destructive/10 border border-destructive/30'
              }`}>
                {verificationResult.verified ? (
                  <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className={`font-medium ${
                    verificationResult.verified ? 'text-success' : 'text-destructive'
                  }`}>
                    {verificationResult.verified ? 'Hash Verified' : 'Hash Not Found'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {verificationResult.message}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reserve Summary by Asset Type */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Reserve Summary by Category</CardTitle>
            <CardDescription>
              Aggregate holdings by asset type (individual vault details are confidential)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reserveData?.summary.map((item) => (
                <div 
                  key={item.assetType}
                  className="p-4 rounded-lg bg-secondary/50 border border-border/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge className={ASSET_TYPE_COLORS[item.assetType] || 'bg-secondary'}>
                      {ASSET_TYPE_LABELS[item.assetType] || item.assetType}
                    </Badge>
                    {item.verifiedCount > 0 && (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    )}
                  </div>
                  <p className="text-2xl font-bold text-foreground">
                    {item.totalQuantity.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{item.unit}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.verifiedCount} verified attestation{item.verifiedCount !== 1 ? 's' : ''}
                  </p>
                </div>
              ))}

              {(!reserveData?.summary || reserveData.summary.length === 0) && (
                <p className="text-muted-foreground col-span-full text-center py-8">
                  No reserve data available
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Token Backing Table */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Token Backing Verification</CardTitle>
            <CardDescription>
              On-chain tokens and their corresponding asset backing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Token</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead>Asset Type</TableHead>
                  <TableHead>Backing</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contract</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reserveData?.tokenBacking.map((token) => (
                  <TableRow key={token.tokenSymbol}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{token.tokenSymbol}</p>
                        <p className="text-xs text-muted-foreground">{token.tokenName}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {token.chain} {token.network !== 'NONE' && `(${token.network})`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={ASSET_TYPE_COLORS[token.assetType] || 'bg-secondary'}>
                        {ASSET_TYPE_LABELS[token.assetType] || token.assetType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {token.backingQuantity.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {token.isVerified ? (
                        <span className="flex items-center gap-1 text-success text-sm">
                          <CheckCircle2 className="h-4 w-4" />
                          Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground text-sm">
                          <Clock className="h-4 w-4" />
                          Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {token.contractAddress ? (
                        <a
                          href={getExplorerUrl(token.chain, token.contractAddress) || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:text-primary/80 text-sm font-mono"
                        >
                          {token.contractAddress.slice(0, 8)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not deployed</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {(!reserveData?.tokenBacking || reserveData.tokenBacking.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No tokens available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Attestation Timeline */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Verification Timeline</CardTitle>
            <CardDescription>
              Recent verification events (specific details are confidential)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reserveData?.recentAttestations.map((att, idx) => (
                <div 
                  key={idx}
                  className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 border border-border/30"
                >
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    att.status === 'ATTESTED' 
                      ? 'bg-success/15 text-success' 
                      : 'bg-warning/15 text-warning'
                  }`}>
                    {att.status === 'ATTESTED' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Clock className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {ASSET_TYPE_LABELS[att.assetType] || att.assetType} {att.status === 'ATTESTED' ? 'Verified' : 'Pending Verification'}
                    </p>
                    <p className="text-xs text-muted-foreground">{att.date}</p>
                  </div>
                </div>
              ))}

              {(!reserveData?.recentAttestations || reserveData.recentAttestations.length === 0) && (
                <p className="text-muted-foreground text-center py-8">
                  No recent attestations
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <section className="text-center text-sm text-muted-foreground border-t border-border pt-8">
          <p>
            MetallumX Vault maintains transparent proof-of-reserve records.
            Contact us for third-party auditor verification access.
          </p>
        </section>
      </main>
    </div>
  );
}
