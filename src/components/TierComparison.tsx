// src/components/TierComparison.tsx
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";

type TierRow = {
  code: "visitor" | "local" | "business";
  display_name: string;
  blurb: string;
  privileges: Record<string, boolean | number | string>;
};

const LABELS: Record<string,string> = {
  requires_login: "Requires login",
  requires_approval: "Approval needed",
  locality_requirement: "Local connection required",
  can_view_business_pages: "View business pages",
  can_view_events: "View events",
  can_view_alerts: "View alerts",
  can_view_feed: "View community feed",
  can_comment: "Comment",
  can_like_follow_share: "Like / Follow / Share (business posts)",
  can_post: "Create posts",
  max_posts_per_week: "Posts per week (limit)",
  can_create_events: "Create events",
  can_tag_content: "Tag content (show on pages)",
  has_qr_invites: "QR invites",
  requires_in_person_check: "In-person verification",
  admin_level: "Admin level",
};

function renderCell(v: boolean | number | string) {
  if (typeof v === "boolean") return v ? "✔︎" : "—";
  if (typeof v === "number") return String(v);
  // strings like "admin|business" or "live|work|family|history"
  return String(v).replaceAll("|", " · ");
}

export default function TierComparison() {
  const [rows, setRows] = useState<TierRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("tier_matrix").select("*").order("code");
      if (!error && data) setRows(data as TierRow[]);
    })();
  }, []);

  // Build a stable, visible set of privilege keys to show (order matters)
  const keys = useMemo(() => [
    "requires_login",
    "requires_approval",
    "locality_requirement",
    "can_view_business_pages",
    "can_view_events",
    "can_view_alerts",
    "can_view_feed",
    "can_comment",
    "can_like_follow_share",
    "can_post",
    "max_posts_per_week",
    "can_create_events",
    "can_tag_content",
    "has_qr_invites",
    "requires_in_person_check",
  ], []);

  if (!rows.length) return null;

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-[720px] w-full border-separate border-spacing-y-1">
        <thead>
          <tr>
            <th className="text-left p-3">Privilege</th>
            {rows.map(r => (
              <th key={r.code} className="text-left p-3">
                <div className="text-base font-semibold">{r.display_name}</div>
                <div className="text-sm opacity-70">{r.blurb}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map(k => (
            <tr key={k} className="bg-white/60 dark:bg-white/5">
              <td className="p-3 font-medium">{LABELS[k] ?? k}</td>
              {rows.map(r => (
                <td key={r.code + k} className="p-3">
                  {r.privileges.hasOwnProperty(k) ? renderCell(r.privileges[k]) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm mt-3 opacity-70">
        Notes: “Local connection required” means live/work/family/history in Burry Port. “Approval needed” means admin or business must approve.
      </p>
    </div>
  );
}
