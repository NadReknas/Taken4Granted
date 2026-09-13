import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="mt-2 text-stone-600">This opportunity may have closed or been removed from its source.</p>
      <Link href="/grants" className="btn-primary mt-6">Browse open grants</Link>
    </div>
  );
}
