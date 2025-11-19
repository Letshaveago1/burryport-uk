import { useSearchParams } from "react-router-dom";
import AuthForm from "../components/auth/AuthForm";

export default function SignupPage() {
  const [searchParams] = useSearchParams();

  // Read consent flags from the URL, default to false if not present
  const consent = {
    agreedToTerms: searchParams.get('agreedToTerms') === 'true',
    agreedToPrivacy: searchParams.get('agreedToPrivacy') === 'true',
    agreedToRules: searchParams.get('agreedToRules') === 'true',
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Create your account</h1>
      {(consent.agreedToTerms || consent.agreedToPrivacy || consent.agreedToRules) && (
        <div className="p-3 bg-sea/10 border border-sea/20 rounded-lg text-sm text-charcoal">
          ✓ Your agreement to our policies has been noted.
        </div>
      )}
      <AuthForm mode="signup" consent={consent} />
      <p className="text-sm opacity-70">Check your email for a confirmation link.</p>
    </div>
  );
}
