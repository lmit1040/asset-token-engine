-- Add title and description columns to proof_of_reserve_files
ALTER TABLE public.proof_of_reserve_files 
ADD COLUMN title TEXT,
ADD COLUMN description TEXT;