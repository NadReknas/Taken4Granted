/** Retriever head mark, drawn to a 64x64 grid. Colours: honey coat, cream muzzle, forest-green collar. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <path d="M14 22c-6 2-9 12-5 20 2 3 6 3 8 0z" fill="#b45309" />
      <path d="M50 22c6 2 9 12 5 20-2 3-6 3-8 0z" fill="#b45309" />
      <path d="M32 10c-12 0-19 9-19 21 0 9 5 15 10 18h18c5-3 10-9 10-18 0-12-7-21-19-21z" fill="#d97706" />
      <path d="M32 30c-7 0-12 5-12 11 0 5 5 8 12 8s12-3 12-8c0-6-5-11-12-11z" fill="#fef3c7" />
      <ellipse cx="32" cy="35" rx="4" ry="3" fill="#292524" />
      <path d="M32 38v4M28 44c2 2 6 2 8 0" stroke="#292524" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="27" r="2.2" fill="#292524" />
      <circle cx="40" cy="27" r="2.2" fill="#292524" />
      <path d="M22 51h20a3 3 0 0 1 3 3v2H19v-2a3 3 0 0 1 3-3z" fill="#166534" />
      <circle cx="32" cy="56" r="3" fill="#fbbf24" />
    </svg>
  );
}
