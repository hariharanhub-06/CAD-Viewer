import Link from "next/link";
import { Hero3D } from "@/components/Hero3D";

// Split colorful layout for sign-in / sign-up: 3D hero on the left, form card on the right.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="aurora flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 shadow-2xl md:grid-cols-2">
        {/* Left: 3D + pitch */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-violet-600/20 via-fuchsia-600/10 to-cyan-500/20 p-8 md:flex">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-6 w-6 rounded-lg bg-gradient-to-br from-brand-violet to-brand-cyan" />
            <span className="gradient-text text-lg">CAD Review</span>
          </Link>
          <Hero3D className="h-64 w-full" />
          <div>
            <h2 className="text-xl font-bold leading-snug">
              Review CAD models <span className="gradient-text">in the browser</span>
            </h2>
            <p className="mt-2 text-sm text-gray-300">
              View, measure, section, mark up and resolve comments — no more emailing files back and forth.
            </p>
          </div>
        </div>

        {/* Right: form */}
        <div className="glass flex items-center justify-center p-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>
    </main>
  );
}
