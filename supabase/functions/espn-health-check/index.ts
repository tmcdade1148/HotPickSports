import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ESPN endpoints used by HotPick
const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ESPN_SCHEDULE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20250906";

// Expected response shape markers
const EXPECTED_KEYS = ["events", "leagues"];
const EXPECTED_EVENT_KEYS = ["id", "name", "competitions"];
const EXPECTED_COMPETITION_KEYS = ["competitors", "status"];

interface HealthResult {
  endpoint: string;
  status: "healthy" | "degraded" | "down";
  http_status: number | null;
  response_time_ms: number;
  shape_valid: boolean;
  detail: string;
}

async function checkEndpoint(url: string, name: string): Promise<HealthResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HotPickSports/2.0 HealthCheck" },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      return {
        endpoint: name,
        status: "down",
        http_status: res.status,
        response_time_ms: elapsed,
        shape_valid: false,
        detail: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();

    // Validate response shape
    const hasExpectedKeys = EXPECTED_KEYS.every((k) => k in data);
    let shapeValid = hasExpectedKeys;
    let detail = "";

    if (!hasExpectedKeys) {
      detail = `Missing top-level keys. Found: ${Object.keys(data).join(", ")}`;
      shapeValid = false;
    } else if (data.events && data.events.length > 0) {
      const event = data.events[0];
      const hasEventKeys = EXPECTED_EVENT_KEYS.every((k) => k in event);
      if (!hasEventKeys) {
        detail = `Event shape changed. Found: ${Object.keys(event).join(", ")}`;
        shapeValid = false;
      } else if (event.competitions && event.competitions.length > 0) {
        const comp = event.competitions[0];
        const hasCompKeys = EXPECTED_COMPETITION_KEYS.every((k) => k in comp);
        if (!hasCompKeys) {
          detail = `Competition shape changed. Found: ${Object.keys(comp).join(", ")}`;
          shapeValid = false;
        } else {
          detail = `OK — ${data.events.length} events, shape valid`;
        }
      } else {
        detail = "OK — events found but no competitions (offseason normal)";
      }
    } else {
      detail = "OK — no events (offseason normal)";
    }

    // Degraded if response is slow (> 5s) or shape changed
    const status = !shapeValid
      ? "degraded"
      : elapsed > 5000
      ? "degraded"
      : "healthy";

    return {
      endpoint: name,
      status,
      http_status: res.status,
      response_time_ms: elapsed,
      shape_valid: shapeValid,
      detail,
    };
  } catch (err: unknown) {
    const elapsed = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return {
      endpoint: name,
      status: "down",
      http_status: null,
      response_time_ms: elapsed,
      shape_valid: false,
      detail: `Fetch failed: ${errMsg}`,
    };
  }
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check both endpoints
    const [scoreboard, schedule] = await Promise.all([
      checkEndpoint(ESPN_SCOREBOARD, "scoreboard"),
      checkEndpoint(ESPN_SCHEDULE, "schedule"),
    ]);

    const results = [scoreboard, schedule];
    const anyDown = results.some((r) => r.status === "down");
    const anyDegraded = results.some((r) => r.status === "degraded");
    const overallStatus = anyDown ? "down" : anyDegraded ? "degraded" : "healthy";

    // If unhealthy, alert Tom via notification queue
    if (overallStatus !== "healthy") {
      // Get Tom's user IDs (is_super_admin)
      const { data: admins } = await supabase
        .from("profiles")
        .select("id")
        .eq("is_super_admin", true);

      const failedEndpoints = results
        .filter((r) => r.status !== "healthy")
        .map((r) => `${r.endpoint}: ${r.detail}`)
        .join("; ");

      for (const admin of admins ?? []) {
        await supabase.from("notification_queue").insert({
          user_id: admin.id,
          notification_type: "system",
          title: `⚠️ ESPN API ${overallStatus.toUpperCase()}`,
          body: failedEndpoints.slice(0, 200),
          status: "pending",
        });
      }
    }

    // Log to competition_config for dashboard visibility
    await supabase
      .from("competition_config")
      .upsert(
        {
          competition: "global",
          key: "espn_health_status",
          value: JSON.stringify({
            status: overallStatus,
            checked_at: new Date().toISOString(),
            endpoints: results,
          }),
          description: "ESPN API health check result (auto-updated)",
        },
        { onConflict: "competition,key" },
      );

    return new Response(
      JSON.stringify({
        overall: overallStatus,
        checked_at: new Date().toISOString(),
        endpoints: results,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
