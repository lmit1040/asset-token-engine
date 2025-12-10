import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  imageUrl?: string;
}

interface FeedSource {
  url: string;
  name: string;
  category: string;
}

// Regex-based XML parsing (works reliably in Deno Edge Runtime)
function extractTagContent(xml: string, tagName: string): string {
  // Handle CDATA sections
  const cdataPattern = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`, 'i');
  const cdataMatch = xml.match(cdataPattern);
  if (cdataMatch) {
    return cdataMatch[1].trim();
  }
  
  // Handle regular content
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? match[1].trim() : '';
}

function extractItems(xml: string): string[] {
  const items: string[] = [];
  const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemPattern.exec(xml)) !== null) {
    items.push(match[1]);
  }
  return items;
}

function extractImageUrl(itemXml: string): string | undefined {
  // Try media:content
  const mediaMatch = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaMatch) return mediaMatch[1];
  
  // Try enclosure
  const enclosureMatch = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i);
  if (enclosureMatch) return enclosureMatch[1];
  
  // Try image in description
  const description = extractTagContent(itemXml, 'description');
  const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) return imgMatch[1];
  
  // Try media:thumbnail
  const thumbMatch = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (thumbMatch) return thumbMatch[1];
  
  return undefined;
}

function parseRSSItem(itemXml: string, source: string): RSSItem | null {
  try {
    const title = extractTagContent(itemXml, 'title');
    const link = extractTagContent(itemXml, 'link');
    const description = extractTagContent(itemXml, 'description');
    const pubDate = extractTagContent(itemXml, 'pubDate');
    const imageUrl = extractImageUrl(itemXml);

    if (!title || !link) return null;

    // Strip HTML tags from description
    const cleanDescription = description
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .slice(0, 200);

    return {
      title,
      link,
      description: cleanDescription,
      pubDate,
      source,
      imageUrl,
    };
  } catch (e) {
    console.error('Error parsing RSS item:', e);
    return null;
  }
}

async function fetchFeed(feedUrl: string, source: string): Promise<RSSItem[]> {
  try {
    console.log(`Fetching RSS feed: ${feedUrl}`);
    
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'MetallumX RSS Reader/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${feedUrl}: ${response.status}`);
      return [];
    }

    const text = await response.text();
    const items = extractItems(text);
    const parsedItems: RSSItem[] = [];
    
    for (const itemXml of items) {
      const parsed = parseRSSItem(itemXml, source);
      if (parsed) {
        parsedItems.push(parsed);
      }
    }

    console.log(`Parsed ${parsedItems.length} items from ${source}`);
    return parsedItems;
  } catch (e) {
    console.error(`Error fetching feed ${feedUrl}:`, e);
    return [];
  }
}

async function getActiveFeeds(): Promise<FeedSource[]> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data, error } = await supabase
      .from('rss_feed_sources')
      .select('url, name, category')
      .eq('is_active', true);
    
    if (error) {
      console.error('Error fetching feed sources from DB:', error);
      return [];
    }
    
    console.log(`Found ${data?.length || 0} active feed sources in database`);
    return data || [];
  } catch (e) {
    console.error('Error connecting to database:', e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = body.limit || 20;
    const testUrl = body.testUrl;

    // If testUrl is provided, only test that single URL
    if (testUrl) {
      console.log(`Testing single RSS feed URL: ${testUrl}`);
      const articles = await fetchFeed(testUrl, 'Test Feed');
      
      return new Response(
        JSON.stringify({ 
          success: articles.length > 0, 
          articles: articles.slice(0, 5),
          message: articles.length > 0 
            ? `Successfully fetched ${articles.length} articles` 
            : 'No articles found or invalid RSS feed',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get feeds from database
    const dbFeeds = await getActiveFeeds();
    
    // Use database feeds if available, otherwise use defaults
    const feedsToFetch = dbFeeds.length > 0 
      ? dbFeeds.map(f => ({ url: f.url, source: f.name }))
      : [
          { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
          { url: 'https://decrypt.co/feed', source: 'Decrypt' },
          { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
        ];

    console.log(`Fetching ${feedsToFetch.length} RSS feeds`);

    // Fetch all feeds in parallel
    const feedPromises = feedsToFetch.map(feed => fetchFeed(feed.url, feed.source));
    const results = await Promise.all(feedPromises);

    // Flatten and sort by date
    let allItems = results.flat();
    
    // Sort by publication date (newest first)
    allItems.sort((a, b) => {
      const dateA = new Date(a.pubDate).getTime() || 0;
      const dateB = new Date(b.pubDate).getTime() || 0;
      return dateB - dateA;
    });

    // Limit results
    allItems = allItems.slice(0, limit);

    console.log(`Returning ${allItems.length} total items`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        items: allItems,
        feedCount: feedsToFetch.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in fetch-rss-feeds:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        items: [],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
