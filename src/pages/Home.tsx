import { Link } from "react-router-dom";
import StaticPage from "./StaticPage";

export default function Home() {
  return (
    <div className="container mx-auto p-4">
      {/* Hero CTA */}
      <section className="mb-8 rounded-2xl p-6 shadow bg-gradient-to-br from-sea/10 to-pine/10">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Start your journey</h1>
        <p className="opacity-80 mb-4">
          Answer a few quick questions to choose Visitor, Local, or Business and get the right access.
        </p>
        <div className="flex gap-3">
          <Link to="/start" className="px-4 py-2 rounded-xl bg-lighthouse text-white hover:opacity-90 font-semibold">
            Start
          </Link>
          <Link to="/login" className="px-4 py-2 rounded-xl border border-sea/30 hover:bg-sea/10">
            Sign in
          </Link>
        </div>
      </section>

      {/* Static content from app.pages */}
      <StaticPage slug="home" />
    </div>
  );
}
