import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type ActionType =
  // Asset actions
  | 'asset_created'
  | 'asset_updated'
  | 'asset_archived'
  | 'asset_restored'
  // Proof actions
  | 'proof_uploaded'
  | 'proof_verified'
  // Token actions
  | 'token_created'
  | 'token_deployed'
  | 'token_archived'
  | 'tokens_assigned'
  | 'tokens_transferred'
  | 'tokens_minted'
  // Transfer actions
  | 'transfer_requested'
  | 'transfer_approved'
  | 'transfer_rejected'
  | 'transfer_cancelled'
  // Arbitrage actions
  | 'arbitrage_scanned'
  | 'arbitrage_approved'
  | 'arbitrage_executed'
  | 'arbitrage_failed'
  // Flash loan actions
  | 'flash_loan_executed'
  | 'flash_loan_failed'
  // Wallet actions
  | 'fee_payer_created'
  | 'fee_payer_topped_up'
  | 'wallet_refill_requested'
  | 'wallet_refill_completed'
  // System actions
  | 'safe_mode_triggered'
  | 'safe_mode_cleared'
  | 'mainnet_mode_enabled'
  | 'mainnet_mode_disabled'
  | 'settings_updated'
  // User actions
  | 'nda_signed'
  | 'nda_blockchain_recorded'
  | 'user_registered'
  | 'role_assigned'
  // Submission actions
  | 'submission_created'
  | 'submission_reviewed'
  | 'submission_approved'
  | 'submission_rejected';

export type EntityType =
  | 'asset'
  | 'token_definition'
  | 'proof_of_reserve'
  | 'user_token_holding'
  | 'transfer_request'
  | 'arbitrage_run'
  | 'arbitrage_strategy'
  | 'flash_loan_provider'
  | 'fee_payer'
  | 'evm_fee_payer'
  | 'wallet_refill_request'
  | 'system_settings'
  | 'nda_signature'
  | 'user'
  | 'user_asset_submission';

interface LogActivityParams {
  actionType: ActionType;
  entityType: EntityType;
  entityId?: string;
  entityName?: string;
  performedBy?: string;
  details?: Record<string, unknown>;
}

export async function logActivity({
  actionType,
  entityType,
  entityId,
  entityName,
  performedBy,
  details,
}: LogActivityParams): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase.from('activity_logs').insert([{
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      performed_by: performedBy,
      details: details || null,
    }]);
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// Helper for edge functions to log with request context
export async function logEdgeFunctionActivity(
  req: Request,
  params: Omit<LogActivityParams, 'performedBy'> & { userId?: string }
): Promise<void> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || req.headers.get('x-real-ip') 
    || 'unknown';

  await logActivity({
    ...params,
    performedBy: params.userId,
    details: {
      ...params.details,
      ip_address: ip,
      user_agent: req.headers.get('user-agent') || 'unknown',
    },
  });
}
