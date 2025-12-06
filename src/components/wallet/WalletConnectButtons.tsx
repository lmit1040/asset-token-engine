import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/hooks/useWallet';
import { Wallet, ChevronDown, ExternalLink, Copy, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnectButtons() {
  const {
    evmAddress,
    solanaAddress,
    evmWalletType,
    solanaWalletType,
    isConnectingEvm,
    isConnectingSolana,
    connectMetaMask,
    connectCoinbaseWallet,
    connectPhantom,
    connectSolflare,
    disconnectEvm,
    disconnectSolana,
  } = useWallet();

  const [copiedEvm, setCopiedEvm] = useState(false);
  const [copiedSolana, setCopiedSolana] = useState(false);

  const copyToClipboard = async (address: string, type: 'evm' | 'solana') => {
    await navigator.clipboard.writeText(address);
    if (type === 'evm') {
      setCopiedEvm(true);
      setTimeout(() => setCopiedEvm(false), 2000);
    } else {
      setCopiedSolana(true);
      setTimeout(() => setCopiedSolana(false), 2000);
    }
    toast.success('Address copied!');
  };

  return (
    <div className="flex items-center gap-2">
      {/* EVM Wallet */}
      {evmAddress ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              {truncateAddress(evmAddress)}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2">
              <span className="capitalize">{evmWalletType}</span>
              <span className="text-xs text-muted-foreground">(EVM)</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => copyToClipboard(evmAddress, 'evm')}>
              {copiedEvm ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              Copy Address
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => window.open(`https://etherscan.io/address/${evmAddress}`, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View on Explorer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={disconnectEvm} className="text-destructive">
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" disabled={isConnectingEvm}>
              <Wallet className="h-4 w-4" />
              {isConnectingEvm ? 'Connecting...' : 'EVM'}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Connect EVM Wallet</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={connectMetaMask}>
              MetaMask
            </DropdownMenuItem>
            <DropdownMenuItem onClick={connectCoinbaseWallet}>
              Coinbase Wallet
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Solana Wallet */}
      {solanaAddress ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <div className="h-2 w-2 rounded-full bg-purple-500" />
              {truncateAddress(solanaAddress)}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center gap-2">
              <span className="capitalize">{solanaWalletType}</span>
              <span className="text-xs text-muted-foreground">(Solana)</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => copyToClipboard(solanaAddress, 'solana')}>
              {copiedSolana ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              Copy Address
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => window.open(`https://solscan.io/account/${solanaAddress}`, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View on Explorer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={disconnectSolana} className="text-destructive">
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" disabled={isConnectingSolana}>
              <Wallet className="h-4 w-4" />
              {isConnectingSolana ? 'Connecting...' : 'Solana'}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Connect Solana Wallet</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={connectPhantom}>
              Phantom
            </DropdownMenuItem>
            <DropdownMenuItem onClick={connectSolflare}>
              Solflare
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
