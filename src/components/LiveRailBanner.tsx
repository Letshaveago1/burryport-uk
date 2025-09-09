// src/components/LiveRailBanner.tsx
import { useEffect, useState } from "react";

type Dep = {
  aimed_departure_time?: string | null;
  expected_departure_time?: string | null;
  destination_name?: string | null;
  platform?: string | number | null;
  status?: string | null;
};
type Station = { name?: string | null; crs?: string | null; date?: string | null; time_of_day?: string | null };

export default function LiveRailBanner() {
  const [deps, setDeps] = useState<Dep[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setErr(null);
      setLoading(true);

      const url = import.meta.env.VITE_PBY_ENDPOINT; // force the function URL
      console.log("[LiveRailBanner] fetching:", url); // remove once stable

      const res = await fetch(url, { cache: "no-store" });
      const ct = res.headers.get("content-type") || "";

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      if (!ct.includes("application/json")) {
        const text = await res.text().catch(() => "");
        throw new Error(`Non-JSON response (${ct}): ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      setStation(data?.station ?? null);
      setDeps(Array.isArray(data?.departures?.all) ? data.departures.all : []);
    } catch (e: any) {
      setErr(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10 * 60_000); // every 10 minutes
    return () => clearInterval(t);
  }, []);

  // Keep the card visible so errors are readable; hide only if truly empty & no error.
  const hide = !loading && !err && deps.length === 0;
  if (hide) return null;

  return (
    <div style={{ background: "#FFFBEB", borderBottom: "1px solid #FCD34D" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "8px 12px" }}>
        <div style={{ border: "1px solid #FACC15", background: "#FEF3C7", padding: 10, borderRadius: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                background: "#F59E0B",
                color: "white",
                padding: "2px 6px",
                borderRadius: 6,
              }}
            >
              transport
            </span>
            <div style={{ fontWeight: 700 }}>
              {(station?.name && station?.crs) ? `${station.name} (${station.crs}) departures` : "Pembrey & Burry Port (PBY) departures"}
            </div>
            {loading && <span style={{ fontSize: 12, opacity: 0.7, marginLeft: "auto" }}>loading…</span>}
            {err && <span style={{ color: "#b00020", marginLeft: "auto" }}>Error: {err}</span>}
          </div>

          {deps.length > 0 && (
            <>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {deps.slice(0, 10).map((d, i) => (
                  <li
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "64px 1fr auto auto",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 0",
                      borderBottom: i < deps.length - 1 ? "1px dotted #FACC15" : "none",
                    }}
                  >
                    <span style={{ fontFamily: "monospace" }}>{d.aimed_departure_time ?? "—"}</span>
                    <span
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={d.destination_name ?? ""}
                    >
                      {d.destination_name ?? "—"}
                    </span>
                    {/* platform (optional) */}
                    {d.platform ? (
                      <span style={{ opacity: 0.8 }}>Plat {d.platform}</span>
                    ) : (
                      <span style={{ opacity: 0.3 }} />
                    )}
                    <span
                      style={{
                        color:
                          d?.status && /cancel/i.test(d.status)
                            ? "#B91C1C"
                            : d?.status && /late|delay/i.test(d.status)
                            ? "#92400E"
                            : "#166534",
                        fontWeight: 600,
                      }}
                    >
                      {d.status || "Scheduled"}
                    </span>
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>
                Timetable (scheduled). Updates hourly to protect free API quota.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
