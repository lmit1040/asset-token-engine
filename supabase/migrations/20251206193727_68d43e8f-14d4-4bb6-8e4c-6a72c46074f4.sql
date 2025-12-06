-- Create network_type enum
CREATE TYPE public.network_type AS ENUM ('MAINNET', 'TESTNET', 'NONE');

-- Create deployment_status enum  
CREATE TYPE public.deployment_status AS ENUM ('NOT_DEPLOYED', 'PENDING', 'DEPLOYED');

-- Add network column to token_definitions
ALTER TABLE public.token_definitions 
ADD COLUMN network public.network_type NOT NULL DEFAULT 'NONE';

-- Add deployment_status column to token_definitions
ALTER TABLE public.token_definitions 
ADD COLUMN deployment_status public.deployment_status NOT NULL DEFAULT 'NOT_DEPLOYED';

-- Migrate existing deployed boolean to deployment_status
UPDATE public.token_definitions 
SET deployment_status = (CASE WHEN deployed = true THEN 'DEPLOYED' ELSE 'NOT_DEPLOYED' END)::public.deployment_status;

-- Drop the old deployed column
ALTER TABLE public.token_definitions DROP COLUMN deployed;