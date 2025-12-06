import { supabase } from '@/integrations/supabase/client';

interface SendNotificationParams {
  type: 'assignment' | 'transfer';
  recipientEmail: string;
  recipientName: string | null;
  tokenSymbol: string;
  tokenName: string;
  amount: number;
  fromUserEmail?: string;
  fromUserName?: string | null;
}

export async function sendTokenNotification(params: SendNotificationParams): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('send-token-notification', {
      body: params,
    });

    if (error) {
      console.error('Failed to send token notification:', error);
    } else {
      console.log('Token notification sent:', data);
    }
  } catch (error) {
    console.error('Error invoking send-token-notification:', error);
  }
}
