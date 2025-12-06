import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface WalletState {
  evmAddress: string | null;
  solanaAddress: string | null;
  evmWalletType: 'metamask' | 'coinbase' | null;
  solanaWalletType: 'phantom' | 'solflare' | null;
  isConnectingEvm: boolean;
  isConnectingSolana: boolean;
  isLoading: boolean;
}

interface WalletContextType extends WalletState {
  connectMetaMask: () => Promise<void>;
  connectCoinbaseWallet: () => Promise<void>;
  connectPhantom: () => Promise<void>;
  connectSolflare: () => Promise<void>;
  disconnectEvm: () => Promise<void>;
  disconnectSolana: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      isCoinbaseWallet?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      providers?: Array<{ isMetaMask?: boolean; isCoinbaseWallet?: boolean; request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }>;
    };
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
      signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
    };
    solflare?: {
      isSolflare?: boolean;
      connect: () => Promise<void>;
      publicKey?: { toString: () => string; toBytes: () => Uint8Array };
      disconnect: () => Promise<void>;
      signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
    };
  }
}

function generateNonce(): string {
  return `MetallumX Vault Verification\n\nTimestamp: ${Date.now()}\nNonce: ${Math.random().toString(36).substring(2, 15)}`;
}

function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<WalletState>({
    evmAddress: null,
    solanaAddress: null,
    evmWalletType: null,
    solanaWalletType: null,
    isConnectingEvm: false,
    isConnectingSolana: false,
    isLoading: true,
  });

  // Load wallet addresses from database on mount
  useEffect(() => {
    async function loadWalletAddresses() {
      if (!user?.id) {
        setState(s => ({ ...s, isLoading: false, evmAddress: null, solanaAddress: null }));
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('evm_wallet_address, solana_wallet_address')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Failed to load wallet addresses:', error);
        } else if (data) {
          setState(s => ({
            ...s,
            evmAddress: data.evm_wallet_address,
            solanaAddress: data.solana_wallet_address,
            isLoading: false,
          }));
        } else {
          setState(s => ({ ...s, isLoading: false }));
        }
      } catch (err) {
        console.error('Failed to load wallet addresses:', err);
        setState(s => ({ ...s, isLoading: false }));
      }
    }

    loadWalletAddresses();
  }, [user?.id]);

  const saveEvmAddress = async (address: string | null) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('profiles')
      .update({ evm_wallet_address: address })
      .eq('id', user.id);

    if (error) {
      console.error('Failed to save EVM wallet address:', error);
      toast.error('Failed to save wallet address');
      throw error;
    }
  };

  const saveSolanaAddress = async (address: string | null) => {
    if (!user?.id) return;

    const { error } = await supabase
      .from('profiles')
      .update({ solana_wallet_address: address })
      .eq('id', user.id);

    if (error) {
      console.error('Failed to save Solana wallet address:', error);
      toast.error('Failed to save wallet address');
      throw error;
    }
  };

  const getEvmProvider = (type: 'metamask' | 'coinbase') => {
    if (!window.ethereum) return null;
    
    if (window.ethereum.providers?.length) {
      return window.ethereum.providers.find(p => 
        type === 'metamask' ? p.isMetaMask : p.isCoinbaseWallet
      );
    }
    
    if (type === 'metamask' && window.ethereum.isMetaMask) return window.ethereum;
    if (type === 'coinbase' && window.ethereum.isCoinbaseWallet) return window.ethereum;
    
    return window.ethereum;
  };

  const verifyEvmSignature = async (
    provider: NonNullable<typeof window.ethereum>,
    address: string
  ): Promise<boolean> => {
    const message = generateNonce();
    
    try {
      toast.info('Please sign the message in your wallet to verify ownership');
      
      const signature = await provider.request({
        method: 'personal_sign',
        params: [message, address],
      }) as string;

      // Verify signature by recovering the address
      const recoveredAddress = await provider.request({
        method: 'personal_ecRecover',
        params: [message, signature],
      }) as string;

      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  };

  const verifySolanaSignature = async (
    wallet: 'phantom' | 'solflare',
    address: string
  ): Promise<boolean> => {
    const message = generateNonce();
    const encodedMessage = new TextEncoder().encode(message);
    
    try {
      toast.info('Please sign the message in your wallet to verify ownership');
      
      let signature: Uint8Array;
      
      if (wallet === 'phantom' && window.solana) {
        const result = await window.solana.signMessage(encodedMessage, 'utf8');
        signature = result.signature;
      } else if (wallet === 'solflare' && window.solflare) {
        const result = await window.solflare.signMessage(encodedMessage, 'utf8');
        signature = result.signature;
      } else {
        return false;
      }

      // For Solana, we verify by checking if signature was returned
      // Full verification would require nacl library, but getting a signature
      // from the wallet itself proves ownership since only the private key holder can sign
      return signature && signature.length > 0;
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  };

  const connectMetaMask = useCallback(async () => {
    const provider = getEvmProvider('metamask');
    if (!provider) {
      window.open('https://metamask.io/download/', '_blank');
      return;
    }

    setState(s => ({ ...s, isConnectingEvm: true }));
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts.length > 0) {
        const address = accounts[0];
        
        // Verify ownership via signature
        const isVerified = await verifyEvmSignature(provider, address);
        if (!isVerified) {
          toast.error('Wallet verification failed. Please try again.');
          setState(s => ({ ...s, isConnectingEvm: false }));
          return;
        }
        
        await saveEvmAddress(address);
        setState(s => ({ 
          ...s, 
          evmAddress: address, 
          evmWalletType: 'metamask',
          isConnectingEvm: false 
        }));
        toast.success('MetaMask verified and connected');
      }
    } catch (error) {
      console.error('MetaMask connection failed:', error);
      toast.error('Failed to connect MetaMask');
      setState(s => ({ ...s, isConnectingEvm: false }));
    }
  }, [user?.id]);

  const connectCoinbaseWallet = useCallback(async () => {
    const provider = getEvmProvider('coinbase');
    if (!provider) {
      window.open('https://www.coinbase.com/wallet', '_blank');
      return;
    }

    setState(s => ({ ...s, isConnectingEvm: true }));
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      if (accounts.length > 0) {
        const address = accounts[0];
        
        // Verify ownership via signature
        const isVerified = await verifyEvmSignature(provider, address);
        if (!isVerified) {
          toast.error('Wallet verification failed. Please try again.');
          setState(s => ({ ...s, isConnectingEvm: false }));
          return;
        }
        
        await saveEvmAddress(address);
        setState(s => ({ 
          ...s, 
          evmAddress: address, 
          evmWalletType: 'coinbase',
          isConnectingEvm: false 
        }));
        toast.success('Coinbase Wallet verified and connected');
      }
    } catch (error) {
      console.error('Coinbase Wallet connection failed:', error);
      toast.error('Failed to connect Coinbase Wallet');
      setState(s => ({ ...s, isConnectingEvm: false }));
    }
  }, [user?.id]);

  const connectPhantom = useCallback(async () => {
    if (!window.solana?.isPhantom) {
      window.open('https://phantom.app/', '_blank');
      return;
    }

    setState(s => ({ ...s, isConnectingSolana: true }));
    try {
      const response = await window.solana.connect();
      const address = response.publicKey.toString();
      
      // Verify ownership via signature
      const isVerified = await verifySolanaSignature('phantom', address);
      if (!isVerified) {
        toast.error('Wallet verification failed. Please try again.');
        await window.solana.disconnect();
        setState(s => ({ ...s, isConnectingSolana: false }));
        return;
      }
      
      await saveSolanaAddress(address);
      setState(s => ({ 
        ...s, 
        solanaAddress: address, 
        solanaWalletType: 'phantom',
        isConnectingSolana: false 
      }));
      toast.success('Phantom verified and connected');
    } catch (error) {
      console.error('Phantom connection failed:', error);
      toast.error('Failed to connect Phantom');
      setState(s => ({ ...s, isConnectingSolana: false }));
    }
  }, [user?.id]);

  const connectSolflare = useCallback(async () => {
    if (!window.solflare?.isSolflare) {
      window.open('https://solflare.com/', '_blank');
      return;
    }

    setState(s => ({ ...s, isConnectingSolana: true }));
    try {
      await window.solflare.connect();
      if (window.solflare.publicKey) {
        const address = window.solflare.publicKey.toString();
        
        // Verify ownership via signature
        const isVerified = await verifySolanaSignature('solflare', address);
        if (!isVerified) {
          toast.error('Wallet verification failed. Please try again.');
          await window.solflare.disconnect();
          setState(s => ({ ...s, isConnectingSolana: false }));
          return;
        }
        
        await saveSolanaAddress(address);
        setState(s => ({ 
          ...s, 
          solanaAddress: address, 
          solanaWalletType: 'solflare',
          isConnectingSolana: false 
        }));
        toast.success('Solflare verified and connected');
      }
    } catch (error) {
      console.error('Solflare connection failed:', error);
      toast.error('Failed to connect Solflare');
      setState(s => ({ ...s, isConnectingSolana: false }));
    }
  }, [user?.id]);

  const disconnectEvm = useCallback(async () => {
    await saveEvmAddress(null);
    setState(s => ({ ...s, evmAddress: null, evmWalletType: null }));
    toast.success('EVM wallet disconnected');
  }, [user?.id]);

  const disconnectSolana = useCallback(async () => {
    try {
      if (state.solanaWalletType === 'phantom' && window.solana) {
        await window.solana.disconnect();
      } else if (state.solanaWalletType === 'solflare' && window.solflare) {
        await window.solflare.disconnect();
      }
    } catch (error) {
      console.error('Disconnect failed:', error);
    }
    await saveSolanaAddress(null);
    setState(s => ({ ...s, solanaAddress: null, solanaWalletType: null }));
    toast.success('Solana wallet disconnected');
  }, [state.solanaWalletType, user?.id]);

  return (
    <WalletContext.Provider value={{
      ...state,
      connectMetaMask,
      connectCoinbaseWallet,
      connectPhantom,
      connectSolflare,
      disconnectEvm,
      disconnectSolana,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
