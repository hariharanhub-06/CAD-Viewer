import { redirect } from "next/navigation";

// Upload now happens via a modal on the projects dashboard.
export default function UploadRedirect() {
  redirect("/dashboard");
}
