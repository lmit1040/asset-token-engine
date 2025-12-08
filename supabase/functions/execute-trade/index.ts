import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MatchOrderRequest {
  order_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { order_id } = await req.json() as MatchOrderRequest;

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: 'order_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing order matching for order: ${order_id}`);

    // Fetch the new order
    const { data: newOrder, error: orderError } = await supabase
      .from('marketplace_orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !newOrder) {
      console.error('Order not found:', orderError);
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (newOrder.status !== 'OPEN' && newOrder.status !== 'PARTIALLY_FILLED') {
      return new Response(
        JSON.stringify({ message: 'Order is not open for matching' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isBuyOrder = newOrder.order_type === 'BUY';
    const remainingQuantity = Number(newOrder.quantity) - Number(newOrder.filled_quantity);

    // Find matching orders
    // For BUY: find SELL orders with price <= buy_price, sorted by price ASC (lowest first), then by time
    // For SELL: find BUY orders with price >= sell_price, sorted by price DESC (highest first), then by time
    const matchQuery = supabase
      .from('marketplace_orders')
      .select('*')
      .eq('token_definition_id', newOrder.token_definition_id)
      .eq('order_type', isBuyOrder ? 'SELL' : 'BUY')
      .in('status', ['OPEN', 'PARTIALLY_FILLED'])
      .neq('user_id', newOrder.user_id); // Can't trade with yourself

    if (isBuyOrder) {
      matchQuery.lte('price_per_token', newOrder.price_per_token);
      matchQuery.order('price_per_token', { ascending: true });
    } else {
      matchQuery.gte('price_per_token', newOrder.price_per_token);
      matchQuery.order('price_per_token', { ascending: false });
    }
    matchQuery.order('created_at', { ascending: true });

    const { data: matchingOrders, error: matchError } = await matchQuery;

    if (matchError) {
      console.error('Error fetching matching orders:', matchError);
      throw matchError;
    }

    console.log(`Found ${matchingOrders?.length || 0} potential matches`);

    let filledSoFar = Number(newOrder.filled_quantity);
    const trades: any[] = [];

    for (const matchOrder of matchingOrders || []) {
      if (filledSoFar >= Number(newOrder.quantity)) break;

      const matchRemaining = Number(matchOrder.quantity) - Number(matchOrder.filled_quantity);
      const tradeQuantity = Math.min(remainingQuantity - (filledSoFar - Number(newOrder.filled_quantity)), matchRemaining);

      if (tradeQuantity <= 0) continue;

      // Execute trade at the maker's price (the order that was already in the book)
      const tradePrice = Number(matchOrder.price_per_token);

      const buyOrderId = isBuyOrder ? newOrder.id : matchOrder.id;
      const sellOrderId = isBuyOrder ? matchOrder.id : newOrder.id;
      const buyerId = isBuyOrder ? newOrder.user_id : matchOrder.user_id;
      const sellerId = isBuyOrder ? matchOrder.user_id : newOrder.user_id;

      console.log(`Executing trade: ${tradeQuantity} tokens at $${tradePrice}`);

      // Create trade record
      const { data: trade, error: tradeError } = await supabase
        .from('marketplace_trades')
        .insert({
          buy_order_id: buyOrderId,
          sell_order_id: sellOrderId,
          buyer_id: buyerId,
          seller_id: sellerId,
          token_definition_id: newOrder.token_definition_id,
          quantity: tradeQuantity,
          price_per_token: tradePrice,
        })
        .select()
        .single();

      if (tradeError) {
        console.error('Error creating trade:', tradeError);
        throw tradeError;
      }

      trades.push(trade);

      // Update the matching order
      const matchNewFilled = Number(matchOrder.filled_quantity) + tradeQuantity;
      const matchNewStatus = matchNewFilled >= Number(matchOrder.quantity) ? 'FILLED' : 'PARTIALLY_FILLED';
      
      await supabase
        .from('marketplace_orders')
        .update({ 
          filled_quantity: matchNewFilled,
          status: matchNewStatus,
        })
        .eq('id', matchOrder.id);

      filledSoFar += tradeQuantity;

      // Transfer tokens: decrease seller's balance, increase buyer's balance
      // Get seller's holding
      const { data: sellerHolding } = await supabase
        .from('user_token_holdings')
        .select('*')
        .eq('user_id', sellerId)
        .eq('token_definition_id', newOrder.token_definition_id)
        .maybeSingle();

      if (sellerHolding) {
        const newSellerBalance = Number(sellerHolding.balance) - tradeQuantity;
        await supabase
          .from('user_token_holdings')
          .update({ balance: newSellerBalance })
          .eq('id', sellerHolding.id);
      }

      // Get or create buyer's holding
      const { data: buyerHolding } = await supabase
        .from('user_token_holdings')
        .select('*')
        .eq('user_id', buyerId)
        .eq('token_definition_id', newOrder.token_definition_id)
        .maybeSingle();

      if (buyerHolding) {
        const newBuyerBalance = Number(buyerHolding.balance) + tradeQuantity;
        await supabase
          .from('user_token_holdings')
          .update({ balance: newBuyerBalance })
          .eq('id', buyerHolding.id);
      } else {
        await supabase
          .from('user_token_holdings')
          .insert({
            user_id: buyerId,
            token_definition_id: newOrder.token_definition_id,
            balance: tradeQuantity,
          });
      }

      // Log to activity
      await supabase.from('activity_logs').insert({
        action_type: 'tokens_transferred',
        entity_type: 'user_token_holding',
        entity_id: newOrder.token_definition_id,
        entity_name: `Marketplace Trade`,
        performed_by: buyerId,
        details: {
          trade_id: trade.id,
          quantity: tradeQuantity,
          price: tradePrice,
          buyer_id: buyerId,
          seller_id: sellerId,
        },
      });
    }

    // Update the new order status
    const newOrderFilled = filledSoFar;
    const newOrderStatus = newOrderFilled >= Number(newOrder.quantity) ? 'FILLED' : 
                           newOrderFilled > Number(newOrder.filled_quantity) ? 'PARTIALLY_FILLED' : newOrder.status;

    await supabase
      .from('marketplace_orders')
      .update({
        filled_quantity: newOrderFilled,
        status: newOrderStatus,
      })
      .eq('id', order_id);

    console.log(`Order matching complete. Trades executed: ${trades.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        trades_executed: trades.length,
        order_status: newOrderStatus,
        filled_quantity: newOrderFilled,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in execute-trade:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
