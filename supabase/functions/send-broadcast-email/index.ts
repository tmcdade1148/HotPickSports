// supabase/functions/send-broadcast-email/index.ts
// Sends broadcast emails to all active pool members.
// Called by the client after broadcast_to_pool RPC succeeds.
// Uses Supabase's built-in email via auth.admin or a Resend/SendGrid integration.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = "HotPick Sports <noreply@hotpicksports.com>";

interface BroadcastEmailRequest {
  pool_id: string;
  message: string;
  sender_name: string;
}

Deno.serve(async (req) => {
  try {
    // Verify the request has auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const body: BroadcastEmailRequest = await req.json();
    const { pool_id, message, sender_name } = body;

    if (!pool_id || !message) {
      return json({ success: false, error: "Missing pool_id or message" }, 400);
    }

    // Get pool name
    const { data: pool } = await supabase
      .from("pools")
      .select("name")
      .eq("id", pool_id)
      .single();

    const poolName = pool?.name ?? "your pool";

    // Get active member emails (excluding the sender)
    // Extract sender user_id from the JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    const senderId = caller?.id;

    const { data: members } = await supabase
      .from("pool_members")
      .select("user_id")
      .eq("pool_id", pool_id)
      .eq("status", "active")
      .neq("user_id", senderId ?? "");

    if (!members || members.length === 0) {
      return json({ success: true, sent: 0 });
    }

    const memberIds = members.map((m: any) => m.user_id);

    // Get email addresses from auth.users via profiles join
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, first_name")
      .in("id", memberIds);

    const emails = (profiles ?? [])
      .filter((p: any) => p.email)
      .map((p: any) => ({
        email: p.email,
        name: p.first_name ?? "HotPick Player",
      }));

    if (emails.length === 0) {
      return json({ success: true, sent: 0 });
    }

    // Send emails via Resend (if API key is configured)
    if (RESEND_API_KEY) {
      let sentCount = 0;

      // Send individually for personalization
      for (const recipient of emails) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: [recipient.email],
              subject: `📢 ${sender_name} posted in ${poolName}`,
              html: buildEmailHtml({
                recipientName: recipient.name,
                senderName: sender_name,
                poolName,
                message,
              }),
            }),
          });

          if (res.ok) {
            sentCount++;
          } else {
            const errBody = await res.text();
            console.error(
              `[broadcast-email] Failed for ${recipient.email}:`,
              errBody
            );
          }
        } catch (emailErr) {
          console.error(
            `[broadcast-email] Error sending to ${recipient.email}:`,
            emailErr
          );
        }
      }

      console.log(
        `[broadcast-email] Sent ${sentCount}/${emails.length} emails for pool ${pool_id}`
      );
      return json({ success: true, sent: sentCount });
    }

    // No email provider configured — log and return
    console.log(
      `[broadcast-email] No RESEND_API_KEY configured. Would send to ${emails.length} recipients.`
    );
    return json({ success: true, sent: 0, note: "No email provider configured" });

  } catch (err) {
    console.error("[broadcast-email] Fatal:", err);
    return json({ success: false, error: String(err) }, 500);
  }
});

function buildEmailHtml({
  recipientName,
  senderName,
  poolName,
  message,
}: {
  recipientName: string;
  senderName: string;
  poolName: string;
  message: string;
}): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body style="margin:0;padding:0;background-color:#111414;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#111414;padding:40px 20px;">
        <tr>
          <td align="center">
            <table width="100%" style="max-width:480px;background-color:#1E2222;border-radius:12px;overflow:hidden;">
              <!-- Header -->
              <tr>
                <td style="background-color:#F66321;padding:20px 24px;">
                  <h1 style="margin:0;color:#FFFFFF;font-size:20px;font-weight:700;">
                    📢 Pool Broadcast
                  </h1>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:24px;">
                  <p style="color:#A0A0A0;font-size:14px;margin:0 0 8px;">
                    Hey ${recipientName},
                  </p>
                  <p style="color:#A0A0A0;font-size:14px;margin:0 0 20px;">
                    <strong style="color:#F5F5F5;">${senderName}</strong> posted a message in <strong style="color:#F5F5F5;">${poolName}</strong>:
                  </p>
                  <!-- Message box -->
                  <div style="background-color:#2A2E2E;border-left:4px solid #F66321;border-radius:8px;padding:16px;margin-bottom:24px;">
                    <p style="color:#F5F5F5;font-size:16px;line-height:1.5;margin:0;">
                      ${escapeHtml(message)}
                    </p>
                  </div>
                  <p style="color:#A0A0A0;font-size:13px;margin:0;">
                    Open HotPick Sports to check it out and respond in SmackTalk.
                  </p>
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding:16px 24px;border-top:1px solid #333;">
                  <p style="color:#666;font-size:11px;margin:0;text-align:center;">
                    HotPick Sports — Pick once. Play every pool.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
