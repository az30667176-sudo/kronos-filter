import type { Metadata } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kronos Filter",
  description: "Probabilistic stock analysis powered by Kronos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${playfair.variable}`}>
      <body
        className="min-h-screen font-[family-name:var(--font-dm-sans)] flex flex-col items-center"
        style={{ background: "var(--bg)", color: "var(--text-primary)" }}
      >
        <nav
          className="sticky top-0 z-50 border-b w-full flex justify-center"
          style={{
            background: "rgba(12, 12, 12, 0.85)",
            backdropFilter: "blur(12px)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="w-full max-w-[1100px] px-6 sm:px-10 h-16 flex items-center justify-between"
          >
            <Link
              href="/"
              className="font-[family-name:var(--font-playfair)] text-xl font-semibold tracking-tight"
              style={{ color: "var(--accent)" }}
            >
              Kronos Filter
            </Link>
            <div className="flex items-center gap-8">
              <Link
                href="/"
                className="text-base font-medium transition-colors hover:opacity-100"
                style={{ color: "var(--text-secondary)" }}
              >
                Dashboard
              </Link>
              <Link
                href="/history"
                className="text-base font-medium transition-colors hover:opacity-100"
                style={{ color: "var(--text-secondary)" }}
              >
                History
              </Link>
            </div>
          </div>
        </nav>
        <main
          className="w-full max-w-[1100px] px-6 sm:px-10 py-12"
          style={{ marginLeft: "auto", marginRight: "auto" }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
