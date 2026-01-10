import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  FileText, 
  Image as ImageIcon,
  Music,
  Video,
  ExternalLink 
} from 'lucide-react';
import { TrainingLesson } from '@/types/training';
import { useTrainingProgress } from '@/hooks/useTrainingProgress';
import { VideoEmbed } from './VideoEmbed';

interface LessonPlayerProps {
  lesson: TrainingLesson;
  onComplete?: () => void;
  isCompleted?: boolean;
  isAuthenticated?: boolean;
}

export function LessonPlayer({ lesson, onComplete, isCompleted = false, isAuthenticated = true }: LessonPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(lesson.duration_seconds || 0);
  const [startTime] = useState(Date.now());
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const { completeLesson, updateLessonProgress, startLesson } = useTrainingProgress();

  useEffect(() => {
    if (isAuthenticated) {
      startLesson(lesson.id);
    }
  }, [lesson.id, startLesson, isAuthenticated]);

  // Track time spent every 30 seconds (only for authenticated users)
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const interval = setInterval(() => {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      updateLessonProgress(lesson.id, timeSpent, currentTime);
    }, 30000);

    return () => clearInterval(interval);
  }, [lesson.id, startTime, currentTime, updateLessonProgress, isAuthenticated]);

  const handleComplete = useCallback(async () => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    const success = await completeLesson(lesson.id, timeSpent);
    if (success && onComplete) {
      onComplete();
    }
  }, [lesson.id, startTime, completeLesson, onComplete]);

  const handleMediaTimeUpdate = useCallback(() => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime);
    }
  }, []);

  const handleMediaEnded = useCallback(() => {
    setPlaying(false);
    if (!isCompleted) {
      handleComplete();
    }
  }, [isCompleted, handleComplete]);

  const togglePlay = useCallback(() => {
    if (mediaRef.current) {
      if (playing) {
        mediaRef.current.pause();
      } else {
        mediaRef.current.play();
      }
      setPlaying(!playing);
    }
  }, [playing]);

  const contentIcons = {
    video: Video,
    audio: Music,
    pdf: FileText,
    image: ImageIcon,
    text: FileText
  };
  const ContentIcon = contentIcons[lesson.content_type];

  const renderContent = () => {
    switch (lesson.content_type) {
      case 'video':
        return (
          <div className="relative w-full overflow-hidden rounded-lg bg-black">
            <VideoEmbed
              url={lesson.content_url || ''}
              title={lesson.title}
              onEnded={handleMediaEnded}
              onTimeUpdate={(time) => setCurrentTime(time)}
            />
          </div>
        );

      case 'audio':
        return (
          <div className="flex flex-col items-center gap-4 rounded-lg bg-muted p-8">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
              <Music className="h-12 w-12 text-primary" />
            </div>
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={lesson.content_url || ''}
              onTimeUpdate={handleMediaTimeUpdate}
              onEnded={handleMediaEnded}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              controls
              className="w-full max-w-md"
            />
          </div>
        );

      case 'pdf':
        return (
          <div className="flex flex-col gap-4">
            <iframe
              src={`${lesson.content_url}#toolbar=0`}
              className="h-[600px] w-full rounded-lg border"
              title={lesson.title}
            />
            <Button variant="outline" asChild>
              <a href={lesson.content_url || ''} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in new tab
              </a>
            </Button>
          </div>
        );

      case 'image':
        return (
          <div className="flex justify-center">
            <img 
              src={lesson.content_url || ''} 
              alt={lesson.title}
              className="max-h-[600px] rounded-lg object-contain"
            />
          </div>
        );

      case 'text':
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg bg-muted p-6">
            <div dangerouslySetInnerHTML={{ __html: lesson.content_text || '' }} />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ContentIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{lesson.title}</CardTitle>
            {lesson.description && (
              <p className="text-sm text-muted-foreground">{lesson.description}</p>
            )}
          </div>
        </div>
        {isCompleted && (
          <Badge className="bg-green-500">
            <CheckCircle className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {renderContent()}
        
        {isAuthenticated && !isCompleted && lesson.content_type !== 'video' && lesson.content_type !== 'audio' && (
          <div className="flex justify-end">
            <Button onClick={handleComplete}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark as Complete
            </Button>
          </div>
        )}
        
        {!isAuthenticated && (
          <div className="rounded-lg bg-muted/50 border border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">
              <Link to="/auth" className="text-primary hover:underline font-medium">Sign in</Link>
              {' '}to track your progress and earn rewards
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
