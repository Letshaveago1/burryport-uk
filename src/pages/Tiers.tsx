import StaticPage from "./StaticPage";
import TierComparison from "../components/features/TierComparison";

export default function TiersPage() {
  return (
    <div className="space-y-6">
      {/* Render page content using your existing static page renderer */}
      <StaticPage slug="tiers" />

      {/* Then append the comparison table */}
      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Compare Privileges</h2>
        <TierComparison />
      </section>
    </div>
  );
}
