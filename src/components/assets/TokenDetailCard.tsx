import { useState, useEffect, useCallback } from 'react';
import { Globe, CheckCircle, XCircle, Rocket, ExternalLink, Send, Wallet, RefreshCw, Tag, Upload, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWallet } from '@/hooks/useWallet';
import { useSolanaBalances } from '@/hooks/useSolanaBalances';
import { TokenImageUpload } from './TokenImageUpload';
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
  token: TokenDefinition & { token_image_url?: string | null };
  isAdmin: boolean;
  onUpdate: () => void;
}

export function TokenDetailCard({ token, isAdmin, onUpdate }: TokenDetailCardProps) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [isAddingMetadata, setIsAddingMetadata] = useState(false);
  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [selectedChain, setSelectedChain] = useState<BlockchainChain>((token.chain as BlockchainChain) || 'NONE');
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkType>((token.network as NetworkType) || 'NONE');
  const { solanaAddress, connectPhantom, isConnectingSolana } = useWallet();
  const { fetchBalances, getBalance, isLoading: isLoadingBalance } = useSolanaBalances();

  // Send tokens state
  const [sendAmount, setSendAmount] = useState('');
  const [recipientType, setRecipientType] = useState<'wallet' | 'custom'>('wallet');
  const [customAddress, setCustomAddress] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null);
  
  // Treasury balance state
  const [treasuryBalance, setTreasuryBalance] = useState<number | null>(null);

  const deploymentStatus = token.deployment_status as DeploymentStatus;
  const canDeploy = selectedChain !== 'NONE' && selectedNetwork !== 'NONE' && deploymentStatus === 'NOT_DEPLOYED';
  const isDeployed = deploymentStatus === 'DEPLOYED';
  const isPending = deploymentStatus === 'PENDING';
  const isSolanaTestnet = selectedChain === 'SOLANA' && selectedNetwork === 'TESTNET';
  const canSendTokens = isAdmin && isDeployed && token.chain === 'SOLANA' && token.network === 'TESTNET';
  const canAddMetadata = isAdmin && isDeployed && token.chain === 'SOLANA';

  // Fetch treasury balance when token is deployed with a treasury account
  const fetchTreasuryBalance = useCallback(async () => {
    if (!token.treasury_account || !token.contract_address || !isDeployed) return;
    
    // Pass isTreasuryAccount=true since treasury_account is an ATA, not a wallet
    await fetchBalances(token.treasury_account, [token.contract_address], true);
  }, [token.treasury_account, token.contract_address, isDeployed, fetchBalances]);

  useEffect(() => {
    fetchTreasuryBalance();
  }, [fetchTreasuryBalance]);

  // Update treasury balance when balances change
  useEffect(() => {
    if (token.contract_address) {
      const balance = getBalance(token.contract_address);
      setTreasuryBalance(balance?.balance ?? null);
    }
  }, [token.contract_address, getBalance]);

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

  const handleSendTokens = async () => {
    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    let recipientAddress = '';
    if (recipientType === 'wallet') {
      if (!solanaAddress) {
        toast.info('Please connect your Phantom wallet first');
        await connectPhantom();
        return;
      }
      recipientAddress = solanaAddress;
    } else {
      if (!customAddress.trim()) {
        toast.error('Please enter a recipient address');
        return;
      }
      recipientAddress = customAddress.trim();
    }

    setIsSending(true);
    setLastTxSignature(null);
    try {
      toast.info('Sending tokens from treasury...');

      const { data, error } = await supabase.functions.invoke('send-treasury-tokens', {
        body: {
          tokenDefinitionId: token.id,
          recipientAddress,
          amount,
        },
      });

      if (error) {
        throw new Error(error.message || 'Transfer failed');
      }

      if (!data.success) {
        throw new Error(data.error || 'Transfer failed');
      }

      setLastTxSignature(data.txSignature);
      setSendAmount('');
      toast.success(`Sent ${amount} ${token.token_symbol} successfully!`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to send tokens';
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  const handleAddMetadata = async () => {
    if (!canAddMetadata) return;

    setIsAddingMetadata(true);
    try {
      toast.info('Adding Metaplex metadata to token...');

      const { data, error } = await supabase.functions.invoke('add-token-metadata', {
        body: {
          tokenDefinitionId: token.id,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to add metadata');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(`Metadata added! Token will now show as "${token.token_symbol}" on explorers.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add metadata';
      toast.error(message);
    } finally {
      setIsAddingMetadata(false);
    }
  };

  const handleUpdateMetadataWithIPFS = async () => {
    if (!canAddMetadata) return;

    setIsUpdatingMetadata(true);
    try {
      toast.info('Uploading metadata to IPFS and updating on-chain...');

      const { data, error } = await supabase.functions.invoke('update-token-metadata', {
        body: {
          tokenDefinitionId: token.id,
          description: `${token.token_name} (${token.token_symbol}) - A tokenized asset on MetallumX Vault platform.`,
          imageUrl: token.token_image_url || undefined,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to update metadata');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(
        <div className="space-y-1">
          <p>Metadata uploaded to IPFS and updated on-chain!</p>
          <a 
            href={data.ipfsUri} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs underline"
          >
            View on IPFS
          </a>
        </div>
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update metadata';
      toast.error(message);
    } finally {
      setIsUpdatingMetadata(false);
    }
  };

  const handleMintToTreasury = async () => {
    if (!isAdmin || !isDeployed || token.chain !== 'SOLANA') return;

    setIsMinting(true);
    try {
      toast.info('Minting tokens to treasury...');

      const { data, error } = await supabase.functions.invoke('mint-to-treasury', {
        body: {
          tokenDefinitionId: token.id,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to mint tokens');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.message) {
        toast.info(data.message);
      } else {
        toast.success(`Minted ${Number(data.mintedAmount).toLocaleString()} tokens to treasury!`);
      }
      
      // Refresh treasury balance
      fetchTreasuryBalance();
      onUpdate();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to mint tokens';
      toast.error(message);
    } finally {
      setIsMinting(false);
    }
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
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Treasury Account</p>
              {isDeployed && token.chain === 'SOLANA' && (
                <button
                  onClick={fetchTreasuryBalance}
                  disabled={isLoadingBalance}
                  className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingBalance ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              )}
            </div>
            <a
              href={getExplorerUrl(token.treasury_account)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-muted px-2 py-1 rounded font-mono break-all flex items-center gap-1 hover:bg-muted/80 transition-colors"
            >
              {token.treasury_account}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
            {isDeployed && token.chain === 'SOLANA' && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">On-chain Balance:</span>
                {isLoadingBalance ? (
                  <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : treasuryBalance !== null ? (
                  <span className="text-sm font-mono font-semibold text-primary">
                    {treasuryBalance.toLocaleString()} {token.token_symbol}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">--</span>
                )}
              </div>
            )}
            {/* Mint to Treasury button if balance is 0 */}
            {isAdmin && isDeployed && token.chain === 'SOLANA' && treasuryBalance === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                disabled={isMinting}
                onClick={handleMintToTreasury}
              >
                {isMinting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Minting...
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4" />
                    Mint Supply to Treasury
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Token Image Upload for deployed Solana tokens */}
        {canAddMetadata && (
          <div className="pt-3 border-t border-border">
            <TokenImageUpload
              tokenId={token.id}
              tokenSymbol={token.token_symbol}
              currentImageUrl={token.token_image_url}
              onUploadComplete={() => onUpdate()}
            />
          </div>
        )}

        {/* Add Metadata Button for deployed Solana tokens */}
        {canAddMetadata && (
          <div className="pt-3 space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isAddingMetadata}
              onClick={handleAddMetadata}
            >
              {isAddingMetadata ? (
                <>
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Adding Metadata...
                </>
              ) : (
                <>
                  <Tag className="h-4 w-4" />
                  Add Token Metadata (Name/Symbol)
                </>
              )}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="w-full"
              disabled={isUpdatingMetadata || !token.token_image_url}
              onClick={handleUpdateMetadataWithIPFS}
            >
              {isUpdatingMetadata ? (
                <>
                  <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Uploading to IPFS...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Update Metadata with IPFS URI
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              {!token.token_image_url 
                ? 'Upload an icon first, then update metadata on-chain.'
                : 'First add metadata, then update with IPFS URI for full Solscan display.'}
            </p>
          </div>
        )}
      </div>

      {/* Send Tokens Section */}
      {canSendTokens && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Send className="h-4 w-4" />
            <span className="font-medium">Send Tokens from Treasury</span>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                placeholder={`Enter amount (${token.token_symbol})`}
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                className="h-9 text-sm"
                min="0"
                step="any"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Recipient</Label>
              <RadioGroup
                value={recipientType}
                onValueChange={(v) => setRecipientType(v as 'wallet' | 'custom')}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="wallet" id="wallet" />
                  <Label htmlFor="wallet" className="text-sm font-normal cursor-pointer flex items-center gap-1">
                    <Wallet className="h-3 w-3" />
                    My connected wallet
                    {solanaAddress && (
                      <span className="text-xs text-muted-foreground font-mono">
                        ({solanaAddress.slice(0, 4)}...{solanaAddress.slice(-4)})
                      </span>
                    )}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="custom" id="custom" />
                  <Label htmlFor="custom" className="text-sm font-normal cursor-pointer">
                    Custom address
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {recipientType === 'custom' && (
              <Input
                placeholder="Enter Solana address"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                className="h-9 text-sm font-mono"
              />
            )}

            {recipientType === 'wallet' && !solanaAddress && (
              <div className="text-xs text-amber-500 bg-amber-500/10 p-2 rounded">
                Connect your Phantom wallet to send tokens to your address.
              </div>
            )}

            <Button
              className="w-full"
              size="sm"
              disabled={isSending || isConnectingSolana || !sendAmount}
              onClick={handleSendTokens}
            >
              {isSending ? (
                <>
                  <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send from Treasury
                </>
              )}
            </Button>

            {lastTxSignature && (
              <div className="text-xs bg-success/10 text-success p-2 rounded space-y-1">
                <p className="font-medium">Transaction successful!</p>
                <a
                  href={`https://solscan.io/tx/${lastTxSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:underline break-all"
                >
                  View on Solscan
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {token.notes && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          {token.notes}
        </p>
      )}
    </div>
  );
}
