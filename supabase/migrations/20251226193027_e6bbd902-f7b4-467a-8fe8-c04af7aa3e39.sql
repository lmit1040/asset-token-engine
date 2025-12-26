-- Add launch_stage column to system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS launch_stage TEXT DEFAULT 'DEVELOPMENT';

ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS last_safety_check_at TIMESTAMPTZ;

-- Update system settings with safe launch defaults
-- Enable safe mode and lock execution before going live
UPDATE public.system_settings 
SET 
  safe_mode_enabled = true,
  arb_execution_locked = true,
  arb_execution_locked_reason = 'Pre-launch lockdown - requires manual unlock after safety verification',
  arb_execution_locked_at = now(),
  max_global_daily_loss_native = 0.5,
  launch_stage = 'PRE_LAUNCH',
  last_safety_check_at = now()
WHERE id IS NOT NULL;