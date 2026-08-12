import type { Metadata } from "next";
import { Geist, Outfit } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Mini-LMS — consultation booking",
  description:
    "Students book and manage one-to-one consultations; administrators see every consultation in the system.",
};

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
