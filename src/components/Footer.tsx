// src/components/Footer.tsx
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-12 py-6 border-t border-sea/20 bg-sand">
      <div className="max-w-4xl mx-auto px-4 text-center text-sm text-charcoal/70">
        <div className="flex justify-center gap-4 mb-2">
          <Link to="/terms" className="hover:text-sea">Terms of Use</Link>
          <Link to="/privacy-policy" className="hover:text-sea">Privacy Policy</Link>
          <Link to="/rules" className="hover:text-sea">Community Rules</Link>
        </div>
        <p>&copy; {new Date().getFullYear()} BurryPort.uk. All rights reserved.</p>
      </div>
    </footer>
  );
}