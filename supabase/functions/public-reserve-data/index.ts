import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublicReserveSummary {
  assetType: string;
  totalQuantity: number;
  unit: string;
  verifiedCount: number;
}

interface PublicTokenBacking {
  tokenSymbol: string;
  tokenName: string;
  contractAddress: string | null;
  chain: string;
  network: string;
  assetType: string;
  backingQuantity: number;
  isVerified: boolean;
}

interface PublicAttestation {
  date: string;
  assetType: string;
  status: string;
}

interface PublicReserveData {
  summary: PublicReserveSummary[];
  tokenBacking: PublicTokenBacking[];
  recentAttestations: PublicAttestation[];
  lastVerifiedAt: string | null;
  totalVerifiedAssets: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch assets (excluding sensitive fields)
    const { data: assets, error: assetsError } = await supabase
      .from('assets')
      .select('id, asset_type, name, quantity, unit')
      .is('archived_at', null);

    if (assetsError) {
      console.error('Error fetching assets:', assetsError);
      throw assetsError;
    }

    // Fetch attestations (excluding sensitive fields like notes, attested_by)
    const { data: attestations, error: attestationsError } = await supabase
      .from('attestations')
      .select('asset_id, attestation_date, status')
      .order('attestation_date', { ascending: false });

    if (attestationsError) {
      console.error('Error fetching attestations:', attestationsError);
      throw attestationsError;
    }

    // Fetch token definitions (excluding sensitive fields)
    const { data: tokens, error: tokensError } = await supabase
      .from('token_definitions')
      .select('id, token_symbol, token_name, contract_address, chain, network, asset_id, total_supply, deployment_status')
      .is('archived_at', null);

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      throw tokensError;
    }

    // Create asset ID to attestation status map
    const assetAttestationMap = new Map<string, boolean>();
    attestations?.forEach(att => {
      if (att.status === 'ATTESTED') {
        assetAttestationMap.set(att.asset_id, true);
      }
    });

    // Build summary by asset type (aggregate only, no individual asset details)
    const summaryMap = new Map<string, PublicReserveSummary>();
    assets?.forEach(asset => {
      const key = asset.asset_type;
      const existing = summaryMap.get(key);
      const isVerified = assetAttestationMap.has(asset.id);
      
      if (existing) {
        existing.totalQuantity += Number(asset.quantity);
        if (isVerified) existing.verifiedCount += 1;
      } else {
        summaryMap.set(key, {
          assetType: asset.asset_type,
          totalQuantity: Number(asset.quantity),
          unit: asset.unit,
          verifiedCount: isVerified ? 1 : 0,
        });
      }
    });

    // Build token backing data (public-safe fields only)
    const assetMap = new Map(assets?.map(a => [a.id, a]) || []);
    const tokenBacking: PublicTokenBacking[] = (tokens || []).map(token => {
      const asset = assetMap.get(token.asset_id);
      return {
        tokenSymbol: token.token_symbol,
        tokenName: token.token_name,
        contractAddress: token.deployment_status === 'DEPLOYED' ? token.contract_address : null,
        chain: token.chain,
        network: token.network,
        assetType: asset?.asset_type || 'UNKNOWN',
        backingQuantity: asset ? Number(asset.quantity) : 0,
        isVerified: assetAttestationMap.has(token.asset_id),
      };
    });

    // Build recent attestations (date and category only, no names or identifiers)
    const recentAttestations: PublicAttestation[] = (attestations || [])
      .slice(0, 10)
      .map(att => {
        const asset = assetMap.get(att.asset_id);
        return {
          date: att.attestation_date.split('T')[0], // Date only, no time
          assetType: asset?.asset_type || 'UNKNOWN',
          status: att.status,
        };
      });

    // Calculate totals
    const lastVerified = attestations?.find(a => a.status === 'ATTESTED');
    const totalVerifiedAssets = assetAttestationMap.size;

    const responseData: PublicReserveData = {
      summary: Array.from(summaryMap.values()),
      tokenBacking,
      recentAttestations,
      lastVerifiedAt: lastVerified?.attestation_date?.split('T')[0] || null,
      totalVerifiedAssets,
    };

    console.log('Public reserve data fetched successfully');

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in public-reserve-data:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch reserve data' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
