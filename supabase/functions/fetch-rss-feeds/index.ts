import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

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

// Default crypto/finance RSS feeds
const DEFAULT_FEEDS = [
  { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph' },
  { url: 'https://decrypt.co/feed', source: 'Decrypt' },
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'CoinDesk' },
];

function getElementText(parent: Element, tagName: string): string {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.textContent?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
}

function parseRSSItem(item: Element, source: string): RSSItem | null {
  try {
    const title = getElementText(item, 'title');
    const link = getElementText(item, 'link');
    const description = getElementText(item, 'description');
    const pubDate = getElementText(item, 'pubDate');
    
    // Try to extract image from description HTML
    let imageUrl: string | undefined;
    if (description) {
      const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) {
        imageUrl = imgMatch[1];
      }
    }

    // Try enclosure
    const enclosure = item.getElementsByTagName('enclosure')[0];
    if (!imageUrl && enclosure) {
      const encUrl = enclosure.getAttribute('url');
      const encType = enclosure.getAttribute('type');
      if (encUrl && encType?.startsWith('image')) {
        imageUrl = encUrl;
      }
    }

    if (!title || !link) return null;

    return {
      title,
      link,
      description: description.replace(/<[^>]*>/g, '').slice(0, 200),
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
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${feedUrl}: ${response.status}`);
      return [];
    }

    const text = await response.text();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    
    if (!doc) {
      console.error(`Failed to parse XML from ${feedUrl}`);
      return [];
    }

    const items = doc.getElementsByTagName('item');
    const parsedItems: RSSItem[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const parsed = parseRSSItem(item as Element, source);
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const customFeeds = body.feeds as { url: string; source: string }[] | undefined;
    const limit = body.limit || 20;

    const feedsToFetch = customFeeds && customFeeds.length > 0 ? customFeeds : DEFAULT_FEEDS;

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
