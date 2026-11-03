import type { Metadata } from 'next';
import { LockKeyhole } from 'lucide-react';
import { ACCESS_VERIFY, safeNext } from '@/lib/access-gate';

export const metadata: Metadata = {
  title: 'Access code required',
  robots: { index: false, follow: false },
};

/** The one open page while the site is behind the access code (src/proxy.ts). */
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <form method="post" action={ACCESS_VERIFY} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="mb-4 grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-700">
          <LockKeyhole className="size-5" />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">Access code required</h1>
        <p className="mt-1 text-sm text-slate-500">This site is private. Enter the access code you were given.</p>

        <input type="hidden" name="next" value={safeNext(next)} />
        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Access code</span>
          <input
            name="code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            required
            className="block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base tracking-widest text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        </label>
        {error === 'wrong' && <p className="mt-2 text-sm text-red-600">That code is not right. Try again.</p>}

        <button type="submit" className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
          Continue
        </button>
      </form>
    </main>
  );
}
