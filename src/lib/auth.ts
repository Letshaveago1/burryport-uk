import { supabase } from "./supabaseClient";

const NEXT_KEY = "nextPath";

type Consent = {
  agreedToTerms: boolean;
  agreedToPrivacy: boolean;
  agreedToRules: boolean;
}

export function setNext(path: string) {
  if (path) localStorage.setItem(NEXT_KEY, path);
}
export function consumeNext(defaultPath = "/welcome") {
  const urlNext = new URLSearchParams(window.location.search).get("next");
  const lsNext = localStorage.getItem(NEXT_KEY);
  if (urlNext) localStorage.removeItem(NEXT_KEY);
  if (lsNext)  localStorage.removeItem(NEXT_KEY);
  return urlNext || lsNext || defaultPath;
}

export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signInWithGoogle(redirectTo?: string) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo || window.location.origin }
  });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string, options?: { name?: string | null, emailRedirectTo?: string }, consent?: Consent) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: options?.emailRedirectTo || `${window.location.origin}/welcome`,
      // Store extra info in the user's metadata
      data: { full_name: options?.name }
    }
  });
  if (error) throw error;
  if (!data.user) throw new Error("Signup completed but no user object was returned.");

  // After user is created, save consent data if it exists
  if (data.user && consent) {
    const consentPromises = [];
    if (consent.agreedToTerms) {
      consentPromises.push(supabase.from("user_consent").insert({ user_id: data.user.id, doc_key: "terms", version: 1, user_agent: navigator.userAgent }));
    }
    if (consent.agreedToPrivacy) {
      consentPromises.push(supabase.from("user_consent").insert({ user_id: data.user.id, doc_key: "privacy-policy", version: 1, user_agent: navigator.userAgent }));
    }
    if (consent.agreedToRules) {
      consentPromises.push(supabase.from("user_consent").insert({ user_id: data.user.id, doc_key: "rules", version: 1, user_agent: navigator.userAgent }));
    }
    await Promise.all(consentPromises.map(p => p.then(res => { if (res.error) throw res.error; })));
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}
