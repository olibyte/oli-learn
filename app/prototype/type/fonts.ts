/**
 * PROTOTYPE — throwaway. Ticket #19: which display typeface carries Oli-Learn's
 * headings?
 *
 * All four candidates load on this one page so they can be compared without a
 * reload. That is a prototype-only cost — the winner ships alone.
 *
 * Per ticket #17: for a *variable* family, naming weights is byte-identical to
 * taking the whole range (the same URL is returned twice and de-duplicated), so
 * the real choice is one pinned weight or the full variable font. Poppins is the
 * odd one out — it is not variable, so every weight is a separate file, and the
 * `weight` array below is a genuine byte cost rather than a formality.
 */

import { Figtree, Geist, Nunito_Sans, Outfit, Poppins } from "next/font/google";

export const geist = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

export const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
});

export const nunitoSans = Nunito_Sans({
  variable: "--font-nunito",
  subsets: ["latin"],
});

// Static family: these three weights are three downloads.
export const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const CANDIDATES = [
  {
    key: "A",
    name: "Outfit",
    variableFont: true,
    files: "1 variable file",
    note: "Geometric, wide apertures, near-circular o. The closest match to the poster's rounded caps.",
    className: "font-[family-name:var(--font-outfit)]",
  },
  {
    key: "B",
    name: "Poppins",
    variableFont: false,
    files: "3 static files (500/600/700)",
    note: "Pure geometric monoline. The most poster-like, and the most expensive — no variable version exists on Google Fonts.",
    className: "font-[family-name:var(--font-poppins)]",
  },
  {
    key: "C",
    name: "Figtree",
    variableFont: true,
    files: "1 variable file",
    note: "Geometric-humanist hybrid. Slightly narrower, more neutral; designed for UI as well as display.",
    className: "font-[family-name:var(--font-figtree)]",
  },
  {
    key: "D",
    name: "Nunito Sans",
    variableFont: true,
    files: "1 variable file",
    note: "Humanist with softened terminals. Warmest and most 'education'; least like a poster.",
    className: "font-[family-name:var(--font-nunito)]",
  },
] as const;
