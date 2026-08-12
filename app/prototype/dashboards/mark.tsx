"use client";

/**
 * PROTOTYPE — throwaway. Ticket #22.
 *
 * The wordmark and monogram as decided in #21, restated here so this prototype
 * stands alone: two-tone at `text-xl` and above, single ink below (the amber is
 * only legal as large text), and the monogram tile as the compact form.
 */

const DISPLAY = "font-[family-name:var(--font-display)] font-bold tracking-tight";

const SMALL = new Set(["text-sm", "text-base", "text-lg"]);

export function Wordmark({ size = "text-xl" }: { size?: string }) {
  if (SMALL.has(size)) {
    return <span className={`${DISPLAY} ${size} text-primary`}>Oli-Learn</span>;
  }
  return (
    <span className={`${DISPLAY} ${size}`}>
      <span className="text-primary">Oli-</span>
      <span className="text-[hsl(var(--amber))]">Learn</span>
    </span>
  );
}

export function Monogram({
  px,
  radius,
  className = "",
}: {
  px: number;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground ${DISPLAY} ${className}`}
      style={{
        width: px,
        height: px,
        borderRadius: radius ?? Math.max(3, px * 0.22),
        fontSize: px * 0.5,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}
    >
      OL
    </span>
  );
}

export const SOCIAL_TOKENS = `
[data-social] {
  --background: 0 0% 100%; --foreground: 213 60% 14%; --wash: 213 100% 98%;
  --card: 0 0% 100%; --primary: 213 88% 43%; --primary-foreground: 0 0% 100%;
  --muted: 213 45% 95%; --muted-foreground: 213 22% 40%;
  --accent: 38 95% 90%; --accent-foreground: 27 85% 25%;
  --border: 213 32% 82%; --amber: 33 95% 40%;
  --status-scheduled-bg: 213 92% 92%; --status-scheduled-fg: 213 88% 30%;
  --status-completed-bg: 160 60% 90%; --status-completed-fg: 162 88% 22%;
}
.dark [data-social] {
  --background: 213 50% 10%; --foreground: 210 40% 96%; --wash: 213 55% 8%;
  --card: 213 45% 13%; --primary: 211 92% 62%; --primary-foreground: 213 60% 10%;
  --muted: 213 35% 18%; --muted-foreground: 213 22% 72%;
  --accent: 30 55% 22%; --accent-foreground: 38 95% 76%;
  --border: 213 30% 24%; --amber: 38 95% 68%;
  --status-scheduled-bg: 213 60% 22%; --status-scheduled-fg: 211 92% 80%;
  --status-completed-bg: 162 45% 18%; --status-completed-fg: 158 70% 72%;
}
`;
