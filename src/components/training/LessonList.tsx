import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle, 
  Circle, 
  Play,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Lock
} from 'lucide-react';
import { TrainingLesson, UserLessonProgress } from '@/types/training';

interface LessonListProps {
  lessons: TrainingLesson[];
  progress: Record<string, UserLessonProgress>;
  currentLessonId?: string;
  onSelectLesson: (lesson: TrainingLesson) => void;
  isAuthenticated?: boolean;
}

export function LessonList({ 
  lessons, 
  progress, 
  currentLessonId, 
  onSelectLesson,
  isAuthenticated = true 
}: LessonListProps) {
  const contentIcons = {
    video: Video,
    audio: Music,
    pdf: FileText,
    image: ImageIcon,
    text: FileText
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-1">
      {lessons.map((lesson, index) => {
        const lessonProgress = progress[lesson.id];
        const isCompleted = !!lessonProgress?.completed_at;
        const isActive = lesson.id === currentLessonId;
        const ContentIcon = contentIcons[lesson.content_type];

        return (
          <Button
            key={lesson.id}
            variant="ghost"
            className={cn(
              'w-full justify-start gap-3 h-auto py-3 px-3',
              isActive && 'bg-primary/10',
              !isAuthenticated && 'opacity-50'
            )}
            onClick={() => isAuthenticated && onSelectLesson(lesson)}
            disabled={!isAuthenticated}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center">
              {isCompleted ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : isActive ? (
                <Play className="h-5 w-5 text-primary" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            
            <div className="flex flex-1 items-center gap-2 overflow-hidden">
              <ContentIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-left text-sm">
                {index + 1}. {lesson.title}
              </span>
            </div>
            
            <div className="flex shrink-0 items-center gap-2">
              {lesson.duration_seconds && (
                <span className="text-xs text-muted-foreground">
                  {formatDuration(lesson.duration_seconds)}
                </span>
              )}
              {!isAuthenticated && <Lock className="h-3 w-3 text-muted-foreground" />}
            </div>
          </Button>
        );
      })}
    </div>
  );
}
