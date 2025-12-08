-- Add token_image_url column to store the IPFS image URL
ALTER TABLE public.token_definitions
ADD COLUMN token_image_url text;