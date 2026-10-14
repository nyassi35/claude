import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RootCause AI", template: "%s · RootCause AI" },
  description: "Manufacturing Root Cause Analysis System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
