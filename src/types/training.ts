export type ContentType = 'video' | 'audio' | 'pdf' | 'image' | 'text';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced' | null;

export interface TrainingCourse {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  is_public: boolean;
  is_published: boolean;
  mxg_reward_amount: number;
  estimated_duration_minutes: number | null;
  difficulty_level: DifficultyLevel | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lessons?: TrainingLesson[];
  lesson_count?: number;
  completed_lessons?: number;
}

export interface TrainingLesson {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  content_type: ContentType;
  content_url: string | null;
  content_text: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  progress?: UserLessonProgress;
}

export interface UserCourseProgress {
  id: string;
  user_id: string;
  course_id: string;
  started_at: string;
  completed_at: string | null;
  reward_claimed: boolean;
  reward_claimed_at: string | null;
}

export interface UserLessonProgress {
  id: string;
  user_id: string;
  lesson_id: string;
  started_at: string;
  completed_at: string | null;
  time_spent_seconds: number;
  last_position_seconds: number | null;
}
