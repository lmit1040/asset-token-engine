-- Create table for RSS feed sources
CREATE TABLE public.rss_feed_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT DEFAULT 'crypto',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.rss_feed_sources ENABLE ROW LEVEL SECURITY;

-- Admin can manage feed sources
CREATE POLICY "Admins can manage RSS feed sources"
  ON public.rss_feed_sources
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default RSS feeds
INSERT INTO public.rss_feed_sources (name, url, category) VALUES
  ('CoinTelegraph', 'https://cointelegraph.com/rss', 'crypto'),
  ('Decrypt', 'https://decrypt.co/feed', 'crypto'),
  ('CoinDesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/', 'crypto');