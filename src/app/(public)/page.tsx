import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6">
      <p className="text-sm font-medium uppercase tracking-widest text-slate-400">
        Public Portal — placeholder
      </p>
      <h1 className="text-4xl font-semibold text-slate-900">
        Real Estate Developer Platform
      </h1>
      <p className="text-slate-600">
        Project setup is done. The public website (Modules P1–P4) and the admin modules will be
        built one at a time, sharing the same local database.
      </p>
      <Link
        href="/admin"
        className="w-fit rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white"
      >
        Go to Admin Portal →
      </Link>
    </main>
  );
}
