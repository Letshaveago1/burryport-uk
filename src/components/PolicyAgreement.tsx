// src/components/PolicyAgreement.tsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  slug: string;
  title: string;
  isAgreed: boolean;
  onAgreeChange: (agreed: boolean) => void;
};

export default function PolicyAgreement({ slug, title, isAgreed, onAgreeChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !content) {
      (async () => {
        const { data } = await supabase
          .from("pages")
          .select("body_mdx")
          .eq("slug", slug)
          .eq("status", "published")
          .single();
        setContent(data?.body_mdx ?? "Content not found.");
      })();
    }
  }, [isOpen, content, slug]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      // Check if user is within a few pixels of the bottom
      if (scrollTop + clientHeight >= scrollHeight - 5) {
        setHasScrolledToEnd(true);
      }
    }
  };

  return (
    <div className="border border-sea/20 rounded-lg">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 text-left font-semibold flex justify-between items-center"
      >
        {title}
        <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {isOpen && (
        <div className="p-3 border-t border-sea/20">
          <div ref={scrollRef} onScroll={handleScroll} className="prose prose-sm max-h-64 overflow-y-auto p-2 border rounded-md bg-white/50">
            {content ? <div dangerouslySetInnerHTML={{ __html: content }} /> : <p>Loading...</p>}
          </div>
          {hasScrolledToEnd && (
            <label className="flex items-center gap-2 mt-3 p-2 bg-sea/10 rounded-md">
              <input type="checkbox" checked={isAgreed} onChange={(e) => onAgreeChange(e.target.checked)} className="w-4 h-4" />
              I have read and agree to the {title}.
            </label>
          )}
        </div>
      )}
    </div>
  );
}