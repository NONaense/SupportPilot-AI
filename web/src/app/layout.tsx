import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupportDock — Helpful answers, grounded in your docs",
  description: "A customer support copilot for small businesses.",
};

const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('supportdock_theme');
      var supportDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (theme === 'dark' || (!theme && supportDark)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
