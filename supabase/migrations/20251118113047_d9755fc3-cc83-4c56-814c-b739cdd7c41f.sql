-- Create a security definer function to check workspace membership
-- This prevents infinite recursion in RLS policies
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND workspace_id = _workspace_id
  )
$$;

-- Update users table RLS policy to prevent infinite recursion
DROP POLICY IF EXISTS "Users can view workspace members" ON public.users;
CREATE POLICY "Users can view workspace members"
ON public.users
FOR SELECT
TO authenticated
USING (
  workspace_id IN (
    SELECT workspace_id 
    FROM public.users 
    WHERE id = auth.uid()
    LIMIT 1
  )
);

-- Update conversations policy to use the new function
DROP POLICY IF EXISTS "Users can view workspace conversations" ON public.conversations;
CREATE POLICY "Users can view workspace conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Users can update workspace conversations" ON public.conversations;
CREATE POLICY "Users can update workspace conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (public.user_has_workspace_access(workspace_id));

-- Update customers policies
DROP POLICY IF EXISTS "Users can view workspace customers" ON public.customers;
CREATE POLICY "Users can view workspace customers"
ON public.customers
FOR SELECT
TO authenticated
USING (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Users can create customers" ON public.customers;
CREATE POLICY "Users can create customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS "Users can update workspace customers" ON public.customers;
CREATE POLICY "Users can update workspace customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (public.user_has_workspace_access(workspace_id));