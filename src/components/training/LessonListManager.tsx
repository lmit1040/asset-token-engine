import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  GripVertical, 
  Pencil, 
  Trash2, 
  Video, 
  Music, 
  FileText, 
  Image as ImageIcon, 
  Type,
  BookOpen,
  Clock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TrainingCourse, TrainingLesson, ContentType } from '@/types/training';
import { LessonFormModal } from './LessonFormModal';
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

interface LessonListManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: TrainingCourse;
}

const contentTypeIcons: Record<ContentType, React.ElementType> = {
  video: Video,
  audio: Music,
  pdf: FileText,
  image: ImageIcon,
  text: Type,
};

export function LessonListManager({ open, onOpenChange, course }: LessonListManagerProps) {
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<TrainingLesson | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [lessonToDelete, setLessonToDelete] = useState<TrainingLesson | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const fetchLessons = async () => {
    try {
      const { data, error } = await supabase
        .from('training_lessons')
        .select('*')
        .eq('course_id', course.id)
        .order('sort_order') as { data: TrainingLesson[] | null; error: any };

      if (error) throw error;
      setLessons(data || []);
    } catch (err) {
      console.error('Error fetching lessons:', err);
      toast.error('Failed to load lessons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchLessons();
    }
  }, [open, course.id]);

  const handleAddLesson = () => {
    setSelectedLesson(null);
    setLessonModalOpen(true);
  };

  const handleEditLesson = (lesson: TrainingLesson) => {
    setSelectedLesson(lesson);
    setLessonModalOpen(true);
  };

  const handleDeleteClick = (lesson: TrainingLesson) => {
    setLessonToDelete(lesson);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!lessonToDelete) return;

    try {
      const { error } = await supabase
        .from('training_lessons')
        .delete()
        .eq('id', lessonToDelete.id);

      if (error) throw error;
      toast.success('Lesson deleted');
      fetchLessons();
    } catch (err) {
      console.error('Error deleting lesson:', err);
      toast.error('Failed to delete lesson');
    } finally {
      setDeleteDialogOpen(false);
      setLessonToDelete(null);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggingIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) return;

    const newLessons = [...lessons];
    const draggedLesson = newLessons[draggingIndex];
    newLessons.splice(draggingIndex, 1);
    newLessons.splice(index, 0, draggedLesson);
    
    setLessons(newLessons);
    setDraggingIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggingIndex === null) return;

    // Update sort order in database
    try {
      const updates = lessons.map((lesson, index) => ({
        id: lesson.id,
        sort_order: index,
      }));

      for (const update of updates) {
        await supabase
          .from('training_lessons')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }

      toast.success('Order updated');
    } catch (err) {
      console.error('Error updating order:', err);
      toast.error('Failed to update order');
      fetchLessons(); // Revert to original order
    }

    setDraggingIndex(null);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Manage Lessons - {course.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Drag to reorder lessons. Changes save automatically.
              </p>
              <Button onClick={handleAddLesson} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Lesson
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : lessons.length === 0 ? (
              <div className="py-12 text-center border rounded-lg">
                <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No lessons yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add your first lesson to this course
                </p>
                <Button onClick={handleAddLesson} className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  Add First Lesson
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {lessons.map((lesson, index) => {
                  const Icon = contentTypeIcons[lesson.content_type as ContentType];
                  return (
                    <Card
                      key={lesson.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`cursor-move ${
                        draggingIndex === index ? 'opacity-50 ring-2 ring-primary' : ''
                      }`}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-xs">
                            {index + 1}
                          </Badge>
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{lesson.title}</div>
                          {lesson.description && (
                            <div className="text-sm text-muted-foreground truncate">
                              {lesson.description}
                            </div>
                          )}
                        </div>

                        {lesson.duration_seconds && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground flex-shrink-0">
                            <Clock className="h-3 w-3" />
                            {formatDuration(lesson.duration_seconds)}
                          </div>
                        )}

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditLesson(lesson)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteClick(lesson)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lesson Form Modal */}
      <LessonFormModal
        open={lessonModalOpen}
        onOpenChange={setLessonModalOpen}
        courseId={course.id}
        lesson={selectedLesson}
        sortOrder={lessons.length}
        onSuccess={fetchLessons}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lesson</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{lessonToDelete?.title}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
