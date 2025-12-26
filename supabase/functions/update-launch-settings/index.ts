import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LaunchSettingsUpdate {
  safe_mode_enabled?: boolean;
  arb_execution_locked?: boolean;
  arb_execution_locked_reason?: string | null;
  is_mainnet_mode?: boolean;
  launch_stage?: string;
  auto_arbitrage_enabled?: boolean;
  auto_flash_loans_enabled?: boolean;
}

type SettingKey = keyof LaunchSettingsUpdate;

const ALLOWED_KEYS: SettingKey[] = [
  'safe_mode_enabled',
  'arb_execution_locked',
  'arb_execution_locked_reason',
  'is_mainnet_mode',
  'launch_stage',
  'auto_arbitrage_enabled',
  'auto_flash_loans_enabled',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user is admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { updates, confirmationPhrase, action } = body as {
      updates: LaunchSettingsUpdate;
      confirmationPhrase?: string;
      action?: string;
    };

    // Validate updates contain only allowed keys
    const sanitizedUpdates: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      if (ALLOWED_KEYS.includes(key as SettingKey)) {
        sanitizedUpdates[key] = updates[key as SettingKey];
      }
    }

    // Critical actions require confirmation phrase
    const criticalActions = ['enable_mainnet', 'unlock_execution', 'disable_safe_mode'];
    if (action && criticalActions.includes(action)) {
      const expectedPhrases: Record<string, string> = {
        'enable_mainnet': 'I CONFIRM MAINNET',
        'unlock_execution': 'UNLOCK EXECUTION',
        'disable_safe_mode': 'DISABLE SAFE MODE',
      };

      if (confirmationPhrase !== expectedPhrases[action]) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid confirmation phrase',
            expected: expectedPhrases[action],
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Add timestamps for specific updates
    if ('arb_execution_locked' in sanitizedUpdates) {
      if (sanitizedUpdates.arb_execution_locked) {
        sanitizedUpdates.arb_execution_locked_at = new Date().toISOString();
      } else {
        sanitizedUpdates.arb_execution_locked_at = null;
        sanitizedUpdates.arb_execution_locked_reason = null;
      }
    }

    if ('safe_mode_enabled' in sanitizedUpdates && !sanitizedUpdates.safe_mode_enabled) {
      sanitizedUpdates.safe_mode_triggered_at = null;
      sanitizedUpdates.safe_mode_reason = null;
    }

    // Get current settings before update
    const { data: currentSettings } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .single();

    // Apply updates
    const { data: updatedSettings, error: updateError } = await supabase
      .from('system_settings')
      .update({
        ...sanitizedUpdates,
        last_safety_check_at: new Date().toISOString(),
      })
      .eq('id', currentSettings.id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update settings', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the activity
    const changedFields = Object.keys(sanitizedUpdates);
    await supabase.from('activity_logs').insert({
      action_type: 'settings_updated',
      entity_type: 'system_settings',
      entity_id: currentSettings.id,
      performed_by: user.id,
      details: {
        action: action || 'manual_update',
        changed_fields: changedFields,
        previous_values: changedFields.reduce((acc, key) => {
          acc[key] = currentSettings[key];
          return acc;
        }, {} as Record<string, unknown>),
        new_values: sanitizedUpdates,
      },
    });

    console.log(`[update-launch-settings] User ${user.email} updated: ${changedFields.join(', ')}`);

    return new Response(
      JSON.stringify({
        success: true,
        settings: updatedSettings,
        changedFields,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in update-launch-settings:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
