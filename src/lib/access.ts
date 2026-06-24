import "server-only";
import { db } from "@/lib/db";

export type Permission = "owner" | "edit" | "comment" | "view";

export interface ProjectAccess {
  projectId: string;
  permission: Permission;
  isOwner: boolean;
}

/**
 * Resolve a user's access to a project. Access is granted if they own it, or a Share
 * exists for their userId or their email (so invitees gain access automatically on signup).
 * Returns null if no access.
 */
export async function getProjectAccess(
  userId: string,
  userEmail: string,
  projectId: string
): Promise<ProjectAccess | null> {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) return null;
  if (project.ownerId === userId) {
    return { projectId, permission: "owner", isOwner: true };
  }
  const share = await db.share.findFirst({
    where: {
      projectId,
      OR: [{ userId }, { invitedEmail: userEmail.toLowerCase() }],
    },
  });
  if (!share) return null;
  // Lazily bind the share to the user id once we know it.
  if (!share.userId) {
    await db.share.update({ where: { id: share.id }, data: { userId } }).catch(() => {});
  }
  return { projectId, permission: share.permission as Permission, isOwner: false };
}

export function canComment(p: Permission): boolean {
  return p === "owner" || p === "edit" || p === "comment";
}
export function canEdit(p: Permission): boolean {
  return p === "owner" || p === "edit";
}

export async function logActivity(
  projectId: string,
  actorId: string,
  type: string,
  payload?: unknown
): Promise<void> {
  await db.activity.create({
    data: {
      projectId,
      actorId,
      type,
      payload: payload ? JSON.stringify(payload) : null,
    },
  });
}
