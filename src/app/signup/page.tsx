"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Sign up failed.");
      setBusy(false);
      return;
    }
    await signIn("credentials", { email, password, redirect: false });
    setBusy(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Create account</h1>
          <p className="mt-1 text-sm text-gray-400">Free — start reviewing CAD models in minutes.</p>
        </div>
        {error && <p className="rounded-lg bg-rose-950/50 p-2 text-sm text-rose-200">{error}</p>}
        <input
          type="text"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-edge bg-ink/70 px-3 py-2.5 text-sm outline-none focus:border-brand-violet"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-edge bg-ink/70 px-3 py-2.5 text-sm outline-none focus:border-brand-violet"
        />
        <input
          type="password"
          required
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-edge bg-ink/70 px-3 py-2.5 text-sm outline-none focus:border-brand-violet"
        />
        <button
          disabled={busy}
          className="w-full rounded-lg bg-gradient-to-r from-brand-violet to-brand-fuchsia py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className="text-center text-sm text-gray-400">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-cyan hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
