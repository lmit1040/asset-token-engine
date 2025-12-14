import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  'approve-transfer': { maxRequests: 10, windowSeconds: 60 },
  'transfer-solana-token': { maxRequests: 5, windowSeconds: 60 },
  'record-nda-signature': { maxRequests: 3, windowSeconds: 60 },
  'execute-arbitrage': { maxRequests: 10, windowSeconds: 60 },
  'execute-evm-arbitrage': { maxRequests: 10, windowSeconds: 60 },
  'execute-evm-flash-arbitrage': { maxRequests: 10, windowSeconds: 60 },
  'send-treasury-tokens': { maxRequests: 5, windowSeconds: 60 },
  'mint-to-treasury': { maxRequests: 5, windowSeconds: 60 },
  'default': { maxRequests: 30, windowSeconds: 60 },
};

export async function checkRateLimit(
  req: Request,
  endpoint: string,
  customConfig?: RateLimitConfig
): Promise<RateLimitResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get IP from request headers
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || req.headers.get('x-real-ip') 
    || 'unknown';

  const config = customConfig || DEFAULT_LIMITS[endpoint] || DEFAULT_LIMITS['default'];
  const windowStart = new Date(Date.now() - config.windowSeconds * 1000);

  // Count requests in current window
  const { data: existingRecords, error: fetchError } = await supabase
    .from('rate_limit_tracking')
    .select('id, request_count')
    .eq('ip_address', ip)
    .eq('endpoint', endpoint)
    .gte('window_start', windowStart.toISOString())
    .order('window_start', { ascending: false })
    .limit(1);

  if (fetchError) {
    console.error('Rate limit check error:', fetchError);
    // Allow request on error to avoid blocking legitimate users
    return { allowed: true, remaining: config.maxRequests, resetAt: new Date(Date.now() + config.windowSeconds * 1000) };
  }

  const currentCount = existingRecords?.[0]?.request_count || 0;
  const resetAt = new Date(Date.now() + config.windowSeconds * 1000);

  if (currentCount >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Increment or create rate limit record
  if (existingRecords && existingRecords.length > 0) {
    await supabase
      .from('rate_limit_tracking')
      .update({ request_count: currentCount + 1 })
      .eq('id', existingRecords[0].id);
  } else {
    await supabase
      .from('rate_limit_tracking')
      .insert({
        ip_address: ip,
        endpoint,
        request_count: 1,
        window_start: new Date().toISOString(),
      });
  }

  // Periodically cleanup old records (1% chance per request)
  if (Math.random() < 0.01) {
    try {
      await supabase.rpc('cleanup_old_rate_limits');
    } catch {
      // Ignore cleanup errors
    }
  }

  return {
    allowed: true,
    remaining: config.maxRequests - currentCount - 1,
    resetAt,
  };
}

export function rateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': result.resetAt.toISOString(),
      },
    }
  );
}
