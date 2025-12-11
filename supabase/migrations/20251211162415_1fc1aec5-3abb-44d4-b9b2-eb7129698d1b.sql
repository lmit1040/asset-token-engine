-- Drop existing sender cancel policy
DROP POLICY IF EXISTS "Sender can cancel pending requests" ON transfer_requests;

-- Create corrected policy with proper WITH CHECK for cancellation
CREATE POLICY "Sender can cancel pending requests" 
ON transfer_requests
FOR UPDATE
USING ((auth.uid() = from_user_id) AND (status = 'PENDING'::transfer_request_status))
WITH CHECK ((auth.uid() = from_user_id) AND (status = 'CANCELLED'::transfer_request_status));