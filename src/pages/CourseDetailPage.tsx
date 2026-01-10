import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PublicCourseLayout } from '@/components/layout/PublicCourseLayout';
import { LessonPlayer } from '@/components/training/LessonPlayer';
import { LessonList } from '@/components/training/LessonList';
import { CourseCompletionCard } from '@/components/training/CourseCompletionCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  BookOpen, 
  Clock, 
  Trophy, 
  Users,
  ChevronLeft,
  ChevronRight,
  LogIn
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTrainingProgress } from '@/hooks/useTrainingProgress';
import { TrainingCourse, TrainingLesson, UserLessonProgress, UserCourseProgress } from '@/types/training';

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user } = useAuth();
  const { startCourse, checkCourseCompletion } = useTrainingProgress();
  
  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [lessonProgress, setLessonProgress] = useState<Record<string, UserLessonProgress>>({});
  const [courseProgress, setCourseProgress] = useState<UserCourseProgress | null>(null);
  const [currentLesson, setCurrentLesson] = useState<TrainingLesson | null>(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = !!user;
  const isPublicCourse = course?.is_public ?? false;

  const fetchCourse = useCallback(async () => {
    if (!courseId) return;

    try {
      // Fetch course
      const { data: courseData, error: courseError } = await supabase
        .from('training_courses')
        .select('*')
        .eq('id', courseId)
        .single() as { data: TrainingCourse | null; error: any };

      if (courseError) throw courseError;
      setCourse(courseData);

      // Fetch lessons
      const { data: lessonsData, error: lessonsError } = await supabase
        .from('training_lessons')
        .select('*')
        .eq('course_id', courseId)
        .order('sort_order') as { data: TrainingLesson[] | null; error: any };

      if (lessonsError) throw lessonsError;
      setLessons(lessonsData || []);

      // Set first lesson as current if none selected
      if (lessonsData && lessonsData.length > 0 && !currentLesson) {
        setCurrentLesson(lessonsData[0]);
      }

      // Fetch user progress if authenticated
      if (user) {
        const { data: progressData } = await supabase
          .from('user_course_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('course_id', courseId)
          .single();

        setCourseProgress(progressData);

        if (lessonsData && lessonsData.length > 0) {
          const lessonIds = lessonsData.map(l => l.id);
          const { data: lessonProgressData } = await supabase
            .from('user_lesson_progress')
            .select('*')
            .eq('user_id', user.id)
            .in('lesson_id', lessonIds);

          const progressMap: Record<string, UserLessonProgress> = {};
          lessonProgressData?.forEach(p => {
            progressMap[p.lesson_id] = p;
          });
          setLessonProgress(progressMap);

          // Find first incomplete lesson
          const firstIncomplete = lessonsData.find(l => !progressMap[l.id]?.completed_at);
          if (firstIncomplete) {
            setCurrentLesson(firstIncomplete);
          }
        }

        // Start course progress tracking
        if (!progressData) {
          await startCourse(courseId);
        }
      }
    } catch (err) {
      console.error('Error fetching course:', err);
    } finally {
      setLoading(false);
    }
  }, [courseId, user, startCourse, currentLesson]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  const handleLessonComplete = async () => {
    if (!currentLesson || !user) return;

    // Update local progress
    setLessonProgress(prev => ({
      ...prev,
      [currentLesson.id]: {
        ...prev[currentLesson.id],
        completed_at: new Date().toISOString()
      } as UserLessonProgress
    }));

    // Check if course is completed
    const isComplete = await checkCourseCompletion(courseId!);
    if (isComplete) {
      setCourseProgress(prev => prev ? { ...prev, completed_at: new Date().toISOString() } : null);
    }

    // Auto-advance to next lesson
    const currentIndex = lessons.findIndex(l => l.id === currentLesson.id);
    if (currentIndex < lessons.length - 1) {
      setCurrentLesson(lessons[currentIndex + 1]);
    }
  };

  const handleRewardClaimed = () => {
    setCourseProgress(prev => prev ? { 
      ...prev, 
      reward_claimed: true,
      reward_claimed_at: new Date().toISOString()
    } : null);
  };

  const goToPreviousLesson = () => {
    const currentIndex = lessons.findIndex(l => l.id === currentLesson?.id);
    if (currentIndex > 0) {
      setCurrentLesson(lessons[currentIndex - 1]);
    }
  };

  const goToNextLesson = () => {
    const currentIndex = lessons.findIndex(l => l.id === currentLesson?.id);
    if (currentIndex < lessons.length - 1) {
      setCurrentLesson(lessons[currentIndex + 1]);
    }
  };

  const completedCount = Object.values(lessonProgress).filter(p => p.completed_at).length;
  const progressPercent = lessons.length ? (completedCount / lessons.length) * 100 : 0;
  const isCompleted = !!courseProgress?.completed_at;

  // Determine which layout to use
  const usePublicLayout = isPublicCourse && !isAuthenticated;

  // Loading state
  const LoadingContent = (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Skeleton className="h-96" />
        </div>
        <Skeleton className="h-96" />
      </div>
    </div>
  );

  // Not found state
  const NotFoundContent = (
    <div className="py-12 text-center">
      <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
      <h3 className="mt-4 text-lg font-semibold">Course not found</h3>
      <Button asChild className="mt-4">
        <Link to={isAuthenticated ? "/training" : "/"}>
          {isAuthenticated ? "Back to Training" : "Back to Home"}
        </Link>
      </Button>
    </div>
  );

  // Main content
  const MainContent = course && (
    <div className="space-y-6">
      {/* Back button and progress */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Button variant="ghost" asChild>
          <Link to={isAuthenticated ? "/training" : "/"}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {isAuthenticated ? "Back to Training" : "Back to Home"}
          </Link>
        </Button>
        
        {isAuthenticated && (
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              {completedCount} / {lessons.length} lessons
            </div>
            <Progress value={progressPercent} className="w-32" />
            {course.mxg_reward_amount > 0 && (
              <Badge variant="secondary">
                <Trophy className="mr-1 h-3 w-3" />
                {course.mxg_reward_amount} MXG
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Sign-in prompt for public course viewers */}
      {usePublicLayout && course.mxg_reward_amount > 0 && (
        <Alert className="border-primary/30 bg-primary/5">
          <LogIn className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between flex-wrap gap-4">
            <span>
              Sign in to track your progress and earn <strong>{course.mxg_reward_amount} MXG</strong> upon completion
            </span>
            <Button size="sm" asChild>
              <Link to="/auth">Create Account</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Completion Card */}
      {isAuthenticated && (
        <CourseCompletionCard
          course={course}
          isCompleted={isCompleted}
          rewardClaimed={courseProgress?.reward_claimed || false}
          onRewardClaimed={handleRewardClaimed}
        />
      )}

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lesson Player */}
        <div className="space-y-4 lg:col-span-2">
          {currentLesson ? (
            <>
              <LessonPlayer
                lesson={currentLesson}
                onComplete={handleLessonComplete}
                isCompleted={!!lessonProgress[currentLesson.id]?.completed_at}
                isAuthenticated={isAuthenticated}
              />
              
              {/* Navigation buttons */}
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={goToPreviousLesson}
                  disabled={lessons.findIndex(l => l.id === currentLesson.id) === 0}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  onClick={goToNextLesson}
                  disabled={lessons.findIndex(l => l.id === currentLesson.id) === lessons.length - 1}
                >
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">No lessons in this course yet</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Lesson List Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Course Content</CardTitle>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {course.estimated_duration_minutes && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {course.estimated_duration_minutes} min
                  </span>
                )}
                <span>{lessons.length} lessons</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <LessonList
                lessons={lessons}
                progress={lessonProgress}
                currentLessonId={currentLesson?.id}
                onSelectLesson={setCurrentLesson}
                isAuthenticated={isAuthenticated}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  // Render with appropriate layout
  if (loading) {
    if (usePublicLayout) {
      return (
        <PublicCourseLayout title="Loading...">
          {LoadingContent}
        </PublicCourseLayout>
      );
    }
    return (
      <DashboardLayout title="Loading..." subtitle="">
        {LoadingContent}
      </DashboardLayout>
    );
  }

  if (!course) {
    if (usePublicLayout) {
      return (
        <PublicCourseLayout title="Course Not Found">
          {NotFoundContent}
        </PublicCourseLayout>
      );
    }
    return (
      <DashboardLayout title="Course Not Found" subtitle="">
        {NotFoundContent}
      </DashboardLayout>
    );
  }

  // Non-public course requires authentication
  if (!isPublicCourse && !isAuthenticated) {
    return (
      <PublicCourseLayout title="Sign In Required">
        <div className="py-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">This course requires sign-in</h3>
          <p className="mt-2 text-muted-foreground">Please sign in to access this course content.</p>
          <Button asChild className="mt-4">
            <Link to="/auth">Sign In</Link>
          </Button>
        </div>
      </PublicCourseLayout>
    );
  }

  if (usePublicLayout) {
    return (
      <PublicCourseLayout 
        title={course.title} 
        subtitle={course.description || undefined}
      >
        {MainContent}
      </PublicCourseLayout>
    );
  }

  return (
    <DashboardLayout 
      title={course.title} 
      subtitle={course.description || ''}
    >
      {MainContent}
    </DashboardLayout>
  );
}
