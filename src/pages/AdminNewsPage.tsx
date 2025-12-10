import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Pin, PinOff, Eye, EyeOff, Newspaper, Rss, Power, PowerOff } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';

interface NewsArticle {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  image_url: string | null;
  category: string;
  is_published: boolean;
  is_pinned: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RssFeedSource {
  id: string;
  name: string;
  url: string;
  category: string;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'platform', label: 'Platform Update' },
  { value: 'feature', label: 'New Feature' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'token', label: 'Token News' },
  { value: 'governance', label: 'Governance' },
];

const FEED_CATEGORIES = [
  { value: 'crypto', label: 'Crypto' },
  { value: 'finance', label: 'Finance' },
  { value: 'technology', label: 'Technology' },
  { value: 'markets', label: 'Markets' },
];

export default function AdminNewsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Articles state
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteArticleId, setDeleteArticleId] = useState<string | null>(null);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  
  // RSS feeds state
  const [feeds, setFeeds] = useState<RssFeedSource[]>([]);
  const [isFeedsLoading, setIsFeedsLoading] = useState(true);
  const [isFeedDialogOpen, setIsFeedDialogOpen] = useState(false);
  const [deleteFeedId, setDeleteFeedId] = useState<string | null>(null);
  const [editingFeed, setEditingFeed] = useState<RssFeedSource | null>(null);
  
  // Article form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    summary: '',
    image_url: '',
    category: 'general',
    is_published: false,
    is_pinned: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Feed form state
  const [feedFormData, setFeedFormData] = useState({
    name: '',
    url: '',
    category: 'crypto',
    is_active: true,
  });
  const [isFeedSaving, setIsFeedSaving] = useState(false);

  const fetchArticles = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('news_articles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setArticles((data as NewsArticle[]) || []);
    } catch (err) {
      console.error('Error fetching articles:', err);
      toast({
        title: 'Error',
        description: 'Failed to load articles',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFeeds = async () => {
    setIsFeedsLoading(true);
    try {
      const { data, error } = await supabase
        .from('rss_feed_sources')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFeeds((data as RssFeedSource[]) || []);
    } catch (err) {
      console.error('Error fetching feeds:', err);
      toast({
        title: 'Error',
        description: 'Failed to load RSS feeds',
        variant: 'destructive',
      });
    } finally {
      setIsFeedsLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
    fetchFeeds();
  }, []);

  // Article functions
  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      summary: '',
      image_url: '',
      category: 'general',
      is_published: false,
      is_pinned: false,
    });
    setEditingArticle(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (article: NewsArticle) => {
    setEditingArticle(article);
    setFormData({
      title: article.title,
      content: article.content,
      summary: article.summary || '',
      image_url: article.image_url || '',
      category: article.category,
      is_published: article.is_published,
      is_pinned: article.is_pinned,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Title and content are required',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const articleData = {
        title: formData.title.trim(),
        content: formData.content.trim(),
        summary: formData.summary.trim() || null,
        image_url: formData.image_url.trim() || null,
        category: formData.category,
        is_published: formData.is_published,
        is_pinned: formData.is_pinned,
        published_at: formData.is_published ? new Date().toISOString() : null,
      };

      if (editingArticle) {
        const { error } = await supabase
          .from('news_articles')
          .update(articleData)
          .eq('id', editingArticle.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Article updated successfully' });
      } else {
        const { error } = await supabase
          .from('news_articles')
          .insert({
            ...articleData,
            created_by: user?.id,
          });

        if (error) throw error;
        toast({ title: 'Success', description: 'Article created successfully' });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchArticles();
    } catch (err) {
      console.error('Error saving article:', err);
      toast({
        title: 'Error',
        description: 'Failed to save article',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteArticleId) return;

    try {
      const { error } = await supabase
        .from('news_articles')
        .delete()
        .eq('id', deleteArticleId);

      if (error) throw error;
      toast({ title: 'Success', description: 'Article deleted successfully' });
      fetchArticles();
    } catch (err) {
      console.error('Error deleting article:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete article',
        variant: 'destructive',
      });
    } finally {
      setDeleteArticleId(null);
    }
  };

  const togglePublished = async (article: NewsArticle) => {
    try {
      const { error } = await supabase
        .from('news_articles')
        .update({
          is_published: !article.is_published,
          published_at: !article.is_published ? new Date().toISOString() : null,
        })
        .eq('id', article.id);

      if (error) throw error;
      fetchArticles();
    } catch (err) {
      console.error('Error toggling publish status:', err);
    }
  };

  const togglePinned = async (article: NewsArticle) => {
    try {
      const { error } = await supabase
        .from('news_articles')
        .update({ is_pinned: !article.is_pinned })
        .eq('id', article.id);

      if (error) throw error;
      fetchArticles();
    } catch (err) {
      console.error('Error toggling pin status:', err);
    }
  };

  // RSS Feed functions
  const resetFeedForm = () => {
    setFeedFormData({
      name: '',
      url: '',
      category: 'crypto',
      is_active: true,
    });
    setEditingFeed(null);
  };

  const openCreateFeedDialog = () => {
    resetFeedForm();
    setIsFeedDialogOpen(true);
  };

  const openEditFeedDialog = (feed: RssFeedSource) => {
    setEditingFeed(feed);
    setFeedFormData({
      name: feed.name,
      url: feed.url,
      category: feed.category,
      is_active: feed.is_active,
    });
    setIsFeedDialogOpen(true);
  };

  const handleSaveFeed = async () => {
    if (!feedFormData.name.trim() || !feedFormData.url.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Name and URL are required',
        variant: 'destructive',
      });
      return;
    }

    // Basic URL validation
    try {
      new URL(feedFormData.url.trim());
    } catch {
      toast({
        title: 'Validation Error',
        description: 'Please enter a valid URL',
        variant: 'destructive',
      });
      return;
    }

    setIsFeedSaving(true);
    try {
      const feedData = {
        name: feedFormData.name.trim(),
        url: feedFormData.url.trim(),
        category: feedFormData.category,
        is_active: feedFormData.is_active,
      };

      if (editingFeed) {
        const { error } = await supabase
          .from('rss_feed_sources')
          .update(feedData)
          .eq('id', editingFeed.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Feed updated successfully' });
      } else {
        const { error } = await supabase
          .from('rss_feed_sources')
          .insert({
            ...feedData,
            created_by: user?.id,
          });

        if (error) throw error;
        toast({ title: 'Success', description: 'Feed added successfully' });
      }

      setIsFeedDialogOpen(false);
      resetFeedForm();
      fetchFeeds();
    } catch (err) {
      console.error('Error saving feed:', err);
      toast({
        title: 'Error',
        description: 'Failed to save feed',
        variant: 'destructive',
      });
    } finally {
      setIsFeedSaving(false);
    }
  };

  const handleDeleteFeed = async () => {
    if (!deleteFeedId) return;

    try {
      const { error } = await supabase
        .from('rss_feed_sources')
        .delete()
        .eq('id', deleteFeedId);

      if (error) throw error;
      toast({ title: 'Success', description: 'Feed deleted successfully' });
      fetchFeeds();
    } catch (err) {
      console.error('Error deleting feed:', err);
      toast({
        title: 'Error',
        description: 'Failed to delete feed',
        variant: 'destructive',
      });
    } finally {
      setDeleteFeedId(null);
    }
  };

  const toggleFeedActive = async (feed: RssFeedSource) => {
    try {
      const { error } = await supabase
        .from('rss_feed_sources')
        .update({ is_active: !feed.is_active })
        .eq('id', feed.id);

      if (error) throw error;
      fetchFeeds();
    } catch (err) {
      console.error('Error toggling feed status:', err);
    }
  };

  return (
    <DashboardLayout
      title="News Management"
      subtitle="Create and manage platform news, announcements, and RSS feeds"
    >
      <div className="space-y-6">
        <Tabs defaultValue="articles" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="articles" className="flex items-center gap-2">
              <Newspaper className="h-4 w-4" />
              Articles
            </TabsTrigger>
            <TabsTrigger value="feeds" className="flex items-center gap-2">
              <Rss className="h-4 w-4" />
              RSS Feeds
            </TabsTrigger>
          </TabsList>

          {/* Articles Tab */}
          <TabsContent value="articles" className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Newspaper className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">News Articles</h2>
                  <p className="text-sm text-muted-foreground">
                    {articles.length} article{articles.length !== 1 ? 's' : ''} total
                  </p>
                </div>
              </div>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Create Article
              </Button>
            </div>

            <Card className="glass-card">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          Loading articles...
                        </TableCell>
                      </TableRow>
                    ) : articles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No articles yet. Create your first one!
                        </TableCell>
                      </TableRow>
                    ) : (
                      articles.map((article) => (
                        <TableRow key={article.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {article.is_pinned && (
                                <Pin className="h-4 w-4 text-primary flex-shrink-0" />
                              )}
                              <span className="font-medium line-clamp-1">
                                {article.title}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {CATEGORIES.find(c => c.value === article.category)?.label || article.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={article.is_published ? 'default' : 'secondary'}>
                              {article.is_published ? 'Published' : 'Draft'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(article.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => togglePinned(article)}
                                title={article.is_pinned ? 'Unpin' : 'Pin'}
                              >
                                {article.is_pinned ? (
                                  <PinOff className="h-4 w-4" />
                                ) : (
                                  <Pin className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => togglePublished(article)}
                                title={article.is_published ? 'Unpublish' : 'Publish'}
                              >
                                {article.is_published ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(article)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteArticleId(article.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* RSS Feeds Tab */}
          <TabsContent value="feeds" className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Rss className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">RSS Feed Sources</h2>
                  <p className="text-sm text-muted-foreground">
                    {feeds.filter(f => f.is_active).length} active / {feeds.length} total feeds
                  </p>
                </div>
              </div>
              <Button onClick={openCreateFeedDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Feed
              </Button>
            </div>

            <Card className="glass-card">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isFeedsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          Loading feeds...
                        </TableCell>
                      </TableRow>
                    ) : feeds.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No RSS feeds configured. Add your first one!
                        </TableCell>
                      </TableRow>
                    ) : (
                      feeds.map((feed) => (
                        <TableRow key={feed.id}>
                          <TableCell className="font-medium">
                            {feed.name}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground line-clamp-1 max-w-[200px]">
                              {feed.url}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {FEED_CATEGORIES.find(c => c.value === feed.category)?.label || feed.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={feed.is_active ? 'default' : 'secondary'}>
                              {feed.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(feed.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleFeedActive(feed)}
                                title={feed.is_active ? 'Deactivate' : 'Activate'}
                              >
                                {feed.is_active ? (
                                  <PowerOff className="h-4 w-4" />
                                ) : (
                                  <Power className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditFeedDialog(feed)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteFeedId(feed.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Create/Edit Article Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingArticle ? 'Edit Article' : 'Create Article'}
              </DialogTitle>
              <DialogDescription>
                {editingArticle
                  ? 'Update the article details below'
                  : 'Create a new platform news article or announcement'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter article title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="summary">Summary</Label>
                <Textarea
                  id="summary"
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  placeholder="Brief summary (shown in previews)"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Content *</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Full article content"
                  rows={8}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image_url">Image URL</Label>
                  <Input
                    id="image_url"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_published"
                    checked={formData.is_published}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_published: checked })
                    }
                  />
                  <Label htmlFor="is_published">Publish immediately</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_pinned"
                    checked={formData.is_pinned}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_pinned: checked })
                    }
                  />
                  <Label htmlFor="is_pinned">Pin to top</Label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : editingArticle ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create/Edit Feed Dialog */}
        <Dialog open={isFeedDialogOpen} onOpenChange={setIsFeedDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingFeed ? 'Edit RSS Feed' : 'Add RSS Feed'}
              </DialogTitle>
              <DialogDescription>
                {editingFeed
                  ? 'Update the feed details below'
                  : 'Add a new RSS feed source for the news section'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="feed_name">Name *</Label>
                <Input
                  id="feed_name"
                  value={feedFormData.name}
                  onChange={(e) => setFeedFormData({ ...feedFormData, name: e.target.value })}
                  placeholder="e.g., CoinDesk"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feed_url">RSS URL *</Label>
                <Input
                  id="feed_url"
                  value={feedFormData.url}
                  onChange={(e) => setFeedFormData({ ...feedFormData, url: e.target.value })}
                  placeholder="https://example.com/rss"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feed_category">Category</Label>
                <Select
                  value={feedFormData.category}
                  onValueChange={(value) => setFeedFormData({ ...feedFormData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEED_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <Switch
                  id="feed_is_active"
                  checked={feedFormData.is_active}
                  onCheckedChange={(checked) =>
                    setFeedFormData({ ...feedFormData, is_active: checked })
                  }
                />
                <Label htmlFor="feed_is_active">Active</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFeedDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveFeed} disabled={isFeedSaving}>
                {isFeedSaving ? 'Saving...' : editingFeed ? 'Update' : 'Add Feed'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Article Confirmation */}
        <AlertDialog open={!!deleteArticleId} onOpenChange={() => setDeleteArticleId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Article</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this article? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Feed Confirmation */}
        <AlertDialog open={!!deleteFeedId} onOpenChange={() => setDeleteFeedId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete RSS Feed</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this feed source? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteFeed}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}