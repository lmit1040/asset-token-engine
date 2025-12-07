import { useState } from 'react';
import { Globe, CheckCircle, XCircle, Rocket, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWallet } from '@/hooks/useWallet';
import { 
  TokenDefinition, 
  TOKEN_MODEL_LABELS, 
  BLOCKCHAIN_CHAIN_LABELS, 
  BlockchainChain,
  NETWORK_TYPE_LABELS,
  NetworkType,
  DeploymentStatus 
} from '@/types/database';

interface TokenDetailCardProps {
  token: TokenDefinition;
  isAdmin: boolean;
  onUpdate: () => void;
}

export function TokenDetailCard({ token, isAdmin, onUpdate }: TokenDetailCardProps) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [selectedChain, setSelectedChain] = useState<BlockchainChain>((token.chain as BlockchainChain) || 'NONE');
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkType>((token.network as NetworkType) || 'NONE');
  const { solanaAddress, connectPhantom, isConnectingSolana } = useWallet();

  const deploymentStatus = token.deployment_status as DeploymentStatus;
  const canDeploy = selectedChain !== 'NONE' && selectedNetwork !== 'NONE' && deploymentStatus === 'NOT_DEPLOYED';
  const isDeployed = deploymentStatus === 'DEPLOYED';
  const isPending = deploymentStatus === 'PENDING';
  const isSolanaTestnet = selectedChain === 'SOLANA' && selectedNetwork === 'TESTNET';

  const generateMockContractAddress = () => {
    const chars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
  };

  const handleSaveConfig = async () => {
    try {
      const { error } = await supabase
        .from('token_definitions')
        .update({
          chain: selectedChain,
          network: selectedNetwork,
        })
        .eq('id', token.id);

      if (error) throw error;
      toast.success('Blockchain configuration saved');
      onUpdate();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save configuration';
      toast.error(message);
    }
  };

  const deploySolanaToken = async () => {
    // Ensure Phantom is connected
    if (!solanaAddress) {
      toast.info('Please connect your Phantom wallet first');
      await connectPhantom();
      return;
    }

    // Check if Phantom is available for getting public key
    if (!window.solana?.isPhantom) {
      toast.error('Phantom wallet not found. Please install Phantom.');
      window.open('https://phantom.app/', '_blank');
      return;
    }

    setIsDeploying(true);
    try {
      // Set to PENDING first
      const { error: pendingError } = await supabase
        .from('token_definitions')
        .update({
          chain: selectedChain,
          network: selectedNetwork,
          deployment_status: 'PENDING',
        })
        .eq('id', token.id);

      if (pendingError) throw pendingError;
      
      toast.info('Deploying SPL token to Solana Devnet...');
      onUpdate();

      // Get the public key from Phantom
      const response = await window.solana.connect();
      const adminPublicKey = response.publicKey.toString();

      // Call the edge function to deploy the token
      const { data, error } = await supabase.functions.invoke('deploy-solana-token', {
        body: {
          tokenDefinitionId: token.id,
          adminPublicKey,
        },
      });

      if (error) {
        // Reset deployment status on error
        await supabase
          .from('token_definitions')
          .update({ deployment_status: 'NOT_DEPLOYED' })
          .eq('id', token.id);
        throw new Error(error.message || 'Deployment failed');
      }

      if (data.error) {
        // Reset deployment status on error
        await supabase
          .from('token_definitions')
          .update({ deployment_status: 'NOT_DEPLOYED' })
          .eq('id', token.id);
        throw new Error(data.error);
      }

      toast.success('SPL token deployed successfully!');
      onUpdate();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to deploy token';
      toast.error(message);
      // Ensure status is reset
      await supabase
        .from('token_definitions')
        .update({ deployment_status: 'NOT_DEPLOYED' })
        .eq('id', token.id);
      onUpdate();
    } finally {
      setIsDeploying(false);
    }
  };

  const handleDeploy = async () => {
    if (!canDeploy) return;

    // For Solana Testnet, use real deployment
    if (isSolanaTestnet) {
      await deploySolanaToken();
      return;
    }

    // For other chains, use mock deployment
    setIsDeploying(true);
    try {
      // Set to PENDING
      const { error: pendingError } = await supabase
        .from('token_definitions')
        .update({
          chain: selectedChain,
          network: selectedNetwork,
          deployment_status: 'PENDING',
        })
        .eq('id', token.id);

      if (pendingError) throw pendingError;
      
      toast.info('Deploying contract...');
      onUpdate();

      // Simulate deployment delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Set to DEPLOYED with mock contract address
      const mockAddress = generateMockContractAddress();
      const { error: deployedError } = await supabase
        .from('token_definitions')
        .update({
          deployment_status: 'DEPLOYED',
          contract_address: mockAddress,
        })
        .eq('id', token.id);

      if (deployedError) throw deployedError;

      toast.success('Contract deployed successfully!');
      onUpdate();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to deploy contract';
      toast.error(message);
    } finally {
      setIsDeploying(false);
    }
  };

  const hasConfigChanged = selectedChain !== (token.chain as BlockchainChain) || selectedNetwork !== (token.network as NetworkType);

  const getExplorerUrl = (address: string, isToken: boolean = false) => {
    if (token.chain === 'SOLANA') {
      const cluster = token.network === 'TESTNET' ? 'devnet' : 'mainnet-beta';
      // Use Solscan for better token display
      const type = isToken ? 'token' : 'account';
      return `https://solscan.io/${type}/${address}?cluster=${cluster}`;
    }
    // Default for EVM chains (can be extended)
    return `https://etherscan.io/address/${address}`;
  };

  return (
    <div className="bg-muted/30 rounded-lg p-4 border border-border">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-foreground">{token.token_name}</h3>
          <p className="text-sm font-mono text-primary">{token.token_symbol}</p>
        </div>
        <span className="badge-gold text-xs">{TOKEN_MODEL_LABELS[token.token_model]}</span>
      </div>
      
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Supply</span>
          <span className="font-mono text-foreground">{Number(token.total_supply).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Decimals</span>
          <span className="font-mono text-foreground">{token.decimals}</span>
        </div>
      </div>

      {/* Blockchain Configuration */}
      <div className="mt-3 pt-3 border-t border-border space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Globe className="h-4 w-4" />
          <span className="font-medium">Blockchain Configuration</span>
        </div>

        {isAdmin && !isDeployed && !isPending ? (
          <>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Blockchain</label>
              <Select value={selectedChain} onValueChange={(v) => setSelectedChain(v as BlockchainChain)}>
                <SelectTrigger className="input-dark h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(BLOCKCHAIN_CHAIN_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Network</label>
              <Select value={selectedNetwork} onValueChange={(v) => setSelectedNetwork(v as NetworkType)}>
                <SelectTrigger className="input-dark h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(NETWORK_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isSolanaTestnet && !solanaAddress && (
              <div className="text-xs text-amber-500 bg-amber-500/10 p-2 rounded">
                Connect your Phantom wallet to deploy to Solana Devnet. Your wallet will be set as the mint authority.
              </div>
            )}

            {hasConfigChanged && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={handleSaveConfig}
              >
                Save Configuration
              </Button>
            )}

            <Button 
              className="w-full" 
              size="sm"
              disabled={!canDeploy || isDeploying || isConnectingSolana}
              onClick={handleDeploy}
            >
              {isDeploying || isConnectingSolana ? (
                <>
                  <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  {isSolanaTestnet ? 'Deploying to Devnet...' : 'Deploying...'}
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  {isSolanaTestnet ? 'Deploy SPL Token' : 'Deploy Contract'}
                </>
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Blockchain</span>
              <span className="text-foreground">
                {BLOCKCHAIN_CHAIN_LABELS[(token.chain as BlockchainChain) || 'NONE']}
                {token.chain === 'SOLANA' && token.network === 'TESTNET' && (
                  <span className="text-xs text-muted-foreground ml-1">(Devnet)</span>
                )}
              </span>
            </div>
            {(token.network as NetworkType) !== 'NONE' && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Network</span>
                <span className="text-foreground">
                  {NETWORK_TYPE_LABELS[(token.network as NetworkType)]}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              {isDeployed ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle className="h-3 w-3" />
                  Deployed
                </span>
              ) : isPending ? (
                <span className="inline-flex items-center gap-1 text-warning">
                  <div className="h-3 w-3 border-2 border-warning border-t-transparent rounded-full animate-spin" />
                  Pending
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <XCircle className="h-3 w-3" />
                  Not Deployed
                </span>
              )}
            </div>
          </div>
        )}

        {token.contract_address && (
          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-1">Contract Address (Mint)</p>
            <a
              href={getExplorerUrl(token.contract_address, true)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-muted px-2 py-1 rounded font-mono break-all flex items-center gap-1 hover:bg-muted/80 transition-colors"
            >
              {token.contract_address}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
          </div>
        )}

        {token.treasury_account && (
          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-1">Treasury Account</p>
            <a
              href={getExplorerUrl(token.treasury_account)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-muted px-2 py-1 rounded font-mono break-all flex items-center gap-1 hover:bg-muted/80 transition-colors"
            >
              {token.treasury_account}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
          </div>
        )}
      </div>

      {token.notes && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          {token.notes}
        </p>
      )}
    </div>
  );
}
