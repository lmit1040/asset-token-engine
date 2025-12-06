import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TokenNotificationRequest {
  type: "assignment" | "transfer";
  recipientEmail: string;
  recipientName: string;
  tokenSymbol: string;
  tokenName: string;
  amount: number;
  fromUserEmail?: string;
  fromUserName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: TokenNotificationRequest = await req.json();
    console.log("Sending token notification:", data);

    const { type, recipientEmail, recipientName, tokenSymbol, tokenName, amount, fromUserEmail, fromUserName } = data;

    let subject: string;
    let htmlContent: string;

    if (type === "assignment") {
      subject = `You've received ${amount} ${tokenSymbol} tokens`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a1a2e;">Token Assignment Notification</h1>
          <p>Hello ${recipientName || "User"},</p>
          <p>You have been assigned tokens in MetallumX Vault:</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Token:</strong> ${tokenName} (${tokenSymbol})</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount}</p>
          </div>
          <p>Log in to your dashboard to view your updated holdings.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated message from MetallumX Vault. Please do not reply to this email.
          </p>
        </div>
      `;
    } else {
      subject = `You've received ${amount} ${tokenSymbol} tokens from ${fromUserName || fromUserEmail}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a1a2e;">Token Transfer Notification</h1>
          <p>Hello ${recipientName || "User"},</p>
          <p>You have received a token transfer in MetallumX Vault:</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Token:</strong> ${tokenName} (${tokenSymbol})</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount}</p>
            <p style="margin: 5px 0;"><strong>From:</strong> ${fromUserName || fromUserEmail}</p>
          </div>
          <p>Log in to your dashboard to view your updated holdings.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This is an automated message from MetallumX Vault. Please do not reply to this email.
          </p>
        </div>
      `;
    }

    const emailResponse = await resend.emails.send({
      from: "MetallumX Vault <onboarding@resend.dev>",
      to: [recipientEmail],
      subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending token notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
