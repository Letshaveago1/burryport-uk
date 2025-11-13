export function Info({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group align-middle">
      <button
        type="button"
        aria-label="Help"
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="absolute z-20 hidden group-hover:block left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 text-sm rounded-xl shadow-lg bg-white border border-gray-200"
      >
        {text}
      </span>
    </span>
  );
}