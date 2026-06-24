"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export function AccessDenied({ email }: { email: string }) {
  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="glass max-w-md rounded-2xl p-8 text-center">
        <div className="text-4xl">🔒</div>
        <h1 className="mt-3 text-xl font-semibold">No access to this project</h1>
        <p className="mt-2 text-sm text-gray-300">
          You&apos;re signed in as <span className="font-medium text-white">{email}</span>. This project hasn&apos;t been
          shared with this account.
        </p>
        <p className="mt-2 text-sm text-gray-400">
          If it was shared with a different email, sign in with that one — or ask the owner to share it with{" "}
          <span className="text-white">{email}</span>.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/dashboard" className="rounded-lg border border-edge px-4 py-2 text-sm hover:bg-edge">
            My projects
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-lg bg-gradient-to-r from-brand-violet to-brand-fuchsia px-4 py-2 text-sm text-white"
          >
            Sign in as someone else
          </button>
        </div>
      </div>
    </main>
  );
}
