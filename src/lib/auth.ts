import { supabase } from "./supabaseClient";

const NEXT_KEY = "nextPath";

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

export async function signUpWithEmail(email: string, password: string, options?: { name?: string | null, emailRedirectTo?: string }) {
  const { error } = await supabase.auth.signUp({
    email, password,
    options: {
      emailRedirectTo: options?.emailRedirectTo || `${window.location.origin}/welcome`,
      // Store extra info in the user's metadata
      data: { full_name: options?.name }
    }
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
