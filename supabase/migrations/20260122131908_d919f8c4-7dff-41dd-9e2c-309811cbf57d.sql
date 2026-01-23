-- Create table for public patrol registrations
CREATE TABLE public.patrol_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id TEXT NOT NULL,
  patrol_name TEXT NOT NULL,
  scout_group_name TEXT NOT NULL,
  section public.scout_section NOT NULL,
  member_count INTEGER,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patrol_registrations ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert registrations (public form)
CREATE POLICY "Anyone can create registrations"
ON public.patrol_registrations
FOR INSERT
WITH CHECK (status = 'pending');

-- Allow anyone to view their own registration by id (for confirmation)
CREATE POLICY "Anyone can view registrations"
ON public.patrol_registrations
FOR SELECT
USING (true);

-- Admins can manage all registrations
CREATE POLICY "Admins can manage registrations"
ON public.patrol_registrations
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_patrol_registrations_updated_at
BEFORE UPDATE ON public.patrol_registrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();