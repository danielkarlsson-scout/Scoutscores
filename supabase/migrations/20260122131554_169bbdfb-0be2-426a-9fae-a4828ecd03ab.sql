-- Add competition_id column to permission_requests
ALTER TABLE public.permission_requests 
ADD COLUMN competition_id TEXT;

-- Drop old unique constraint and create new one that includes competition
ALTER TABLE public.permission_requests 
DROP CONSTRAINT IF EXISTS permission_requests_user_id_section_status_key;

-- Create new unique constraint including competition_id
ALTER TABLE public.permission_requests
ADD CONSTRAINT permission_requests_user_comp_section_status_key 
UNIQUE (user_id, competition_id, section, status);