-- Fix the infinite recursion by creating a proper security definer function
-- for getting the current user's workspace

-- Create a security definer function to get current user's workspace
CREATE OR REPLACE FUNCTION public.get_my_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id 
  FROM public.users 
  WHERE id = auth.uid()
  LIMIT 1
$$;

-- Now update the users policy to use this function
DROP POLICY IF EXISTS "Users can view workspace members" ON public.users;

CREATE POLICY "Users can view workspace members"
ON public.users
FOR SELECT
TO authenticated
USING (
  id = auth.uid() 
  OR workspace_id = public.get_my_workspace_id()
);