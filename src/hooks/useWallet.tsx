import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface WalletState {
  evmAddress: string | null;
  solanaAddress: string | null;
  evmWalletType: 'metamask' | 'coinbase' | null;
  solanaWalletType: 'phantom' | 'solflare' | null;
  isConnectingEvm: boolean;
  isConnectingSolana: boolean;
}

interface WalletContextType extends WalletState {
  connectMetaMask: () => Promise<void>;
  connectCoinbaseWallet: () => Promise<void>;
  connectPhantom: () => Promise<void>;
  connectSolflare: () => Promise<void>;
  disconnectEvm: () => void;
  disconnectSolana: () => void;
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
    };
    solflare?: {
      isSolflare?: boolean;
      connect: () => Promise<void>;
      publicKey?: { toString: () => string };
      disconnect: () => Promise<void>;
    };
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    evmAddress: null,
    solanaAddress: null,
    evmWalletType: null,
    solanaWalletType: null,
    isConnectingEvm: false,
    isConnectingSolana: false,
  });

  const getEvmProvider = (type: 'metamask' | 'coinbase') => {
    if (!window.ethereum) return null;
    
    // Check if multiple providers exist
    if (window.ethereum.providers?.length) {
      return window.ethereum.providers.find(p => 
        type === 'metamask' ? p.isMetaMask : p.isCoinbaseWallet
      );
    }
    
    // Single provider
    if (type === 'metamask' && window.ethereum.isMetaMask) return window.ethereum;
    if (type === 'coinbase' && window.ethereum.isCoinbaseWallet) return window.ethereum;
    
    // Fallback to default ethereum provider
    return window.ethereum;
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
        setState(s => ({ 
          ...s, 
          evmAddress: accounts[0], 
          evmWalletType: 'metamask',
          isConnectingEvm: false 
        }));
      }
    } catch (error) {
      console.error('MetaMask connection failed:', error);
      setState(s => ({ ...s, isConnectingEvm: false }));
    }
  }, []);

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
        setState(s => ({ 
          ...s, 
          evmAddress: accounts[0], 
          evmWalletType: 'coinbase',
          isConnectingEvm: false 
        }));
      }
    } catch (error) {
      console.error('Coinbase Wallet connection failed:', error);
      setState(s => ({ ...s, isConnectingEvm: false }));
    }
  }, []);

  const connectPhantom = useCallback(async () => {
    if (!window.solana?.isPhantom) {
      window.open('https://phantom.app/', '_blank');
      return;
    }

    setState(s => ({ ...s, isConnectingSolana: true }));
    try {
      const response = await window.solana.connect();
      setState(s => ({ 
        ...s, 
        solanaAddress: response.publicKey.toString(), 
        solanaWalletType: 'phantom',
        isConnectingSolana: false 
      }));
    } catch (error) {
      console.error('Phantom connection failed:', error);
      setState(s => ({ ...s, isConnectingSolana: false }));
    }
  }, []);

  const connectSolflare = useCallback(async () => {
    if (!window.solflare?.isSolflare) {
      window.open('https://solflare.com/', '_blank');
      return;
    }

    setState(s => ({ ...s, isConnectingSolana: true }));
    try {
      await window.solflare.connect();
      if (window.solflare.publicKey) {
        setState(s => ({ 
          ...s, 
          solanaAddress: window.solflare!.publicKey!.toString(), 
          solanaWalletType: 'solflare',
          isConnectingSolana: false 
        }));
      }
    } catch (error) {
      console.error('Solflare connection failed:', error);
      setState(s => ({ ...s, isConnectingSolana: false }));
    }
  }, []);

  const disconnectEvm = useCallback(() => {
    setState(s => ({ ...s, evmAddress: null, evmWalletType: null }));
  }, []);

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
    setState(s => ({ ...s, solanaAddress: null, solanaWalletType: null }));
  }, [state.solanaWalletType]);

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
