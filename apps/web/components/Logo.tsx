/** Retriever head mark (traced from the brand illustration); served from /public/brand. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark.svg" alt="" width={32} height={32} className={className} aria-hidden />;
}
