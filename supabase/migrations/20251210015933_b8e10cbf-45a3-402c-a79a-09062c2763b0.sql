-- Extend arbitrage_strategies table with automation and risk limit fields

-- Automation flags
ALTER TABLE public.arbitrage_strategies
ADD COLUMN is_auto_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN is_for_fee_payer_refill boolean NOT NULL DEFAULT false,
ADD COLUMN is_for_ops_refill boolean NOT NULL DEFAULT false;

-- Risk limit columns
ALTER TABLE public.arbitrage_strategies
ADD COLUMN min_expected_profit_native bigint NOT NULL DEFAULT 0,
ADD COLUMN min_profit_to_gas_ratio numeric(10,4) NOT NULL DEFAULT 1.0,
ADD COLUMN max_daily_loss_native bigint NOT NULL DEFAULT 0,
ADD COLUMN max_trades_per_day integer NOT NULL DEFAULT 10,
ADD COLUMN max_trade_value_native bigint DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.arbitrage_strategies.is_auto_enabled IS 'Whether automated execution is allowed for this strategy';
COMMENT ON COLUMN public.arbitrage_strategies.is_for_fee_payer_refill IS 'Strategy is used for fee payer wallet refills';
COMMENT ON COLUMN public.arbitrage_strategies.is_for_ops_refill IS 'Strategy is used for OPS wallet refills';
COMMENT ON COLUMN public.arbitrage_strategies.min_expected_profit_native IS 'Minimum profit threshold in native token base units';
COMMENT ON COLUMN public.arbitrage_strategies.min_profit_to_gas_ratio IS 'Profit must exceed this multiple of gas cost';
COMMENT ON COLUMN public.arbitrage_strategies.max_daily_loss_native IS 'Maximum allowed daily loss per strategy in native units';
COMMENT ON COLUMN public.arbitrage_strategies.max_trades_per_day IS 'Maximum number of trades allowed per day';
COMMENT ON COLUMN public.arbitrage_strategies.max_trade_value_native IS 'Maximum notional value per trade in native units';