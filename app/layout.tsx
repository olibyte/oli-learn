import type { Metadata } from "next";
import { Geist, Outfit } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

/*
 * No `metadataBase`. The hand-rolled one here fell back to `VERCEL_URL`, which
 * is the *deployment* URL - a new immutable hostname on every deploy. Next's
 * own fallback is strictly better informed: it prefers `VERCEL_BRANCH_URL` on
 * previews and the stable `VERCEL_PROJECT_PRODUCTION_URL` in production,
 * dropping to localhost only in development. Setting it by hand meant social
 * images resolved against a URL that changes every time you ship.
 */
export const metadata: Metadata = {
  title: "Oli-Learn — consultation booking",
  description:
    "Students book and manage their own consultations. Administrators see every consultation in the system.",
};

/*
 * The social card, the icon and the apple icon are file conventions, not
 * metadata fields: `app/opengraph-image.png`, `app/icon.png` and
 * `app/apple-icon.png` are picked up by filename, with their alt text in
 * `app/opengraph-image.alt.txt`.
 *
 * There is deliberately no `app/twitter-image.png` - `twitter.images`
 * auto-fills from `openGraph.images`, so a Twitter-specific crop would be a
 * second file to keep in sync for no gain.
 */

/**
 * Two families: Geist for body and UI, Outfit for headings and the wordmark
 * (docs/design/oli-learn.md §2).
 *
 * Neither call names a `weight`, because both families are variable - for a
 * variable family Next returns the same variable file whether or not weights
 * are listed, so naming them is byte-identical to taking the whole range. No
 * `display` either: `swap` is already the default.
 *
 * Outfit ships no italic, so a supporting line that wants one uses Geist.
 */
const geist = Geist({ variable: "--font-body", subsets: ["latin"] });
const outfit = Outfit({ variable: "--font-display", subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${outfit.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
