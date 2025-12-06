-- Add delivery wallet fields to user_token_holdings
ALTER TABLE public.user_token_holdings 
ADD COLUMN delivery_wallet_address text,
ADD COLUMN delivery_wallet_type text CHECK (delivery_wallet_type IN ('EVM', 'SOLANA', NULL));

-- Create index for faster lookups
CREATE INDEX idx_user_token_holdings_delivery_wallet ON public.user_token_holdings(delivery_wallet_address) WHERE delivery_wallet_address IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.user_token_holdings.delivery_wallet_address IS 'The verified wallet address for on-chain token delivery';
COMMENT ON COLUMN public.user_token_holdings.delivery_wallet_type IS 'The wallet type (EVM or SOLANA) matching the token chain';