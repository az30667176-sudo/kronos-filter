import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kronos Filter",
  description: "Probabilistic stock analysis powered by Kronos foundation model",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body
        className="min-h-screen font-[family-name:var(--font-inter)] flex flex-col items-center"
        style={{ background: "var(--bg)", color: "var(--text-primary)" }}
      >
        <nav
          className="sticky top-0 z-50 border-b w-full flex justify-center"
          style={{
            background: "rgba(10, 14, 26, 0.85)",
            backdropFilter: "blur(12px)",
            borderColor: "var(--border)",
          }}
        >
          <div className="w-full max-w-[1100px] px-6 sm:px-10 h-16 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight text-lg"
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: "var(--accent)", boxShadow: "0 0 8px var(--accent)" }}
              />
              <span className="gradient-text font-[family-name:var(--font-jetbrains)]">
                Kronos Filter
              </span>
            </Link>
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="text-sm font-medium transition-colors hover:opacity-100"
                style={{ color: "var(--text-secondary)" }}
              >
                Predict
              </Link>
              <Link
                href="/history"
                className="text-sm font-medium transition-colors hover:opacity-100"
                style={{ color: "var(--text-secondary)" }}
              >
                History
              </Link>
              <Link
                href="/about"
                className="text-sm font-medium transition-colors hover:opacity-100"
                style={{ color: "var(--text-secondary)" }}
              >
                About
              </Link>
            </div>
          </div>
        </nav>
        <main
          className="w-full max-w-[1100px] px-6 sm:px-10 py-10"
          style={{ marginLeft: "auto", marginRight: "auto" }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
