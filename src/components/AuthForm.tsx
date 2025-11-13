import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { consumeNext, signInWithGoogle, signInWithPassword, signUpWithEmail } from "../lib/auth";

type Consent = {
  agreedToTerms: boolean;
  agreedToPrivacy: boolean;
  agreedToRules: boolean;
}

type Props = { mode?: "signin" | "signup", consent?: Consent }

export default function AuthForm({ mode = "signin", consent }: Props) {
  const nav = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);

  // Pre-fill email from URL if available (from onboarding)
  const [email, setEmail] = useState(query.get("email") ?? "");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    try {
      setBusy(true); setErr(null);
      if (mode === "signin") {
        await signInWithPassword(email, pw);
        const next = consumeNext("/welcome");
        nav(next);
      } else {
        await signUpWithEmail(email, pw, { name: query.get("name") }, consent);
        nav("/welcome?checkEmail=1");
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    try {
      setBusy(true); setErr(null);
      await signInWithGoogle();
      // OAuth will return via onAuthStateChange in your app; keep next in URL/localStorage
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 max-w-md">
      <label>
        <span className="block text-sm font-medium text-gray-700">Email</span>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white/70 border border-sea/30 rounded-md shadow-sm placeholder-charcoal/50 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
      </label>
      <label>
        <span className="block text-sm font-medium text-gray-700">Password</span>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white/70 border border-sea/30 rounded-md shadow-sm placeholder-charcoal/50 focus:outline-none focus:ring-sea focus:border-sea sm:text-sm" />
      </label>
      {err && <div className="text-lighthouse text-sm">{err}</div>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={handleSubmit} className="px-4 py-2 rounded bg-sea text-white font-semibold hover:bg-opacity-90 disabled:bg-gray-400">
          {mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <button disabled={busy} onClick={handleGoogle} className="px-4 py-2 rounded border border-sea/30 hover:bg-sea/10">
          Continue with Google
        </button>
      </div>
    </div>
  );
}
