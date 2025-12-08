import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubmissionNotificationRequest {
  recipientEmail: string;
  recipientName: string;
  submissionTitle: string;
  newStatus: "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  adminNotes?: string;
  createdAssetId?: string;
}

const STATUS_MESSAGES = {
  UNDER_REVIEW: {
    subject: "Your asset submission is under review",
    heading: "Submission Under Review",
    message: "Your asset submission is now being reviewed by our team. We'll notify you once a decision has been made.",
    color: "#3b82f6",
  },
  APPROVED: {
    subject: "Your asset submission has been approved!",
    heading: "Submission Approved",
    message: "Great news! Your asset submission has been approved and added to the vault inventory.",
    color: "#10b981",
  },
  REJECTED: {
    subject: "Update on your asset submission",
    heading: "Submission Not Approved",
    message: "After careful review, your asset submission was not approved at this time.",
    color: "#ef4444",
  },
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: SubmissionNotificationRequest = await req.json();
    console.log("Sending submission notification:", data);

    const { recipientEmail, recipientName, submissionTitle, newStatus, adminNotes, createdAssetId } = data;

    const statusInfo = STATUS_MESSAGES[newStatus];

    let notesSection = "";
    if (adminNotes) {
      notesSection = `
        <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #6b7280;">
          <p style="margin: 0 0 5px 0; font-weight: 600; color: #374151;">Reviewer Notes:</p>
          <p style="margin: 0; color: #4b5563;">${adminNotes}</p>
        </div>
      `;
    }

    let assetLinkSection = "";
    if (newStatus === "APPROVED" && createdAssetId) {
      assetLinkSection = `
        <p style="margin-top: 20px;">
          You can view your new asset in the vault inventory.
        </p>
      `;
    }

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">MetallumX Vault</h1>
        </div>
        
        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 30px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; background: ${statusInfo.color}20; color: ${statusInfo.color}; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px;">
              ${statusInfo.heading}
            </span>
          </div>
          
          <p style="color: #374151;">Hello ${recipientName || "there"},</p>
          
          <p style="color: #374151;">${statusInfo.message}</p>
          
          <div style="background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; color: #6b7280; font-size: 13px;">Submission</p>
            <p style="margin: 5px 0 0 0; font-weight: 600; color: #1f2937; font-size: 16px;">${submissionTitle}</p>
          </div>
          
          ${notesSection}
          ${assetLinkSection}
          
          <p style="color: #374151; margin-top: 20px;">
            Log in to your dashboard to view more details.
          </p>
        </div>
        
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 30px;">
          This is an automated message from MetallumX Vault. Please do not reply to this email.
        </p>
      </div>
    `;

    const emailResponse = await resend.emails.send({
      from: "MetallumX Vault <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `${statusInfo.subject} - ${submissionTitle}`,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending submission notification:", error);
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
