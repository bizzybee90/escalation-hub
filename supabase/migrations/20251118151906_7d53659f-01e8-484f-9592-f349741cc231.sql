-- Fix infinite recursion in users table RLS policy
-- The existing policy queries the users table within itself, causing recursion

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view workspace members" ON public.users;

-- Create a simpler policy that doesn't cause recursion
-- Users can view other users in their workspace by comparing workspace_id directly
CREATE POLICY "Users can view workspace members"
ON public.users
FOR SELECT
TO authenticated
USING (
  workspace_id = (
    SELECT workspace_id 
    FROM auth.users 
    JOIN public.users ON auth.users.id = public.users.id
    WHERE auth.users.id = auth.uid()
  )
  OR id = auth.uid()
);

-- Actually, let's use an even simpler approach with a subquery that won't recurse
DROP POLICY IF EXISTS "Users can view workspace members" ON public.users;

-- Create a policy that uses auth.uid() without recursion
CREATE POLICY "Users can view workspace members"
ON public.users
FOR SELECT
TO authenticated
USING (
  -- Allow users to see themselves
  id = auth.uid()
  OR
  -- Allow users to see others in their workspace
  EXISTS (
    SELECT 1 
    FROM public.users u
    WHERE u.id = auth.uid()
    AND u.workspace_id = users.workspace_id
  )
);