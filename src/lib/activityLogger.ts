import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

type ActionType = 
  | 'asset_created' 
  | 'asset_updated' 
  | 'proof_uploaded' 
  | 'token_created' 
  | 'tokens_assigned'
  | 'tokens_transferred';

type EntityType = 
  | 'asset' 
  | 'token_definition' 
  | 'proof_of_reserve' 
  | 'user_token_holding';

interface LogActivityParams {
  actionType: ActionType;
  entityType: EntityType;
  entityId?: string;
  entityName?: string;
  details?: Json;
}

export async function logActivity({
  actionType,
  entityType,
  entityId,
  entityName,
  details,
}: LogActivityParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    await supabase.from('activity_logs').insert([{
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      performed_by: user?.id,
      details: details || null,
    }]);
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}
