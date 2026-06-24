"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export function AppHeader({ user }: { user: { email: string; name: string | null } }) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-edge bg-panel/80 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-5 w-5 rounded bg-gradient-to-br from-brand-violet to-brand-cyan" />
          <span className="gradient-text">CAD Review</span>
        </Link>
        <Link href="/dashboard" className="text-sm text-gray-400 hover:text-gray-200">
          Projects
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">{user.name || user.email}</span>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded border border-edge px-2 py-1 text-xs text-gray-300 hover:bg-edge"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
