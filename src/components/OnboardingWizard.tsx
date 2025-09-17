import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

type Answers = {
  intent?: "visit" | "live" | "work" | "family" | "business";
  name?: string;
  email?: string;
  dob?: string; // Date of Birth
  local_biz_connection?: number | "new"; // Business ID for local verification
  new_local_biz_name?: string; // If they add a new one
  businessName?: string;
};

const steps = [
  "intent",
  "details", // Combined name, email, dob
  "local_verify",
  "business_details",
  "summary",
] as const;

export default function OnboardingWizard() {
  const [stepIdx, setStepIdx] = useState(0);
  const [a, setA] = useState<Answers>({});

  // For business selection dropdowns
  const [businesses, setBusinesses] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    // Fetch businesses for dropdowns
    (async () => {
      const { data } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("status", "approved")
        .order("name");
      if (data) setBusinesses(data);
    })();
  }, []);

  const step = steps[stepIdx];

  function next() {
    setStepIdx(i => {
      let nextIdx = i + 1;
      // Skip local verification if user is a visitor or business
      if (steps[nextIdx] === 'local_verify' && (a.intent === 'visit' || a.intent === 'business')) nextIdx++;
      // Skip business details if user is not a business
      if (steps[nextIdx] === 'business_details' && a.intent !== 'business') nextIdx++;
      
      return Math.min(nextIdx, steps.length - 1);
    });
  }
  function back() {
    setStepIdx(i => {
      let prevIdx = i - 1;
      // Skip business details if user is not a business
      if (steps[prevIdx] === 'business_details' && a.intent !== 'business') prevIdx--;
      // Skip local verification if user is a visitor or business
      if (steps[prevIdx] === 'local_verify' && (a.intent === 'visit' || a.intent === 'business')) prevIdx--;
      return Math.max(prevIdx, 0);
    });
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="text-sm opacity-70">Step {stepIdx+1} / {steps.length}</div>
        <h1 className="text-2xl font-bold">Get set up</h1>
      </div>

      {step === "intent" && (
        <section className="space-y-3">
          <p>What best describes you?</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ["visit","Visitor — I’m just visiting"],
              ["live","Local — I live in/near Burry Port"],
              ["work","Local — I work in Burry Port"],
              ["family","Local — family/long-term connection"],
              ["business","Business — owner/manager/charity"],
            ].map(([v,label]) => (
              <button key={v}
                onClick={()=>{ setA({...a, intent: v as Answers["intent"]}); next(); }}
                className={`p-3 rounded-xl border border-sea/30 hover:bg-sea/10 ${a.intent===v ? "ring-2 ring-sea" : ""}`}>
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "details" && (
        <section className="space-y-3">
          <p>Please provide your details.</p>
          <div className="grid gap-3">
            <label>
              <span className="text-sm font-medium text-charcoal/80">Full Name</span>
              <input
                className="w-full p-3 mt-1 rounded-xl border border-sea/30 bg-white/70 placeholder-charcoal/50 focus:ring-sea focus:border-sea"
                placeholder="Your name"
                value={a.name ?? ""}
                onChange={e => setA({ ...a, name: e.target.value })}
              />
            </label>
            <label>
              <span className="text-sm font-medium text-charcoal/80">Email Address</span>
              <input
                type="email"
                className="w-full p-3 mt-1 rounded-xl border border-sea/30 bg-white/70 placeholder-charcoal/50 focus:ring-sea focus:border-sea"
                placeholder="you@example.com"
                value={a.email ?? ""}
                onChange={e => setA({ ...a, email: e.target.value })}
              />
            </label>
            {a.intent !== 'visit' && (
              <label>
                <span className="text-sm font-medium text-charcoal/80">Date of Birth</span>
                <input
                  type="date"
                  className="w-full p-3 mt-1 rounded-xl border border-sea/30 bg-white/70 placeholder-charcoal/50 focus:ring-sea focus:border-sea"
                  value={a.dob ?? ""}
                  onChange={e => setA({ ...a, dob: e.target.value })}
                />
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>Back</button>
            <button className="px-4 py-2 rounded-xl bg-sea text-white" onClick={next} disabled={!a.name || !a.email}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === "local_verify" && (a.intent && !['visit', 'business'].includes(a.intent)) && (
        <section className="space-y-3">
          <p>To help verify your local connection, please select a business or organization you use in the area.</p>
          <select
            className="w-full p-3 rounded-xl border border-sea/30 bg-white/70 focus:ring-sea focus:border-sea"
            value={a.local_biz_connection ?? ""}
            onChange={e => setA({ ...a, local_biz_connection: e.target.value === 'new' ? 'new' : Number(e.target.value) })}
          >
            <option value="" disabled>Select one...</option>
            {businesses.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
            <option value="new">My place isn't listed</option>
          </select>

          {a.local_biz_connection === 'new' && (
            <input
              className="w-full p-3 mt-2 rounded-xl border border-sea/30 bg-white/70 placeholder-charcoal/50 focus:ring-sea focus:border-sea"
              placeholder="Name of place (e.g., a shop, school, club)"
              value={a.new_local_biz_name ?? ""}
              onChange={e => setA({ ...a, new_local_biz_name: e.target.value })}
            />
          )}

          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>Back</button>
            <button className="px-4 py-2 rounded-xl bg-sea text-white" onClick={next} disabled={!a.local_biz_connection}>
              Continue
            </button>
            <button className="px-4 py-2 rounded-xl text-sm text-charcoal/70 hover:underline" onClick={next}>Skip for now</button>
          </div>
        </section>
      )}

      {step === "business_details" && a.intent === "business" && (
        <section className="space-y-3">
          <p>Select your business or organization from the list. If it's not listed, you can submit a new one for review.</p>
          <select
            className="w-full p-3 rounded-xl border border-sea/30 bg-white/70 focus:ring-sea focus:border-sea"
            value={a.businessName ?? ""}
            onChange={e => setA({ ...a, businessName: e.target.value })}
          >
            <option value="" disabled>Select your business...</option>
            {businesses.map(b => (
              <option key={b.id} value={b.name}>{b.name}</option>
            ))}
            <option value="new">My business isn't listed</option>
          </select>

          {a.businessName === 'new' && (
            <input
              className="w-full p-3 mt-2 rounded-xl border border-sea/30 bg-white/70 placeholder-charcoal/50 focus:ring-sea focus:border-sea"
              placeholder="Your new business name"
              onChange={e => setA({ ...a, businessName: e.target.value })}
            />
          )}
          <p className="text-sm opacity-70">We’ll manually verify (in-person) during beta.</p>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>Back</button>
            <button className="px-4 py-2 rounded-xl bg-sea text-white" onClick={next} disabled={!a.businessName || a.businessName === 'new'}>Continue</button>
          </div>
        </section>
      )}

      {step === "summary" && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Summary</h2>
          <div className="p-4 border border-sea/20 rounded-lg bg-white/50 space-y-2">
            <p><strong>Name:</strong> {a.name}</p>
            <p><strong>Email:</strong> {a.email}</p>
            <p><strong>Account Type:</strong> {a.intent}</p>
            {a.intent === 'visit' && <p className="text-sm text-charcoal/80">You will have basic access as a Visitor.</p>}
            {a.intent && !['visit', 'business'].includes(a.intent) && (
              <p><strong>Local Verification:</strong> {
                typeof a.local_biz_connection === 'number'
                  ? businesses.find(b => b.id === a.local_biz_connection)?.name
                  : a.new_local_biz_name
              }</p>
            )}
            {a.intent === 'business' && <p><strong>Business:</strong> {a.businessName}</p>}
          </div>
          <p className="text-sm opacity-70">An email will be sent to verify your account. Business and Local accounts may require admin approval.</p>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-xl border border-sea/30" onClick={back}>Back</button>
            {/* Wire this later to your auth sign-up + persistence */}
            <Link to={`/signup?name=${a.name}&email=${a.email}`} className="px-4 py-2 rounded-xl bg-lighthouse text-white">Create Account</Link>
          </div>
        </section>
      )}
    </div>
  );
}
