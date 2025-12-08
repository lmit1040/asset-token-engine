import { supabase } from '@/integrations/supabase/client';

interface SubmissionNotificationParams {
  recipientEmail: string;
  recipientName: string;
  submissionTitle: string;
  newStatus: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
  createdAssetId?: string;
}

export async function sendSubmissionNotification(params: SubmissionNotificationParams): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('send-submission-notification', {
      body: params,
    });

    if (error) {
      console.error('Failed to send submission notification:', error);
      return false;
    }

    console.log('Submission notification sent:', data);
    return true;
  } catch (error) {
    console.error('Error sending submission notification:', error);
    return false;
  }
}
