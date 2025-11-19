import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { consumeNext, setNext } from "../lib/auth";
import AuthForm from "../components/auth/AuthForm";

export default function LoginPage() {
  const nav = useNavigate();

  useEffect(() => {
    // Handle OAuth returning sessions
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        const next = consumeNext("/welcome");
        nav(next);
      }
    });
    return () => subscription.unsubscribe();
  }, [nav]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <AuthForm mode="signin" />
    </div>
  );
}
