import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Returns the signed-in user (from DB) or null.
 * Wrapped in React cache() so multiple calls within one server request (e.g. the layout
 * and the page) hit the database only once.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true },
  });
  return user;
});

/** Like getCurrentUser but throws if not authenticated (use in protected routes). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
