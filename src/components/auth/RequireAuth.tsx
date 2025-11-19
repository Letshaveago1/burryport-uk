import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setNext } from "../../lib/auth";
import { useAuth } from "./AuthProvider";

export default function RequireAuth({ children, next = window.location.pathname }: { children: ReactNode; next?: string }) {
  const nav = useNavigate();
  const { ready, session } = useAuth();

  useEffect(() => {
    if (ready && !session) {
      setNext(next);
      nav(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [ready, session, nav, next]);

  if (!ready || !session) return <div className="p-4">Loading...</div>;
  return <>{children}</>;
}
