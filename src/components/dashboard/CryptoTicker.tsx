import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

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

const MXU_MOCK_PRICE = 0.025; // Mock MXU price for ratio calculations

export const CryptoTicker = () => {
  const [cryptoData, setCryptoData] = useState<CryptoData[]>([]);
  const [dexTokens, setDexTokens] = useState<CryptoData[]>([]);
  const [mxuRatios, setMxuRatios] = useState<MxuRatio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCryptoData = async () => {
      try {
        setIsLoading(true);
        
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
            
            // Calculate MXU ratios
            const ratios: MxuRatio[] = dexFullData.map(token => ({
              symbol: token.symbol.toUpperCase(),
              name: token.name,
              ratio: token.current_price / MXU_MOCK_PRICE,
              change24h: token.price_change_percentage_24h
            }));
            setMxuRatios(ratios);
          }
        } else {
          setDexTokens(dexData);
          const ratios: MxuRatio[] = dexData.map(token => ({
            symbol: token.symbol.toUpperCase(),
            name: token.name,
            ratio: token.current_price / MXU_MOCK_PRICE,
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
  }, []);

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
    ...cryptoData.map(crypto => ({
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
    <div className="w-full bg-gradient-to-r from-card via-card/95 to-card border-y border-border overflow-hidden">
      {/* MXU Ratios Section */}
      {mxuRatios.length > 0 && (
        <div className="border-b border-border/50 py-1.5 px-4 bg-primary/5">
          <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
            <span className="text-xs font-semibold text-primary whitespace-nowrap">MXU vs DEX Tokens:</span>
            {mxuRatios.map((ratio) => (
              <div key={ratio.symbol} className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-xs font-medium text-foreground">
                  MXU/{ratio.symbol}
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
        </div>
      )}
      
      {/* Main Ticker */}
      <div className="relative py-2">
        <div className="flex animate-ticker">
          {duplicatedItems.map((item, index) => (
            <div 
              key={`${item.type}-${item.type === 'crypto' ? item.data.id : item.data.symbol}-${index}`}
              className="flex items-center gap-2 px-4 border-r border-border/30 whitespace-nowrap"
            >
              {item.type === 'crypto' ? (
                <>
                  <img 
                    src={item.data.image} 
                    alt={item.data.name}
                    className="h-4 w-4 rounded-full"
                  />
                  <span className="text-xs font-medium text-foreground">
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
    </div>
  );
};
