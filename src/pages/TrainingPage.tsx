import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CourseCard } from '@/components/training/CourseCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, BookOpen, Trophy, Clock, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { TrainingCourse, UserCourseProgress } from '@/types/training';

export default function TrainingPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [progress, setProgress] = useState<Record<string, UserCourseProgress>>({});
  const [lessonCounts, setLessonCounts] = useState<Record<string, { total: number; completed: number }>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchCourses();
  }, [user]);

  const fetchCourses = async () => {
    try {
      // Fetch published courses
      const { data: coursesData, error: coursesError } = await supabase
        .from('training_courses')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false }) as { data: TrainingCourse[] | null; error: any };

      if (coursesError) throw coursesError;
      setCourses(coursesData || []);

      // Fetch lesson counts for each course
      if (coursesData && coursesData.length > 0) {
        const courseIds = coursesData.map(c => c.id);
        const { data: lessonsData } = await supabase
          .from('training_lessons')
          .select('id, course_id')
          .in('course_id', courseIds);

        const counts: Record<string, { total: number; completed: number }> = {};
        coursesData.forEach(course => {
          counts[course.id] = {
            total: lessonsData?.filter(l => l.course_id === course.id).length || 0,
            completed: 0
          };
        });

        // Fetch user progress if authenticated
        if (user) {
          const { data: progressData } = await supabase
            .from('user_course_progress')
            .select('*')
            .eq('user_id', user.id)
            .in('course_id', courseIds);

          const progressMap: Record<string, UserCourseProgress> = {};
          progressData?.forEach(p => {
            progressMap[p.course_id] = p;
          });
          setProgress(progressMap);

          // Get completed lesson counts
          const lessonIds = lessonsData?.map(l => l.id) || [];
          if (lessonIds.length > 0) {
            const { data: lessonProgress } = await supabase
              .from('user_lesson_progress')
              .select('lesson_id')
              .eq('user_id', user.id)
              .not('completed_at', 'is', null)
              .in('lesson_id', lessonIds);

            const completedLessons = new Set(lessonProgress?.map(p => p.lesson_id) || []);
            lessonsData?.forEach(lesson => {
              if (completedLessons.has(lesson.id)) {
                counts[lesson.course_id].completed++;
              }
            });
          }
        }

        setLessonCounts(counts);
      }
    } catch (err) {
      console.error('Error fetching courses:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDifficulty = !difficultyFilter || course.difficulty_level === difficultyFilter;
    const isAccessible = course.is_public || user;
    return matchesSearch && matchesDifficulty && isAccessible;
  });

  const inProgressCourses = filteredCourses.filter(
    c => progress[c.id] && !progress[c.id].completed_at
  );
  const completedCourses = filteredCourses.filter(
    c => progress[c.id]?.completed_at
  );
  const newCourses = filteredCourses.filter(
    c => !progress[c.id]
  );

  const totalMxgAvailable = courses.reduce((sum, c) => sum + (c.mxg_reward_amount || 0), 0);

  return (
    <DashboardLayout 
      title="Training Center" 
      subtitle="Learn and earn MXG rewards by completing courses"
    >
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Available Courses</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{courses.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              <span className="text-sm text-muted-foreground">In Progress</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{inProgressCourses.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">Completed</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{completedCourses.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">MXG Available</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{totalMxgAvailable}</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={difficultyFilter === null ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDifficultyFilter(null)}
            >
              All
            </Button>
            <Button
              variant={difficultyFilter === 'beginner' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDifficultyFilter('beginner')}
            >
              Beginner
            </Button>
            <Button
              variant={difficultyFilter === 'intermediate' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDifficultyFilter('intermediate')}
            >
              Intermediate
            </Button>
            <Button
              variant={difficultyFilter === 'advanced' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDifficultyFilter('advanced')}
            >
              Advanced
            </Button>
          </div>
        </div>

        {/* Course Tabs */}
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">
              All Courses
              <Badge variant="secondary" className="ml-2">{filteredCourses.length}</Badge>
            </TabsTrigger>
            {user && (
              <>
                <TabsTrigger value="in-progress">
                  In Progress
                  <Badge variant="secondary" className="ml-2">{inProgressCourses.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed
                  <Badge variant="secondary" className="ml-2">{completedCourses.length}</Badge>
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="all" className="mt-6">
            {loading ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-80" />
                ))}
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="py-12 text-center">
                <BookOpen className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No courses found</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? 'Try adjusting your search' : 'Check back later for new courses'}
                </p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCourses.map(course => (
                  <CourseCard
                    key={course.id}
                    course={{
                      ...course,
                      lesson_count: lessonCounts[course.id]?.total || 0
                    }}
                    progress={
                      lessonCounts[course.id]?.total
                        ? (lessonCounts[course.id].completed / lessonCounts[course.id].total) * 100
                        : 0
                    }
                    isCompleted={!!progress[course.id]?.completed_at}
                    rewardClaimed={progress[course.id]?.reward_claimed}
                    isAuthenticated={!!user}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {user && (
            <>
              <TabsContent value="in-progress" className="mt-6">
                {inProgressCourses.length === 0 ? (
                  <div className="py-12 text-center">
                    <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">No courses in progress</h3>
                    <p className="text-muted-foreground">Start a course to see it here</p>
                  </div>
                ) : (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {inProgressCourses.map(course => (
                      <CourseCard
                        key={course.id}
                        course={{
                          ...course,
                          lesson_count: lessonCounts[course.id]?.total || 0
                        }}
                        progress={
                          lessonCounts[course.id]?.total
                            ? (lessonCounts[course.id].completed / lessonCounts[course.id].total) * 100
                            : 0
                        }
                        isAuthenticated={true}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="completed" className="mt-6">
                {completedCourses.length === 0 ? (
                  <div className="py-12 text-center">
                    <Trophy className="mx-auto h-12 w-12 text-muted-foreground" />
                    <h3 className="mt-4 text-lg font-semibold">No completed courses</h3>
                    <p className="text-muted-foreground">Complete a course to see it here</p>
                  </div>
                ) : (
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {completedCourses.map(course => (
                      <CourseCard
                        key={course.id}
                        course={{
                          ...course,
                          lesson_count: lessonCounts[course.id]?.total || 0
                        }}
                        progress={100}
                        isCompleted={true}
                        rewardClaimed={progress[course.id]?.reward_claimed}
                        isAuthenticated={true}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
