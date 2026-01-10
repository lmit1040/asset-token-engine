-- Training Courses table
CREATE TABLE public.training_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  mxg_reward_amount NUMERIC NOT NULL DEFAULT 0,
  estimated_duration_minutes INTEGER,
  difficulty_level TEXT CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Training Lessons table
CREATE TABLE public.training_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('video', 'audio', 'pdf', 'image', 'text')),
  content_url TEXT,
  content_text TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Course Enrollment/Progress
CREATE TABLE public.user_course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  reward_claimed BOOLEAN NOT NULL DEFAULT false,
  reward_claimed_at TIMESTAMPTZ,
  UNIQUE(user_id, course_id)
);

-- User Lesson Progress
CREATE TABLE public.user_lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.training_lessons(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  last_position_seconds INTEGER DEFAULT 0,
  UNIQUE(user_id, lesson_id)
);

-- Enable RLS
ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lesson_progress ENABLE ROW LEVEL SECURITY;

-- Training Courses Policies
CREATE POLICY "Public courses viewable by everyone"
  ON public.training_courses FOR SELECT
  USING (is_published = true AND is_public = true);

CREATE POLICY "Published courses viewable by authenticated users"
  ON public.training_courses FOR SELECT
  TO authenticated
  USING (is_published = true);

CREATE POLICY "Admins can manage all courses"
  ON public.training_courses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Training Lessons Policies
CREATE POLICY "Lessons of public courses viewable by everyone"
  ON public.training_lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.training_courses
      WHERE id = training_lessons.course_id
        AND is_published = true
        AND is_public = true
    )
  );

CREATE POLICY "Lessons of published courses viewable by authenticated"
  ON public.training_lessons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.training_courses
      WHERE id = training_lessons.course_id
        AND is_published = true
    )
  );

CREATE POLICY "Admins can manage all lessons"
  ON public.training_lessons FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- User Course Progress Policies
CREATE POLICY "Users can view own course progress"
  ON public.user_course_progress FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own course progress"
  ON public.user_course_progress FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own course progress"
  ON public.user_course_progress FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all course progress"
  ON public.user_course_progress FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- User Lesson Progress Policies
CREATE POLICY "Users can view own lesson progress"
  ON public.user_lesson_progress FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own lesson progress"
  ON public.user_lesson_progress FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own lesson progress"
  ON public.user_lesson_progress FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all lesson progress"
  ON public.user_lesson_progress FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for training content
INSERT INTO storage.buckets (id, name, public) VALUES ('training-content', 'training-content', true);

-- Storage policies for training content
CREATE POLICY "Anyone can view training content"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'training-content');

CREATE POLICY "Admins can upload training content"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'training-content' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update training content"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'training-content' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete training content"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'training-content' AND public.has_role(auth.uid(), 'admin'));

-- Add triggers for updated_at
CREATE TRIGGER update_training_courses_updated_at
  BEFORE UPDATE ON public.training_courses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_training_lessons_updated_at
  BEFORE UPDATE ON public.training_lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better query performance
CREATE INDEX idx_training_lessons_course_id ON public.training_lessons(course_id);
CREATE INDEX idx_user_course_progress_user_id ON public.user_course_progress(user_id);
CREATE INDEX idx_user_lesson_progress_user_id ON public.user_lesson_progress(user_id);
CREATE INDEX idx_user_lesson_progress_lesson_id ON public.user_lesson_progress(lesson_id);