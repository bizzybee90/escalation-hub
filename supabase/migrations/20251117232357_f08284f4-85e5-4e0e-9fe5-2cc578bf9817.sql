-- Allow authenticated users to insert test messages
CREATE POLICY "Authenticated users can insert test messages"
  ON public.escalated_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);