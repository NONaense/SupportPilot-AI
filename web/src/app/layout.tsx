import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupportDock — Helpful answers, grounded in your docs",
  description: "A customer support copilot for small businesses.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
