-- Drop existing check constraint and add new one with testnet networks
ALTER TABLE arbitrage_strategies 
DROP CONSTRAINT IF EXISTS arbitrage_strategies_evm_network_check;

ALTER TABLE arbitrage_strategies 
ADD CONSTRAINT arbitrage_strategies_evm_network_check 
CHECK (evm_network IS NULL OR evm_network IN (
  'ETHEREUM', 'POLYGON', 'ARBITRUM', 'BSC',
  'SEPOLIA', 'POLYGON_AMOY', 'ARBITRUM_SEPOLIA', 'BSC_TESTNET'
));

-- Now seed the Sepolia WETH/USDC arbitrage strategy for testnet testing
INSERT INTO arbitrage_strategies (
  name,
  chain_type,
  evm_network,
  dex_a,
  dex_b,
  token_in_mint,
  token_out_mint,
  min_profit_lamports,
  is_enabled,
  is_auto_enabled,
  max_trades_per_day,
  min_profit_to_gas_ratio
) VALUES (
  'Sepolia WETH/USDC Test',
  'EVM',
  'SEPOLIA',
  'Uniswap V3',
  'SushiSwap',
  '0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c',
  '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
  1000000,
  true,
  false,
  100,
  1.5
);