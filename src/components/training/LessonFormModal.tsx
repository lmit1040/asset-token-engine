import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContentUploader } from './ContentUploader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TrainingLesson, ContentType } from '@/types/training';
import { Loader2, Video, Music, FileText, Image as ImageIcon, Type } from 'lucide-react';

const lessonSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  content_type: z.enum(['video', 'audio', 'pdf', 'image', 'text']),
  content_url: z.string().optional(),
  content_text: z.string().optional(),
  thumbnail_url: z.string().optional(),
  duration_seconds: z.number().min(0).optional().nullable(),
});

type LessonFormData = z.infer<typeof lessonSchema>;

interface LessonFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  lesson: TrainingLesson | null;
  sortOrder: number;
  onSuccess: () => void;
}

const contentTypeIcons = {
  video: Video,
  audio: Music,
  pdf: FileText,
  image: ImageIcon,
  text: Type,
};

const contentTypeAccept: Record<ContentType, string> = {
  video: 'video/mp4,video/webm,video/quicktime',
  audio: 'audio/mpeg,audio/wav,audio/ogg,audio/mp4',
  pdf: 'application/pdf',
  image: 'image/jpeg,image/png,image/gif,image/webp',
  text: '',
};

export function LessonFormModal({ 
  open, 
  onOpenChange, 
  courseId, 
  lesson, 
  sortOrder,
  onSuccess 
}: LessonFormModalProps) {
  const [saving, setSaving] = useState(false);
  const [contentUrl, setContentUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const form = useForm<LessonFormData>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      title: '',
      description: '',
      content_type: 'video',
      content_url: '',
      content_text: '',
      thumbnail_url: '',
      duration_seconds: null,
    },
  });

  const contentType = form.watch('content_type');

  useEffect(() => {
    if (lesson) {
      form.reset({
        title: lesson.title,
        description: lesson.description || '',
        content_type: lesson.content_type as ContentType,
        content_url: lesson.content_url || '',
        content_text: lesson.content_text || '',
        thumbnail_url: lesson.thumbnail_url || '',
        duration_seconds: lesson.duration_seconds,
      });
      setContentUrl(lesson.content_url);
      setThumbnailUrl(lesson.thumbnail_url);
    } else {
      form.reset({
        title: '',
        description: '',
        content_type: 'video',
        content_url: '',
        content_text: '',
        thumbnail_url: '',
        duration_seconds: null,
      });
      setContentUrl(null);
      setThumbnailUrl(null);
    }
  }, [lesson, form]);

  const onSubmit = async (data: LessonFormData) => {
    setSaving(true);
    try {
      const lessonData = {
        course_id: courseId,
        title: data.title,
        description: data.description || null,
        content_type: data.content_type,
        content_url: data.content_type !== 'text' ? (contentUrl || data.content_url || null) : null,
        content_text: data.content_type === 'text' ? data.content_text || null : null,
        thumbnail_url: thumbnailUrl || data.thumbnail_url || null,
        duration_seconds: data.duration_seconds || null,
        sort_order: lesson?.sort_order ?? sortOrder,
      };

      if (lesson) {
        const { error } = await supabase
          .from('training_lessons')
          .update(lessonData)
          .eq('id', lesson.id);
        if (error) throw error;
        toast.success('Lesson updated');
      } else {
        const { error } = await supabase
          .from('training_lessons')
          .insert(lessonData);
        if (error) throw error;
        toast.success('Lesson created');
      }

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving lesson:', err);
      toast.error('Failed to save lesson');
    } finally {
      setSaving(false);
    }
  };

  const handleContentUpload = (url: string, metadata?: { duration?: number }) => {
    setContentUrl(url);
    form.setValue('content_url', url);
    if (metadata?.duration) {
      form.setValue('duration_seconds', metadata.duration);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lesson ? 'Edit Lesson' : 'Add Lesson'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Lesson title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Brief description"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(contentTypeIcons).map(([type, Icon]) => (
                        <SelectItem key={type} value={type}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span className="capitalize">{type}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {contentType !== 'text' && (
              <div>
                <FormLabel>Content File</FormLabel>
                <div className="mt-2">
                  <ContentUploader
                    accept={contentTypeAccept[contentType as ContentType]}
                    folder={`lessons/${contentType}`}
                    onUploadComplete={handleContentUpload}
                    currentUrl={contentUrl}
                  />
                </div>
                <FormDescription className="mt-1">
                  Or enter a URL directly:
                </FormDescription>
                <Input 
                  className="mt-1"
                  placeholder="https://..."
                  value={form.watch('content_url') || ''}
                  onChange={(e) => {
                    form.setValue('content_url', e.target.value);
                    setContentUrl(e.target.value);
                  }}
                />
              </div>
            )}

            {contentType === 'text' && (
              <FormField
                control={form.control}
                name="content_text"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Write your lesson content here..."
                        rows={8}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Supports markdown formatting</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {(contentType === 'video' || contentType === 'audio') && (
              <div>
                <FormLabel>Thumbnail (optional)</FormLabel>
                <div className="mt-2">
                  <ContentUploader
                    accept="image/*"
                    folder="thumbnails"
                    onUploadComplete={(url) => {
                      setThumbnailUrl(url);
                      form.setValue('thumbnail_url', url);
                    }}
                    currentUrl={thumbnailUrl}
                  />
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="duration_seconds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (seconds)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number"
                      min={0}
                      placeholder="Auto-detected for media files"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                    />
                  </FormControl>
                  <FormDescription>
                    Automatically detected for video/audio uploads
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {lesson ? 'Update' : 'Add'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
