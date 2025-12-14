import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { logEdgeFunctionActivity } from "../_shared/activity-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting
  const rateLimit = await checkRateLimit(req, 'approve-transfer');
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit, corsHeaders);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Create client with user's token to get authenticated user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create admin client for bypassing RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { requestId } = await req.json();
    if (!requestId) {
      return new Response(JSON.stringify({ error: 'Missing requestId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing transfer approval: ${requestId} by user ${user.id}`);

    // Fetch the transfer request
    const { data: request, error: requestError } = await adminClient
      .from('transfer_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      console.error('Failed to fetch transfer request:', requestError);
      return new Response(JSON.stringify({ error: 'Transfer request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller is the recipient
    if (request.to_user_id !== user.id) {
      console.error(`User ${user.id} is not the recipient ${request.to_user_id}`);
      return new Response(JSON.stringify({ error: 'Only the recipient can approve this transfer' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify request is still pending
    if (request.status !== 'PENDING') {
      return new Response(JSON.stringify({ error: `Transfer is already ${request.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch sender's current holding
    const { data: senderHolding, error: senderError } = await adminClient
      .from('user_token_holdings')
      .select('*')
      .eq('user_id', request.from_user_id)
      .eq('token_definition_id', request.token_definition_id)
      .maybeSingle();

    if (senderError) {
      console.error('Failed to fetch sender holding:', senderError);
      return new Response(JSON.stringify({ error: 'Failed to verify sender balance' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate sender's pending outgoing transfers (excluding this one)
    const { data: pendingTransfers, error: pendingError } = await adminClient
      .from('transfer_requests')
      .select('amount')
      .eq('from_user_id', request.from_user_id)
      .eq('token_definition_id', request.token_definition_id)
      .eq('status', 'PENDING')
      .neq('id', requestId);

    if (pendingError) {
      console.error('Failed to fetch pending transfers:', pendingError);
    }

    const otherPendingAmount = pendingTransfers?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const senderBalance = Number(senderHolding?.balance || 0);
    const availableBalance = senderBalance - otherPendingAmount;
    const requestAmount = Number(request.amount);

    console.log(`Sender balance: ${senderBalance}, other pending: ${otherPendingAmount}, available: ${availableBalance}, requested: ${requestAmount}`);

    if (availableBalance < requestAmount) {
      return new Response(JSON.stringify({ 
        error: `Sender has insufficient balance. Available: ${availableBalance}, Requested: ${request.amount}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduct from sender
    const newSenderBalance = senderBalance - requestAmount;
    console.log(`Updating sender balance from ${senderBalance} to ${newSenderBalance}`);
    const { error: deductError } = await adminClient
      .from('user_token_holdings')
      .update({ balance: newSenderBalance })
      .eq('id', senderHolding.id);

    if (deductError) {
      console.error('Failed to deduct from sender:', deductError);
      return new Response(JSON.stringify({ error: 'Failed to process transfer' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Add to recipient (create or update holding)
    const { data: recipientHolding } = await adminClient
      .from('user_token_holdings')
      .select('*')
      .eq('user_id', request.to_user_id)
      .eq('token_definition_id', request.token_definition_id)
      .maybeSingle();

    if (recipientHolding) {
      const currentRecipientBalance = Number(recipientHolding.balance);
      const newRecipientBalance = currentRecipientBalance + requestAmount;
      console.log(`Updating recipient balance from ${currentRecipientBalance} to ${newRecipientBalance}`);
      const { error: addError } = await adminClient
        .from('user_token_holdings')
        .update({ balance: newRecipientBalance })
        .eq('id', recipientHolding.id);

      if (addError) {
        // Rollback sender deduction
        await adminClient
          .from('user_token_holdings')
          .update({ balance: senderBalance })
          .eq('id', senderHolding.id);
        
        console.error('Failed to add to recipient:', addError);
        return new Response(JSON.stringify({ error: 'Failed to process transfer' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.log(`Creating new holding for recipient with balance ${requestAmount}`);
      const { error: createError } = await adminClient
        .from('user_token_holdings')
        .insert({
          user_id: request.to_user_id,
          token_definition_id: request.token_definition_id,
          balance: requestAmount,
          assigned_by: request.from_user_id,
        });

      if (createError) {
        // Rollback sender deduction
        await adminClient
          .from('user_token_holdings')
          .update({ balance: senderBalance })
          .eq('id', senderHolding.id);
        
        console.error('Failed to create recipient holding:', createError);
        return new Response(JSON.stringify({ error: 'Failed to process transfer' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Update transfer request status
    const { error: updateError } = await adminClient
      .from('transfer_requests')
      .update({ 
        status: 'APPROVED', 
        resolved_at: new Date().toISOString() 
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Failed to update transfer status:', updateError);
      // Note: Transfer already happened, just status update failed
    }

    console.log(`Transfer ${requestId} approved successfully`);

    // Log the activity
    await logEdgeFunctionActivity(req, {
      actionType: 'transfer_approved',
      entityType: 'transfer_request',
      entityId: requestId,
      userId: user.id,
      details: {
        from_user_id: request.from_user_id,
        to_user_id: request.to_user_id,
        token_definition_id: request.token_definition_id,
        amount: request.amount,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
