import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CourseFormModal } from '@/components/training/CourseFormModal';
import { LessonListManager } from '@/components/training/LessonListManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Pencil, 
  Trash2, 
  Eye, 
  BookOpen,
  Users,
  Trophy,
  GraduationCap,
  Layers
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { TrainingCourse } from '@/types/training';
import { Link } from 'react-router-dom';
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

interface CourseWithStats extends TrainingCourse {
  lesson_count: number;
  enrolled_count: number;
  completed_count: number;
}

export default function AdminTrainingPage() {
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [lessonManagerOpen, setLessonManagerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<TrainingCourse | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<TrainingCourse | null>(null);

  const fetchCourses = async () => {
    try {
      // Fetch courses
      const { data: coursesData, error: coursesError } = await supabase
        .from('training_courses')
        .select('*')
        .order('created_at', { ascending: false });

      if (coursesError) throw coursesError;

      // Get stats for each course
      const coursesWithStats = await Promise.all(
        (coursesData || []).map(async (course) => {
          // Count lessons
          const { count: lessonCount } = await supabase
            .from('training_lessons')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', course.id);

          // Count enrolled users
          const { count: enrolledCount } = await supabase
            .from('user_course_progress')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', course.id);

          // Count completions
          const { count: completedCount } = await supabase
            .from('user_course_progress')
            .select('*', { count: 'exact', head: true })
            .eq('course_id', course.id)
            .not('completed_at', 'is', null);

          return {
            ...course,
            lesson_count: lessonCount || 0,
            enrolled_count: enrolledCount || 0,
            completed_count: completedCount || 0,
          } as CourseWithStats;
        })
      );

      setCourses(coursesWithStats);
    } catch (err) {
      console.error('Error fetching courses:', err);
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  const handleCreateCourse = () => {
    setSelectedCourse(null);
    setCourseModalOpen(true);
  };

  const handleEditCourse = (course: TrainingCourse) => {
    setSelectedCourse(course);
    setCourseModalOpen(true);
  };

  const handleManageLessons = (course: TrainingCourse) => {
    setSelectedCourse(course);
    setLessonManagerOpen(true);
  };

  const handleDeleteClick = (course: TrainingCourse) => {
    setCourseToDelete(course);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!courseToDelete) return;

    try {
      const { error } = await supabase
        .from('training_courses')
        .delete()
        .eq('id', courseToDelete.id);

      if (error) throw error;
      toast.success('Course deleted');
      fetchCourses();
    } catch (err) {
      console.error('Error deleting course:', err);
      toast.error('Failed to delete course');
    } finally {
      setDeleteDialogOpen(false);
      setCourseToDelete(null);
    }
  };

  const togglePublished = async (course: TrainingCourse) => {
    try {
      const newValue = !course.is_published;
      const { error } = await supabase
        .from('training_courses')
        .update({ 
          is_published: newValue,
          // If unpublishing, also make it non-public
          ...(newValue === false && { is_public: false })
        })
        .eq('id', course.id);

      if (error) throw error;
      toast.success(newValue ? 'Course published' : 'Course unpublished');
      fetchCourses();
    } catch (err) {
      console.error('Error toggling published:', err);
      toast.error('Failed to update course');
    }
  };

  const togglePublic = async (course: TrainingCourse) => {
    try {
      if (!course.is_published) {
        toast.error('Course must be published first');
        return;
      }
      const { error } = await supabase
        .from('training_courses')
        .update({ is_public: !course.is_public })
        .eq('id', course.id);

      if (error) throw error;
      toast.success(course.is_public ? 'Course is now private' : 'Course is now public');
      fetchCourses();
    } catch (err) {
      console.error('Error toggling public:', err);
      toast.error('Failed to update course');
    }
  };

  const filteredCourses = courses.filter(course =>
    course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalEnrolled = courses.reduce((sum, c) => sum + c.enrolled_count, 0);
  const totalCompleted = courses.reduce((sum, c) => sum + c.completed_count, 0);
  const publishedCount = courses.filter(c => c.is_published).length;

  return (
    <DashboardLayout 
      title="Training Content" 
      subtitle="Manage training courses and lessons"
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Courses</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{courses.length}</div>
              <p className="text-xs text-muted-foreground">
                {publishedCount} published
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Lessons</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {courses.reduce((sum, c) => sum + c.lesson_count, 0)}
              </div>
              <p className="text-xs text-muted-foreground">Across all courses</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enrolled Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEnrolled}</div>
              <p className="text-xs text-muted-foreground">
                {totalCompleted} completed
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalEnrolled ? Math.round((totalCompleted / totalEnrolled) * 100) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">Overall</p>
            </CardContent>
          </Card>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={handleCreateCourse}>
            <Plus className="mr-2 h-4 w-4" />
            New Course
          </Button>
        </div>

        {/* Courses Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="py-12 text-center">
                <GraduationCap className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No courses found</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {searchQuery ? 'Try a different search term' : 'Create your first training course'}
                </p>
                {!searchQuery && (
                  <Button onClick={handleCreateCourse} className="mt-4">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Course
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Course</TableHead>
                    <TableHead>Lessons</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCourses.map((course) => (
                    <TableRow key={course.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {course.thumbnail_url ? (
                            <img 
                              src={course.thumbnail_url} 
                              alt={course.title}
                              className="h-10 w-16 object-cover rounded"
                            />
                          ) : (
                            <div className="h-10 w-16 bg-muted rounded flex items-center justify-center">
                              <BookOpen className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{course.title}</div>
                            <div className="text-sm text-muted-foreground line-clamp-1">
                              {course.description}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleManageLessons(course)}
                        >
                          <Layers className="mr-1 h-3 w-3" />
                          {course.lesson_count}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {course.mxg_reward_amount > 0 ? (
                          <Badge variant="secondary">
                            <Trophy className="mr-1 h-3 w-3" />
                            {course.mxg_reward_amount} MXG
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge 
                            variant={course.is_published ? "default" : "secondary"}
                            className="cursor-pointer"
                            onClick={() => togglePublished(course)}
                          >
                            {course.is_published ? 'Published' : 'Draft'}
                          </Badge>
                          {course.is_published && (
                            <Badge 
                              variant={course.is_public ? "outline" : "secondary"}
                              className="cursor-pointer"
                              onClick={() => togglePublic(course)}
                            >
                              {course.is_public ? 'Public' : 'Private'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{course.enrolled_count}</TableCell>
                      <TableCell>{course.completed_count}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/training/${course.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                Preview
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditCourse(course)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleManageLessons(course)}>
                              <Layers className="mr-2 h-4 w-4" />
                              Manage Lessons
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteClick(course)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Course Form Modal */}
      <CourseFormModal
        open={courseModalOpen}
        onOpenChange={setCourseModalOpen}
        course={selectedCourse}
        onSuccess={() => {
          fetchCourses();
          setCourseModalOpen(false);
        }}
      />

      {/* Lesson Manager Modal */}
      {selectedCourse && (
        <LessonListManager
          open={lessonManagerOpen}
          onOpenChange={setLessonManagerOpen}
          course={selectedCourse}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{courseToDelete?.title}"? 
              This will also delete all lessons and user progress. This action cannot be undone.
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
    </DashboardLayout>
  );
}
