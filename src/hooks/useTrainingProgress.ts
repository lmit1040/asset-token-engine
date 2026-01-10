import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function useTrainingProgress() {
  const { user } = useAuth();
  const [updating, setUpdating] = useState(false);

  const startCourse = useCallback(async (courseId: string) => {
    if (!user) return null;
    
    try {
      const { data, error } = await supabase
        .from('user_course_progress')
        .upsert({
          user_id: user.id,
          course_id: courseId,
          started_at: new Date().toISOString()
        }, { onConflict: 'user_id,course_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error starting course:', err);
      return null;
    }
  }, [user]);

  const startLesson = useCallback(async (lessonId: string) => {
    if (!user) return null;
    
    try {
      const { data, error } = await supabase
        .from('user_lesson_progress')
        .upsert({
          user_id: user.id,
          lesson_id: lessonId,
          started_at: new Date().toISOString()
        }, { onConflict: 'user_id,lesson_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error starting lesson:', err);
      return null;
    }
  }, [user]);

  const completeLesson = useCallback(async (lessonId: string, timeSpent: number) => {
    if (!user) return false;
    
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('user_lesson_progress')
        .upsert({
          user_id: user.id,
          lesson_id: lessonId,
          completed_at: new Date().toISOString(),
          time_spent_seconds: timeSpent
        }, { onConflict: 'user_id,lesson_id' });

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error completing lesson:', err);
      return false;
    } finally {
      setUpdating(false);
    }
  }, [user]);

  const updateLessonProgress = useCallback(async (
    lessonId: string, 
    timeSpent: number, 
    lastPosition: number
  ) => {
    if (!user) return;
    
    try {
      await supabase
        .from('user_lesson_progress')
        .upsert({
          user_id: user.id,
          lesson_id: lessonId,
          time_spent_seconds: timeSpent,
          last_position_seconds: lastPosition
        }, { onConflict: 'user_id,lesson_id' });
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  }, [user]);

  const checkCourseCompletion = useCallback(async (courseId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      // Get all lessons for the course
      const { data: lessons } = await supabase
        .from('training_lessons')
        .select('id')
        .eq('course_id', courseId);

      if (!lessons || lessons.length === 0) return false;

      // Get completed lessons for the user
      const { data: progress } = await supabase
        .from('user_lesson_progress')
        .select('lesson_id')
        .eq('user_id', user.id)
        .not('completed_at', 'is', null)
        .in('lesson_id', lessons.map(l => l.id));

      const allCompleted = progress?.length === lessons.length;

      if (allCompleted) {
        // Mark course as completed
        await supabase
          .from('user_course_progress')
          .upsert({
            user_id: user.id,
            course_id: courseId,
            completed_at: new Date().toISOString()
          }, { onConflict: 'user_id,course_id' });
      }

      return allCompleted;
    } catch (err) {
      console.error('Error checking course completion:', err);
      return false;
    }
  }, [user]);

  const claimReward = useCallback(async (courseId: string) => {
    if (!user) return false;

    setUpdating(true);
    try {
      // Call edge function to claim reward
      const { data, error } = await supabase.functions.invoke('claim-training-reward', {
        body: { courseId }
      });

      if (error) throw error;
      
      toast.success(`Claimed ${data.mxgAmount} MXG reward!`);
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Failed to claim reward');
      return false;
    } finally {
      setUpdating(false);
    }
  }, [user]);

  return {
    startCourse,
    startLesson,
    completeLesson,
    updateLessonProgress,
    checkCourseCompletion,
    claimReward,
    updating
  };
}
