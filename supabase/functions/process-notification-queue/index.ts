import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 50;

// Maps notification_type to the column name in notification_preferences
const PREF_COLUMN_MAP: Record<string, string> = {
  picks_deadline: "picks_deadline",
  score_posted: "score_posted",
  leaderboard_change: "leaderboard_change",
  smacktalk_mention: "smacktalk_mention",
  smacktalk_reply: "smacktalk_reply",
  organizer_broadcast: "organizer_broadcast",
  streak_milestone: "streak_milestone",
  new_member_joined: "new_member_joined",
};

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
    );

    // Fetch pending notifications
    const { data: pending, error: fetchErr } = await supabase
      .from("notification_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) {
      return json({ error: fetchErr.message }, 500);
    }

    if (!pending || pending.length === 0) {
      return json({ processed: 0, message: "No pending notifications" }, 200);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const notif of pending) {
      // Check notification preferences — read the specific boolean column
      const prefColumn = PREF_COLUMN_MAP[notif.notification_type];
      if (prefColumn) {
        const { data: prefs } = await supabase
          .from("notification_preferences")
          .select(prefColumn)
          .eq("user_id", notif.user_id)
          .maybeSingle();

        // If user has explicitly set this type to false, skip
        if (prefs && prefs[prefColumn] === false) {
          await supabase
            .from("notification_queue")
            .update({ status: "skipped", sent_at: new Date().toISOString() })
            .eq("id", notif.id);
          skipped++;
          continue;
        }
      }

      // Get active device tokens for this user
      const { data: devices } = await supabase
        .from("user_devices")
        .select("push_token")
        .eq("user_id", notif.user_id)
        .eq("is_active", true);

      if (!devices || devices.length === 0) {
        await supabase
          .from("notification_queue")
          .update({
            status: "skipped",
            error_message: "No active devices",
            sent_at: new Date().toISOString(),
          })
          .eq("id", notif.id);
        skipped++;
        continue;
      }

      // Send to all active devices via Expo Push API
      const messages = devices.map((d: { push_token: string }) => ({
        to: d.push_token,
        title: notif.title,
        body: notif.body,
        data: notif.data || {},
        sound: "default",
      }));

      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(messages),
        });

        const result = await response.json();

        // Check for delivery errors and deactivate bad tokens
        if (result.data) {
          for (let i = 0; i < result.data.length; i++) {
            const ticket = result.data[i];
            if (ticket.status === "error") {
              if (
                ticket.details?.error === "DeviceNotRegistered" ||
                ticket.details?.error === "InvalidCredentials"
              ) {
                await supabase
                  .from("user_devices")
                  .update({ is_active: false })
                  .eq("user_id", notif.user_id)
                  .eq("push_token", devices[i].push_token);
              }
            }
          }
        }

        await supabase
          .from("notification_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", notif.id);
        sent++;
      } catch (pushErr: unknown) {
        const errMsg = pushErr instanceof Error ? pushErr.message : "Unknown push error";
        await supabase
          .from("notification_queue")
          .update({
            status: "failed",
            error_message: errMsg,
            sent_at: new Date().toISOString(),
          })
          .eq("id", notif.id);
        failed++;
      }
    }

    return json({ processed: pending.length, sent, skipped, failed }, 200);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return json({ error: errMsg }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
