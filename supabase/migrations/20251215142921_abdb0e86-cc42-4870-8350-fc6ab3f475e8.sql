-- Add RPC URL configuration fields to system_settings
ALTER TABLE public.system_settings
ADD COLUMN IF NOT EXISTS rpc_solana_mainnet_url TEXT,
ADD COLUMN IF NOT EXISTS rpc_solana_devnet_url TEXT,
ADD COLUMN IF NOT EXISTS rpc_polygon_url TEXT,
ADD COLUMN IF NOT EXISTS rpc_ethereum_url TEXT,
ADD COLUMN IF NOT EXISTS rpc_arbitrum_url TEXT,
ADD COLUMN IF NOT EXISTS rpc_bsc_url TEXT;