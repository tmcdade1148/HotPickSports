// Retired diagnostic. Was used once to confirm ESPN's core API retains closing
// odds for completed games; that work is now in nfl-backfill-odds-espn. Inert.
Deno.serve(() => new Response(JSON.stringify({ gone: true, see: "nfl-backfill-odds-espn" }), { status: 410, headers: { "Content-Type": "application/json" } }));
