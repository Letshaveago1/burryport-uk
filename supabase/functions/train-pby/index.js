/// <reference lib="deno.ns" />
/// <reference lib="dom" />
// DB-backed snapshot — guarantees <= ~16 hits/day with TTL=60m and 06–21 UK window
const ACTIVE_HOURS = { start: 6, end: 21 }; // refresh window (UK hour)
const SNAPSHOT_TTL_MIN = 60; // snapshot freshness (minutes)
const STATION_CRS = "PBY";
const BASE = "https://transportapi.com/v3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function ukNow() { return new Date(new Date().toLocaleString("en-GB", { timeZone: "Europe/London" })); }
function ukHour() { return parseInt(new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false })); }
function cors() {
    return {
        "Access-Control-Allow-Origin": "*", // tighten to your domains later
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
}
function json(body, status = 200, clientMaxAge = 600, edgeMaxAge = 600) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${clientMaxAge}, s-maxage=${edgeMaxAge}`, ...cors() },
    });
}
Deno.serve(async (req) => {
    const urlObj = new URL(req.url);
    if (req.method === "OPTIONS")
        return new Response(null, { headers: cors() });
    // health check
    if (urlObj.searchParams.get("ping") === "1") {
        return json({ ok: true, ts: Date.now() }, 200, 0, 0);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL"); // auto-injected by Supabase
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); // you set in secrets
    const sb = createClient(supabaseUrl, serviceKey);
    // 1) Read current snapshot
    const { data: row, error: readErr } = await sb.from("app_cache").select("payload,updated_at").eq("key", "train-pby").maybeSingle();
    const now = ukNow();
    const isFresh = row?.updated_at ? (now.getTime() - new Date(row.updated_at).getTime()) < SNAPSHOT_TTL_MIN * 60_000 : false;
    // 2) If fresh OR outside active hours, serve snapshot (or empty structure if none yet)
    const withinHours = ukHour() >= ACTIVE_HOURS.start && ukHour() < ACTIVE_HOURS.end;
    if (row && (isFresh || !withinHours)) {
        return json(row.payload);
    }
    if (!withinHours && !row) {
        // no snapshot yet and outside window -> return empty shell, no upstream call
        return json({ station: { name: "Pembrey & Burry Port", crs: "PBY" }, departures: { all: [] } });
    }
    // 3) We need to refresh snapshot from TransportAPI (first time, or stale + within window)
    const appId = Deno.env.get("TRANSPORT_API_APP_ID");
    const appKey = Deno.env.get("TRANSPORT_API_APP_KEY");
    if (!appId || !appKey)
        return json({ error: "Missing TransportAPI credentials" }, 500);
    const params = new URLSearchParams({
        app_id: appId, app_key: appKey,
        type: "departure", train_status: "passenger",
        from_offset: "PT00:00:00", to_offset: "PT02:00:00", limit: "20"
    });
    const url = `${BASE}/uk/train/station_timetables/crs:${STATION_CRS}.json?${params.toString()}`;
    let payload;
    try {
        const r = await fetch(url, { headers: { "User-Agent": "burryport.uk-edge-fn/1.0" } });
        if (!r.ok) {
            // Serve stale if we have it, otherwise bubble upstream error
            if (row)
                return json(row.payload);
            return json({ error: `Upstream ${r.status}` }, 502);
        }
        const raw = await r.json();
        // normalize + trim for banner
        const stationName = raw?.station_name ?? "Pembrey & Burry Port";
        const stationCode = (raw?.station_code ?? "").replace(/^crs:/, "") || "PBY";
        const list = Array.isArray(raw?.departures?.all) ? raw.departures.all : [];
        const mapped = list.slice(0, 10).map((d) => ({
            aimed_departure_time: d?.aimed_departure_time ?? null,
            expected_departure_time: null,
            destination_name: d?.destination_name ?? d?.destination?.name ?? null,
            platform: d?.platform ?? d?.platform_number ?? null,
            status: "Scheduled"
        }));
        payload = { station: { name: stationName, crs: stationCode, date: raw?.date ?? null, time_of_day: raw?.time_of_day ?? null },
            departures: { all: mapped } };
    }
    catch (e) {
        // On network error, serve stale if present
        if (row)
            return json(row.payload);
        return json({ error: "Upstream fetch failed" }, 502);
    }
    // 4) Upsert snapshot (service role bypasses RLS)
    await sb.from("app_cache").upsert({ key: "train-pby", payload, updated_at: now.toISOString() });
    // 5) Serve fresh snapshot
    return json(payload);
});
