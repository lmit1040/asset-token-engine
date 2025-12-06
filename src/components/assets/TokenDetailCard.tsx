import { useState } from 'react';
import { Globe, CheckCircle, XCircle, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

  const deploymentStatus = token.deployment_status as DeploymentStatus;
  const canDeploy = selectedChain !== 'NONE' && selectedNetwork !== 'NONE' && deploymentStatus === 'NOT_DEPLOYED';
  const isDeployed = deploymentStatus === 'DEPLOYED';
  const isPending = deploymentStatus === 'PENDING';

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
    } catch (error: any) {
      toast.error(error.message || 'Failed to save configuration');
    }
  };

  const handleDeploy = async () => {
    if (!canDeploy) return;

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
    } catch (error: any) {
      toast.error(error.message || 'Failed to deploy contract');
    } finally {
      setIsDeploying(false);
    }
  };

  const hasConfigChanged = selectedChain !== (token.chain as BlockchainChain) || selectedNetwork !== (token.network as NetworkType);

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
              disabled={!canDeploy || isDeploying}
              onClick={handleDeploy}
            >
              {isDeploying ? (
                <>
                  <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Deploy Contract
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
            <p className="text-xs text-muted-foreground mb-1">Contract Address</p>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono block break-all">
              {token.contract_address}
            </code>
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