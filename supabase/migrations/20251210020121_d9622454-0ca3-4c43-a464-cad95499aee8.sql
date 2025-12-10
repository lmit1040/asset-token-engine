-- Create system_settings table for global automation controls (singleton pattern)

CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_arbitrage_enabled boolean NOT NULL DEFAULT false,
  auto_flash_loans_enabled boolean NOT NULL DEFAULT false,
  safe_mode_enabled boolean NOT NULL DEFAULT false,
  max_global_daily_loss_native bigint NOT NULL DEFAULT 0,
  max_global_trades_per_day integer NOT NULL DEFAULT 50,
  safe_mode_triggered_at timestamp with time zone DEFAULT NULL,
  safe_mode_reason text DEFAULT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) DEFAULT NULL
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view system settings"
ON public.system_settings
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update system settings"
ON public.system_settings
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert system settings"
ON public.system_settings
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default singleton row
INSERT INTO public.system_settings (id) 
VALUES ('00000000-0000-0000-0000-000000000001');

-- Helper function for edge functions (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_system_settings()
RETURNS public.system_settings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.system_settings LIMIT 1;
$$;

-- Comments
COMMENT ON TABLE public.system_settings IS 'Global automation settings (singleton row)';
COMMENT ON COLUMN public.system_settings.safe_mode_enabled IS 'When true, all auto-execution is halted';
COMMENT ON COLUMN public.system_settings.safe_mode_triggered_at IS 'Timestamp when safe mode was triggered';
COMMENT ON COLUMN public.system_settings.safe_mode_reason IS 'Reason for safe mode activation';
COMMENT ON FUNCTION public.get_system_settings IS 'Returns global system settings for edge functions';