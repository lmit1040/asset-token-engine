import { useState, useEffect } from 'react';
import { Newspaper, ExternalLink, RefreshCw, Pin, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  imageUrl?: string;
}

interface NewsArticle {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  image_url: string | null;
  category: string;
  is_pinned: boolean;
  published_at: string;
  created_at: string;
}

export const NewsSection = () => {
  const [rssItems, setRssItems] = useState<RSSItem[]>([]);
  const [customArticles, setCustomArticles] = useState<NewsArticle[]>([]);
  const [isLoadingRss, setIsLoadingRss] = useState(true);
  const [isLoadingArticles, setIsLoadingArticles] = useState(true);
  const [rssError, setRssError] = useState<string | null>(null);

  const fetchRssFeeds = async () => {
    setIsLoadingRss(true);
    setRssError(null);
    
    try {
      console.log('Fetching RSS feeds...');
      const { data, error } = await supabase.functions.invoke('fetch-rss-feeds', {
        body: { limit: 15 }
      });

      console.log('RSS response:', { data, error });

      if (error) throw error;

      if (data?.success && data?.items) {
        setRssItems(data.items);
        console.log(`Loaded ${data.items.length} RSS items`);
      } else if (data?.items) {
        setRssItems(data.items);
      } else {
        console.warn('RSS response missing items:', data);
        setRssError('No news articles available');
      }
    } catch (err) {
      console.error('Error fetching RSS feeds:', err);
      setRssError('Unable to load news feeds');
    } finally {
      setIsLoadingRss(false);
    }
  };

  const fetchCustomArticles = async () => {
    setIsLoadingArticles(true);
    
    try {
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .eq('is_published', true)
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setCustomArticles((data as NewsArticle[]) || []);
    } catch (err) {
      console.error('Error fetching custom articles:', err);
    } finally {
      setIsLoadingArticles(false);
    }
  };

  useEffect(() => {
    fetchRssFeeds();
    fetchCustomArticles();

    // Refresh RSS every 5 minutes
    const interval = setInterval(fetchRssFeeds, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  const NewsItemSkeleton = () => (
    <div className="flex gap-3 p-3 border-b border-border/50 last:border-0">
      <Skeleton className="h-16 w-16 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );

  const RSSNewsItem = ({ item }: { item: RSSItem }) => (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors group"
    >
      {item.imageUrl && (
        <div className="h-16 w-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
          <img
            src={item.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
          {item.description}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className="text-xs py-0">
            {item.source}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(item.pubDate)}
          </span>
          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
        </div>
      </div>
    </a>
  );

  const CustomNewsItem = ({ article }: { article: NewsArticle }) => (
    <div className="p-3 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        {article.image_url && (
          <div className="h-16 w-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
            <img
              src={article.image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {article.is_pinned && (
              <Pin className="h-3 w-3 text-primary flex-shrink-0" />
            )}
            <h4 className="text-sm font-medium text-foreground line-clamp-2">
              {article.title}
            </h4>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
            {article.summary || article.content.slice(0, 150)}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs py-0">
              {article.category}
            </Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(article.published_at || article.created_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Newspaper className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">News & Updates</CardTitle>
              <p className="text-sm text-muted-foreground">
                Latest crypto news and platform updates
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              fetchRssFeeds();
              fetchCustomArticles();
            }}
            disabled={isLoadingRss}
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingRss ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="platform">Platform</TabsTrigger>
            <TabsTrigger value="crypto">Crypto News</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-0">
            <ScrollArea className="h-[400px]">
              {/* Pinned custom articles first */}
              {customArticles.filter(a => a.is_pinned).map(article => (
                <CustomNewsItem key={article.id} article={article} />
              ))}
              
              {/* Mix of RSS and custom articles */}
              {isLoadingRss || isLoadingArticles ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <NewsItemSkeleton key={i} />
                ))
              ) : rssError && customArticles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <p>{rssError}</p>
                </div>
              ) : (
                <>
                  {customArticles.filter(a => !a.is_pinned).map(article => (
                    <CustomNewsItem key={article.id} article={article} />
                  ))}
                  {rssItems.map((item, index) => (
                    <RSSNewsItem key={`${item.link}-${index}`} item={item} />
                  ))}
                </>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="platform" className="mt-0">
            <ScrollArea className="h-[400px]">
              {isLoadingArticles ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <NewsItemSkeleton key={i} />
                ))
              ) : customArticles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <p>No platform updates yet</p>
                </div>
              ) : (
                customArticles.map(article => (
                  <CustomNewsItem key={article.id} article={article} />
                ))
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="crypto" className="mt-0">
            <ScrollArea className="h-[400px]">
              {isLoadingRss ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <NewsItemSkeleton key={i} />
                ))
              ) : rssError ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <p>{rssError}</p>
                </div>
              ) : (
                rssItems.map((item, index) => (
                  <RSSNewsItem key={`${item.link}-${index}`} item={item} />
                ))
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
