// src/components/OnboardingWizard.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import PolicyAgreement from "./PolicyAgreement";
import { Info } from "./Info";

type Answers = {
  intent?: "visit" | "live" | "work" | "family" | "business";
  email?: string;
  wantsSMS?: boolean;
  ageBracket?: "16+" | "13-15" | "under-13";
  parentEmail?: string;
  proof?: "postcode" | "employer" | "family" | "history";
  postcode?: string;
  agreedToTerms?: boolean;
  agreedToPrivacy?: boolean;
  agreedToRules?: boolean;
  alerts?: boolean;
};

const STEPS = ["intent", "age", "parental-consent", "contact", "verify", "terms", "summary"] as const;

export default function OnboardingWizard() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function next() {
    setStep((s) => {
      let nextIdx = s + 1;
      // Skip verify for pure Visitor flow
      if (STEPS[nextIdx] === "verify" && a.intent === "visit") { nextIdx++; }
      // Skip parental consent unless user is 13-15
      if (STEPS[nextIdx] === "parental-consent" && a.ageBracket !== "13-15") { nextIdx++; }
      return Math.min(nextIdx, STEPS.length - 1);
    });
  }

  function back() {
    setStep((s) => {
      let prevIdx = s - 1;
      if (STEPS[prevIdx] === "verify" && a.intent === "visit") prevIdx--;
      // Skip parental consent unless user is 13-15
      if (STEPS[prevIdx] === "parental-consent" && a.ageBracket !== "13-15") { prevIdx--; }
      return Math.max(prevIdx, 0);
    });
  }

  async function finish() {
    setBusy(true);
    setErr(null);
    try {
      // Never trust only context—ask Supabase directly
      const { data } = await supabase.auth.getUser();
      const user = data.user ?? null;
      const nextPath = "/"; // you don't have /home or /welcome right now

      // Not signed in → send to SIGNUP with email + next
      if (!user) {
        const q = new URLSearchParams({
          email: a.email || "",
          next: nextPath,
          // Pass consent info to the signup page
          agreedToTerms: a.agreedToTerms ? 'true' : 'false',
          agreedToPrivacy: a.agreedToPrivacy ? 'true' : 'false',
          agreedToRules: a.agreedToRules ? 'true' : 'false',
        });
        nav(`/signup?${q.toString()}`);
        return;
      }

      // Signed-in path: best-effort writes (RLS policies must allow these)
      if (a.agreedToTerms) {
        await supabase
          .from("user_consent")
          .insert({ user_id: user.id, doc_key: "terms", version: 1, user_agent: navigator.userAgent });
      }
      if (a.agreedToPrivacy) {
        await supabase
          .from("user_consent")
          .insert({
            user_id: user.id,
            doc_key: "privacy-policy",
            version: 1,
            user_agent: navigator.userAgent,
          });
      }
      if (a.agreedToRules) {
        await supabase
          .from("user_consent")
          .insert({ user_id: user.id, doc_key: "rules", version: 1, user_agent: navigator.userAgent });
      }

      if (a.ageBracket) {
        await supabase
          .from("profiles")
          .update({
            over_18_verified: a.ageBracket === "16+", // Assuming 16+ is the main tier for now
            age_verified_at: new Date().toISOString(),
            age_verification_method: "self_attest_onboarding",
          })
          .eq("user_id", user.id);
      }

      await supabase
        .from("onboarding_responses")
        .insert({ user_id: user.id, answers: a });

      nav(nextPath);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = STEPS[step];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="text-sm opacity-70">Step {step + 1} / {STEPS.length}</div>
        <h1 className="text-2xl font-bold">Get started</h1>
      </div>

      {s === "intent" && (
        <section className="space-y-3">
          <label className="flex items-center gap-2">
            What best describes you?
            <Info text="This helps suggest the right account tier." />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {([
              ["visit", "Visitor — just visiting"],
              ["live", "Local — live in/near Burry Port"],
              ["work", "Local — work in Burry Port"],
              ["family", "Local — family/history here"],
              ["business", "Business — owner/manager/charity"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => {
                  setA((prev) => ({ ...prev, intent: v }));
                  next();
                }}
                className={`p-3 rounded-xl border border-sea/30 hover:bg-sea/10 ${
                  a.intent === v ? "ring-2 ring-sea" : ""
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      {s === "age" && (
        <section className="space-y-3">
          <label className="flex items-center gap-2">
            Please select your age group
            <Info text="Users under 13 are not permitted. Users aged 13-15 require parental consent to join." />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(["16+", "13-15", "under-13"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setA((p) => ({ ...p, ageBracket: v }))}
                className={`p-3 rounded-xl border border-sea/30 hover:bg-sea/10 ${
                  a.ageBracket === v ? (v === 'under-13' ? "ring-2 ring-lighthouse" : "ring-2 ring-sea") : ""
                }`}
              >
                {v === '16+' ? '16 or over' : v === '13-15' ? '13 to 15' : 'Under 13'}
              </button>
            ))}
          </div>
          {a.ageBracket === 'under-13' && (
            <div className="p-3 bg-sand border border-lighthouse rounded-lg text-charcoal">
              <p className="font-semibold">Sorry, you must be at least 13 to use BurryPort.uk.</p>
              <p className="text-sm">This is to comply with regulations and ensure a safe online environment for everyone.</p>
            </div>
          )}
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>
              Back
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-sea text-white"
              onClick={next}
              disabled={!a.ageBracket || a.ageBracket === 'under-13'}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {s === "parental-consent" && (
        <section className="space-y-3">
          <label className="flex items-center gap-2">
            Parental Consent
            <Info text="We need a parent or guardian's email to send a consent request. Your account will be limited until they approve it." />
          </label>
          <input className="w-full p-3 rounded-xl border border-sea/30 bg-white/70 placeholder-charcoal/50 focus:ring-sea focus:border-sea" type="email" placeholder="parent@example.com" value={a.parentEmail ?? ""} onChange={(e) => setA((p) => ({ ...p, parentEmail: e.target.value }))} />
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>
              Back
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-sea text-white"
              onClick={next}
              disabled={!a.parentEmail}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {s === "contact" && (
        <section className="space-y-3">
          <label className="flex items-center gap-2">
            Contact email
            <Info text="We’ll use this for sign-in and important alerts." />
          </label>
          <input
            className="w-full p-3 rounded-xl border border-sea/30 bg-white/70 placeholder-charcoal/50 focus:ring-sea focus:border-sea"
            type="email"
            placeholder="you@example.com"
            value={a.email ?? ""}
            onChange={(e) => setA((p) => ({ ...p, email: e.target.value }))}
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!a.wantsSMS}
              onChange={(e) => setA((p) => ({ ...p, wantsSMS: e.target.checked }))}
            />
            <span>Also share a mobile later for SMS alerts (optional)</span>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>
              Back
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-sea text-white"
              onClick={next}
              disabled={!a.email}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {s === "verify" && a.intent !== "business" && (
        <section className="space-y-3">
          <label className="flex items-center gap-2">
            Local connection
            <Info text="Local tier needs a genuine link to Burry Port: live/work/family/history." />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {([
              ["postcode", "Postcode (SA16 or nearby)"],
              ["employer", "Employer in Burry Port"],
              ["family", "Family link"],
              ["history", "Lived here before"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setA((p) => ({ ...p, proof: v }))}
                className={`p-3 rounded-xl border border-sea/30 hover:bg-sea/10 ${
                  a.proof === v ? "ring-2 ring-sea" : ""
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {a.proof === "postcode" && (
            <input
              className="w-full p-3 rounded-xl border border-sea/30 bg-white/70 placeholder-charcoal/50 focus:ring-sea focus:border-sea"
              placeholder="SA16 …"
              value={a.postcode ?? ""}
              onChange={(e) => setA((p) => ({ ...p, postcode: e.target.value }))}
            />
          )}
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>
              Back
            </button>
            <button className="px-4 py-2 rounded-xl bg-sea text-white" onClick={next}>
              Continue
            </button>
          </div>
        </section>
      )}

      {s === "verify" && a.intent === "business" && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            Business verification is manual during beta.
            <Info text="We’ll reach out after you sign up to verify your page." />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>
              Back
            </button>
            <button className="px-4 py-2 rounded-xl bg-sea text-white" onClick={next}>
              Continue
            </button>
          </div>
        </section>
      )}

      {s === "terms" && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            Please review and agree to our policies
            <Info text="You must open each section, scroll to the bottom, and check the box to agree before you can continue." />
          </div>
          <div className="space-y-2">
            <PolicyAgreement slug="terms" title="Terms of Use" isAgreed={!!a.agreedToTerms} onAgreeChange={(v) => setA(p => ({...p, agreedToTerms: v}))} />
            <PolicyAgreement slug="privacy-policy" title="Privacy Policy" isAgreed={!!a.agreedToPrivacy} onAgreeChange={(v) => setA(p => ({...p, agreedToPrivacy: v}))} />
            <PolicyAgreement slug="rules" title="Community Rules" isAgreed={!!a.agreedToRules} onAgreeChange={(v) => setA(p => ({...p, agreedToRules: v}))} />
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>
              Back
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-sea text-white"
              onClick={next}
              disabled={!a.agreedToTerms || !a.agreedToPrivacy || !a.agreedToRules}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {s === "summary" && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Summary</h2>
          <ul className="list-disc pl-6 text-sm">
            <li>Path: {a.intent}</li>
            <li>Email: {a.email}</li>
            <li>Age Group: {a.ageBracket}</li>
            {a.ageBracket === '13-15' && <li>Parent/Guardian Email: {a.parentEmail}</li>}
            {a.intent !== "business" && (
              <li>
                Local check: {a.proof} {a.postcode ? `(${a.postcode})` : ""}
              </li>
            )}
            <li>Policies Agreed: {a.agreedToTerms && a.agreedToPrivacy && a.agreedToRules ? "Yes" : "No"}</li>
          </ul>
          {err && <div className="text-lighthouse text-sm">{err}</div>}
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>
              Back
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-lighthouse text-white"
              onClick={finish}
              disabled={busy}
            >
              {busy ? "Saving…" : "Finish & Continue"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
