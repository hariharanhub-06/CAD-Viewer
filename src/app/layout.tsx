import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAD Review",
  description: "Upload, view, measure, and review CAD models in the browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full">{children}</body>
    </html>
  );
}
