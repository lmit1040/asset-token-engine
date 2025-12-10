import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Star, Pause, Play, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';

interface CryptoData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  image: string;
}

interface MxuRatio {
  symbol: string;
  name: string;
  ratio: number;
  change24h: number;
}

const DEX_TOKEN_IDS = ['uniswap', 'sushiswap', 'pancakeswap-token', 'curve-dao-token', 'balancer', '1inch'];

// MXU token definition ID for fetching on-chain data
const MXU_TOKEN_ID = '9e89d0bc-e890-4f2f-ba23-cc3bc091a14b';
const MXU_TREASURY = 'HMuYvefHUtcZBDmussXAWxTSKVucBrRfVkoGmECp6bLT';
const MXU_MINT = '2oFVnFH2MEP7wYP3waFYam3dZY2VwfZVtd2kCXTwPKh4';

// Speed presets (animation duration in seconds - lower = faster)
const SPEED_PRESETS = {
  slow: 180,
  medium: 120,
  fast: 60,
};

const FAVORITES_KEY = 'crypto-ticker-favorites';
const SPEED_KEY = 'crypto-ticker-speed';

export const CryptoTicker = () => {
  const [cryptoData, setCryptoData] = useState<CryptoData[]>([]);
  const [dexTokens, setDexTokens] = useState<CryptoData[]>([]);
  const [mxuRatios, setMxuRatios] = useState<MxuRatio[]>([]);
  const [mxuPrice, setMxuPrice] = useState<number>(0.025); // Default fallback
  const [mxuSupply, setMxuSupply] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState<number>(() => {
    const stored = localStorage.getItem(SPEED_KEY);
    return stored ? Number(stored) : SPEED_PRESETS.medium;
  });
  const [showControls, setShowControls] = useState(false);

  // Fetch MXU on-chain data
  const fetchMxuOnChainData = useCallback(async () => {
    try {
      const response = await supabase.functions.invoke('get-solana-balances', {
        body: {
          walletAddress: MXU_TREASURY,
          mintAddresses: [MXU_MINT],
          isTreasuryAccount: true
        }
      });

      if (response.data?.success && response.data.balances?.length > 0) {
        const balance = response.data.balances[0];
        setMxuSupply(balance.balance);
        
        // Calculate MXU price based on treasury holdings
        // For devnet, we use a reference price calculation
        // In production, this would come from DEX liquidity pools
        const treasuryValue = 100000000; // $100M total value assumption for devnet
        const calculatedPrice = treasuryValue / balance.balance;
        setMxuPrice(calculatedPrice > 0 ? calculatedPrice : 0.025);
      }
    } catch (err) {
      console.error('Error fetching MXU on-chain data:', err);
      // Keep using fallback price
    }
  }, []);

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  }, [favorites]);

  // Save speed to localStorage
  useEffect(() => {
    localStorage.setItem(SPEED_KEY, String(speed));
  }, [speed]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    const fetchCryptoData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch MXU on-chain data first
        await fetchMxuOnChainData();
        
        // Fetch top 50 cryptos
        const response = await fetch(
          'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h'
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch crypto data');
        }
        
        const data: CryptoData[] = await response.json();
        setCryptoData(data);
        
        // Filter DEX tokens from the data or fetch separately
        const dexData = data.filter(crypto => 
          DEX_TOKEN_IDS.includes(crypto.id)
        );
        
        // If DEX tokens not in top 50, fetch them separately
        if (dexData.length < DEX_TOKEN_IDS.length) {
          const dexResponse = await fetch(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${DEX_TOKEN_IDS.join(',')}&sparkline=false&price_change_percentage=24h`
          );
          
          if (dexResponse.ok) {
            const dexFullData: CryptoData[] = await dexResponse.json();
            setDexTokens(dexFullData);
            
            // Calculate MXU ratios using on-chain price
            const ratios: MxuRatio[] = dexFullData.map(token => ({
              symbol: token.symbol.toUpperCase(),
              name: token.name,
              ratio: token.current_price / mxuPrice,
              change24h: token.price_change_percentage_24h
            }));
            setMxuRatios(ratios);
          }
        } else {
          setDexTokens(dexData);
          const ratios: MxuRatio[] = dexData.map(token => ({
            symbol: token.symbol.toUpperCase(),
            name: token.name,
            ratio: token.current_price / mxuPrice,
            change24h: token.price_change_percentage_24h
          }));
          setMxuRatios(ratios);
        }
        
        setError(null);
      } catch (err) {
        console.error('Error fetching crypto data:', err);
        setError('Unable to load crypto data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCryptoData();
    
    // Refresh every 60 seconds (CoinGecko free tier rate limit)
    const interval = setInterval(fetchCryptoData, 60000);
    
    return () => clearInterval(interval);
  }, [mxuPrice, fetchMxuOnChainData]);

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(6)}`;
  };

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  // Sort cryptos: favorites first, then by market cap
  const sortedCryptoData = [...cryptoData].sort((a, b) => {
    const aFav = favorites.has(a.id);
    const bFav = favorites.has(b.id);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;
    return 0;
  });

  if (isLoading) {
    return (
      <div className="w-full bg-card/50 border-y border-border py-2">
        <div className="flex items-center justify-center text-muted-foreground text-sm">
          Loading crypto data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-card/50 border-y border-border py-2">
        <div className="flex items-center justify-center text-destructive text-sm">
          {error}
        </div>
      </div>
    );
  }

  // Combine crypto data and MXU ratios for the ticker
  const tickerItems = [
    ...sortedCryptoData.map(crypto => ({
      type: 'crypto' as const,
      data: crypto
    })),
    ...mxuRatios.map(ratio => ({
      type: 'ratio' as const,
      data: ratio
    }))
  ];

  // Duplicate items for seamless infinite scroll
  const duplicatedItems = [...tickerItems, ...tickerItems];

  return (
    <TooltipProvider>
      <div 
        className="w-full bg-gradient-to-r from-card via-card/95 to-card border-y border-border overflow-hidden"
        style={{ contain: 'content', position: 'relative' }}
      >
        {/* Controls Bar */}
        <div className="border-b border-border/50 py-1.5 px-4 bg-primary/5 flex items-center justify-between">
          <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-primary whitespace-nowrap">MXU Price:</span>
              <span className="text-xs text-foreground font-medium">{formatPrice(mxuPrice)}</span>
              {mxuSupply && (
                <span className="text-xs text-muted-foreground">
                  (Supply: {(mxuSupply / 1000000).toFixed(1)}M)
                </span>
              )}
            </div>
            <span className="text-xs text-border">|</span>
            <span className="text-xs font-semibold text-primary whitespace-nowrap">MXU vs DEX:</span>
            {mxuRatios.map((ratio) => (
              <div key={ratio.symbol} className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-xs font-medium text-foreground">
                  {ratio.symbol}
                </span>
                <span className="text-xs text-muted-foreground">
                  1:{ratio.ratio.toFixed(2)}
                </span>
                <span className={`text-xs flex items-center gap-0.5 ${
                  ratio.change24h >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {ratio.change24h >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {formatChange(ratio.change24h)}
                </span>
              </div>
            ))}
          </div>
          
          {/* Ticker Controls */}
          <div className="flex items-center gap-2 ml-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setIsPaused(!isPaused)}
                >
                  {isPaused ? (
                    <Play className="h-3 w-3" />
                  ) : (
                    <Pause className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isPaused ? 'Resume ticker' : 'Pause ticker'}
              </TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setShowControls(!showControls)}
                >
                  <Gauge className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Adjust speed
              </TooltipContent>
            </Tooltip>
            
            {showControls && (
              <div className="flex items-center gap-2 bg-background/80 rounded px-2 py-1">
                <span className="text-xs text-muted-foreground">Slow</span>
                <Slider
                  value={[speed]}
                  onValueChange={(v) => setSpeed(v[0])}
                  min={30}
                  max={240}
                  step={10}
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground">Fast</span>
              </div>
            )}
          </div>
        </div>
        
        {/* Main Ticker */}
        <div className="relative py-2 overflow-hidden">
          <div 
            className="flex w-max"
            style={{
              animation: isPaused ? 'none' : `ticker ${speed}s linear infinite`,
            }}
          >
            {duplicatedItems.map((item, index) => (
              <div 
                key={`${item.type}-${item.type === 'crypto' ? item.data.id : item.data.symbol}-${index}`}
                className="flex items-center gap-2 px-4 border-r border-border/30 whitespace-nowrap group flex-shrink-0"
              >
                {item.type === 'crypto' ? (
                  <>
                    <button
                      onClick={() => toggleFavorite(item.data.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Star 
                        className={`h-3 w-3 ${
                          favorites.has(item.data.id) 
                            ? 'fill-primary text-primary' 
                            : 'text-muted-foreground hover:text-primary'
                        }`}
                      />
                    </button>
                    <img 
                      src={item.data.image} 
                      alt={item.data.name}
                      className="h-4 w-4 rounded-full"
                    />
                    <span className={`text-xs font-medium ${
                      favorites.has(item.data.id) ? 'text-primary' : 'text-foreground'
                    }`}>
                      {item.data.symbol.toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatPrice(item.data.current_price)}
                    </span>
                    <span className={`text-xs flex items-center gap-0.5 ${
                      item.data.price_change_percentage_24h >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {item.data.price_change_percentage_24h >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {formatChange(item.data.price_change_percentage_24h)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-medium text-primary">
                      MXU/{item.data.symbol}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      1:{item.data.ratio.toFixed(2)}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Favorites indicator */}
        {favorites.size > 0 && (
          <div className="border-t border-border/50 py-1 px-4 bg-primary/5">
            <div className="flex items-center gap-2">
              <Star className="h-3 w-3 fill-primary text-primary" />
              <span className="text-xs text-muted-foreground">
                {favorites.size} favorite{favorites.size > 1 ? 's' : ''} pinned to front
              </span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};
