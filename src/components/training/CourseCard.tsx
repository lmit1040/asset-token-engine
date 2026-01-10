import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Clock, Trophy, Lock, Play } from 'lucide-react';
import { TrainingCourse } from '@/types/training';
import { Link } from 'react-router-dom';

interface CourseCardProps {
  course: TrainingCourse;
  progress?: number;
  isCompleted?: boolean;
  rewardClaimed?: boolean;
  isAuthenticated?: boolean;
}

export function CourseCard({ 
  course, 
  progress = 0, 
  isCompleted = false,
  rewardClaimed = false,
  isAuthenticated = false 
}: CourseCardProps) {
  const difficultyColors = {
    beginner: 'bg-green-500/10 text-green-500',
    intermediate: 'bg-yellow-500/10 text-yellow-500',
    advanced: 'bg-red-500/10 text-red-500'
  };

  return (
    <Card className="group overflow-hidden transition-all hover:shadow-lg">
      <div className="relative aspect-video overflow-hidden bg-muted">
        {course.thumbnail_url ? (
          <img 
            src={course.thumbnail_url} 
            alt={course.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <BookOpen className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        {!course.is_public && !isAuthenticated && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Lock className="h-8 w-8 text-white" />
          </div>
        )}
        {isCompleted && (
          <div className="absolute right-2 top-2">
            <Badge className="bg-green-500">Completed</Badge>
          </div>
        )}
      </div>
      
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-semibold">{course.title}</h3>
          {course.mxg_reward_amount > 0 && (
            <Badge variant="secondary" className="shrink-0">
              <Trophy className="mr-1 h-3 w-3" />
              {course.mxg_reward_amount} MXG
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {course.difficulty_level && (
            <Badge 
              variant="outline" 
              className={difficultyColors[course.difficulty_level]}
            >
              {course.difficulty_level}
            </Badge>
          )}
          {course.lesson_count !== undefined && (
            <Badge variant="outline">
              {course.lesson_count} lessons
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="pb-2">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {course.description}
        </p>
        {course.estimated_duration_minutes && (
          <div className="mt-2 flex items-center text-xs text-muted-foreground">
            <Clock className="mr-1 h-3 w-3" />
            {course.estimated_duration_minutes} min
          </div>
        )}
        {progress > 0 && !isCompleted && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        {!course.is_public && !isAuthenticated ? (
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth">Sign in to access</Link>
          </Button>
        ) : (
          <Button asChild className="w-full">
            <Link to={`/training/${course.id}`}>
              <Play className="mr-2 h-4 w-4" />
              {progress > 0 ? 'Continue' : 'Start Course'}
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
