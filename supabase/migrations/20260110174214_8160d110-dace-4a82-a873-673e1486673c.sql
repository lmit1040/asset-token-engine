-- Enable realtime for user_token_holdings and activity_rewards tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_token_holdings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_rewards;