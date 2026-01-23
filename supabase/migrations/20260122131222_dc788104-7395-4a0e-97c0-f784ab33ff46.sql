-- Create table for permission requests
CREATE TABLE public.permission_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  section scout_section NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (user_id, section, status)
);

-- Enable RLS
ALTER TABLE public.permission_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
CREATE POLICY "Users can view their own requests"
ON public.permission_requests
FOR SELECT
USING (user_id = auth.uid());

-- Users can create their own pending requests
CREATE POLICY "Users can create their own requests"
ON public.permission_requests
FOR INSERT
WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Users can delete their own pending requests
CREATE POLICY "Users can delete their own pending requests"
ON public.permission_requests
FOR DELETE
USING (user_id = auth.uid() AND status = 'pending');

-- Admins can view all requests
CREATE POLICY "Admins can view all requests"
ON public.permission_requests
FOR SELECT
USING (is_admin(auth.uid()));

-- Admins can update requests (approve/deny)
CREATE POLICY "Admins can update requests"
ON public.permission_requests
FOR UPDATE
USING (is_admin(auth.uid()));

-- Admins can delete any requests
CREATE POLICY "Admins can delete requests"
ON public.permission_requests
FOR DELETE
USING (is_admin(auth.uid()));

-- Trigger to update updated_at
CREATE TRIGGER update_permission_requests_updated_at
BEFORE UPDATE ON public.permission_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();