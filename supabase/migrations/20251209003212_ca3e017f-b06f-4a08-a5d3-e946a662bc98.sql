-- Add chain_type column to arbitrage_strategies for EVM support
ALTER TABLE public.arbitrage_strategies 
ADD COLUMN chain_type text NOT NULL DEFAULT 'SOLANA' 
CHECK (chain_type IN ('SOLANA', 'EVM'));

-- Add network column to specify which EVM network (mainnet, polygon, etc.)
ALTER TABLE public.arbitrage_strategies 
ADD COLUMN evm_network text DEFAULT NULL
CHECK (evm_network IS NULL OR evm_network IN ('ETHEREUM', 'POLYGON', 'ARBITRUM', 'BSC'));

-- Comment for documentation
COMMENT ON COLUMN public.arbitrage_strategies.chain_type IS 'Chain type: SOLANA for Solana DEXs, EVM for Ethereum/Polygon/etc';
COMMENT ON COLUMN public.arbitrage_strategies.evm_network IS 'For EVM chains: ETHEREUM, POLYGON, ARBITRUM, or BSC';