import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex h-screen flex-col">
      <AppHeader user={user} />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
