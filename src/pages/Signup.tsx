import AuthForm from "../components/AuthForm";
export default function SignupPage(){
  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <AuthForm mode="signup" />
      <p className="text-sm opacity-70">Check your email for a confirmation link.</p>
    </div>
  );
}
