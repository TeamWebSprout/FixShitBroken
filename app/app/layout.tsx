import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "fixshitbroken — the receipts on all 535",
  description:
    "Every federal legislator's record, sourced and linkable: how they voted, who funded them, what they missed.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Instrument Serif is the editorial display face. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="site-wrap" style={{ padding: "22px 20px" }}>
          <a href="/" style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.7rem" }}>
              fix<span className="serif-italic" style={{ color: "var(--rust)" }}>shit</span>broken
            </span>
          </a>
          <nav style={{ float: "right", display: "flex", gap: 18, paddingTop: 8, fontSize: "0.9rem", color: "var(--brown-600)" }}>
            <a href="/directory">The 535</a>
            <a href="/legislation">Legislation</a>
          </nav>
        </header>
        <main className="site-wrap" style={{ paddingBottom: 80 }}>
          {children}
        </main>
      </body>
    </html>
  );
}
