import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    // Get the user's JWT to identify who is deleting
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    // Verify the caller's identity from their JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const userId = user.id;

    // Step 1: Anonymize profile + soft-delete memberships via existing RPC
    const { error: anonError } = await supabase.rpc("anonymize_deleted_user", {
      p_user_id: userId,
    });

    if (anonError) {
      console.error("[delete-account] anonymize_deleted_user error:", anonError.message);
      return json({ success: false, error: anonError.message }, 500);
    }

    // Step 2: Delete the auth user via admin API
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("[delete-account] auth.admin.deleteUser error:", deleteError.message);
      return json({ success: false, error: deleteError.message }, 500);
    }

    console.log(`[delete-account] User ${userId} fully deleted`);
    return json({ success: true }, 200);
  } catch (err) {
    console.error("[delete-account] Fatal:", err);
    return json({ success: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
