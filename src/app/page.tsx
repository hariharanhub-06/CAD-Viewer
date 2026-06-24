import Link from "next/link";
import { Hero3D } from "@/components/Hero3D";

const FEATURES: [string, string, string][] = [
  ["🧊", "3D + 2D viewing", "STEP, IGES, STL, OBJ, glTF and PDF drawings — right in the browser."],
  ["🛠️", "eDrawings-style tools", "Free rotate, zoom, hide components, section and measure."],
  ["✍️", "Markup & comments", "Pin comments on parts, sketch on the surface, set severity, resolve."],
  ["🗂️", "Versions & activity", "Re-upload corrections as revisions; full activity log."],
  ["🔗", "Share securely", "Invite by email; accounts required for access."],
  ["☁️", "Runs on the cloud", "Hosted on Vercel with Neon + Backblaze B2."],
];

export default function Home() {
  return (
    <main className="aurora min-h-screen">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-6 w-6 rounded-lg bg-gradient-to-br from-brand-violet to-brand-cyan" />
          <span className="gradient-text text-lg">CAD Review</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/login" className="text-gray-300 hover:text-white">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-gradient-to-r from-brand-violet to-brand-fuchsia px-4 py-2 font-medium text-white shadow-lg transition hover:brightness-110"
          >
            Get started
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-6xl items-center gap-8 px-6 py-12 md:grid-cols-2 md:py-20">
        <div>
          <div className="mb-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-300">
            The CAD review tool that replaces emailing files
          </div>
          <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
            Review CAD models <span className="gradient-text">in your browser</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-gray-300">
            Upload, view, measure, mark up and resolve comments across revisions — engineers and reviewers on the same model.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="rounded-xl bg-gradient-to-r from-brand-violet to-brand-fuchsia px-6 py-3 font-semibold text-white shadow-xl transition hover:brightness-110"
            >
              Start free →
            </Link>
            <Link href="/viewer" className="rounded-xl border border-white/15 px-6 py-3 font-medium text-gray-200 hover:bg-white/5">
              Try the viewer (no sign-in)
            </Link>
          </div>
        </div>
        <div className="animate-floaty">
          <Hero3D className="h-[22rem] w-full" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([icon, title, body]) => (
            <div key={title} className="card-glow rounded-2xl border border-white/10 bg-panel/70 p-5">
              <div className="text-2xl">{icon}</div>
              <div className="mt-2 font-semibold text-gray-100">{title}</div>
              <div className="mt-1 text-sm text-gray-400">{body}</div>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-xl text-center text-xs text-gray-500">
          Native eDrawings/SolidWorks files (.easm, .sldasm) can&apos;t render in a browser — export to STEP (3D) or PDF (drawings) for inline review.
        </p>
      </section>
    </main>
  );
}
