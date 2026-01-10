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
import { Switch } from '@/components/ui/switch';
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
import { TrainingCourse, DifficultyLevel } from '@/types/training';
import { Loader2 } from 'lucide-react';

const courseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  thumbnail_url: z.string().optional(),
  mxg_reward_amount: z.number().min(0, 'Reward must be positive'),
  estimated_duration_minutes: z.number().min(0).optional().nullable(),
  difficulty_level: z.enum(['beginner', 'intermediate', 'advanced']).optional().nullable(),
  is_published: z.boolean(),
  is_public: z.boolean(),
});

type CourseFormData = z.infer<typeof courseSchema>;

interface CourseFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: TrainingCourse | null;
  onSuccess: () => void;
}

export function CourseFormModal({ open, onOpenChange, course, onSuccess }: CourseFormModalProps) {
  const [saving, setSaving] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const form = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: '',
      description: '',
      thumbnail_url: '',
      mxg_reward_amount: 0,
      estimated_duration_minutes: null,
      difficulty_level: null,
      is_published: false,
      is_public: false,
    },
  });

  useEffect(() => {
    if (course) {
      form.reset({
        title: course.title,
        description: course.description || '',
        thumbnail_url: course.thumbnail_url || '',
        mxg_reward_amount: course.mxg_reward_amount,
        estimated_duration_minutes: course.estimated_duration_minutes,
        difficulty_level: course.difficulty_level as DifficultyLevel,
        is_published: course.is_published,
        is_public: course.is_public,
      });
      setThumbnailUrl(course.thumbnail_url);
    } else {
      form.reset({
        title: '',
        description: '',
        thumbnail_url: '',
        mxg_reward_amount: 0,
        estimated_duration_minutes: null,
        difficulty_level: null,
        is_published: false,
        is_public: false,
      });
      setThumbnailUrl(null);
    }
  }, [course, form]);

  const onSubmit = async (data: CourseFormData) => {
    setSaving(true);
    try {
      const courseData = {
        title: data.title,
        description: data.description || null,
        thumbnail_url: thumbnailUrl || data.thumbnail_url || null,
        mxg_reward_amount: data.mxg_reward_amount,
        estimated_duration_minutes: data.estimated_duration_minutes || null,
        difficulty_level: data.difficulty_level || null,
        is_published: data.is_published,
        is_public: data.is_published ? data.is_public : false, // Can't be public if not published
      };

      if (course) {
        const { error } = await supabase
          .from('training_courses')
          .update(courseData)
          .eq('id', course.id);
        if (error) throw error;
        toast.success('Course updated');
      } else {
        const { error } = await supabase
          .from('training_courses')
          .insert(courseData);
        if (error) throw error;
        toast.success('Course created');
      }

      onSuccess();
    } catch (err) {
      console.error('Error saving course:', err);
      toast.error('Failed to save course');
    } finally {
      setSaving(false);
    }
  };

  const handleThumbnailUpload = (url: string) => {
    setThumbnailUrl(url);
    form.setValue('thumbnail_url', url);
  };

  const isPublished = form.watch('is_published');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{course ? 'Edit Course' : 'Create Course'}</DialogTitle>
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
                    <Input placeholder="Course title" {...field} />
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
                      placeholder="Course description"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel>Thumbnail</FormLabel>
              <div className="mt-2">
                <ContentUploader
                  accept="image/*"
                  folder="thumbnails"
                  onUploadComplete={handleThumbnailUpload}
                  currentUrl={thumbnailUrl}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="mxg_reward_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MXG Reward</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        min={0}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Earned on completion</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="estimated_duration_minutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (minutes)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        min={0}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="difficulty_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Difficulty Level</FormLabel>
                  <Select
                    value={field.value || ''}
                    onValueChange={(value) => field.onChange(value || null)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4 pt-4 border-t">
              <FormField
                control={form.control}
                name="is_published"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="cursor-pointer">Published</FormLabel>
                      <FormDescription>
                        Make course available to registered users
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_public"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="cursor-pointer">Public</FormLabel>
                      <FormDescription>
                        Also allow non-registered users to view
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!isPublished}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {course ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
