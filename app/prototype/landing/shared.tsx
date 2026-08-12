"use client";

/**
 * PROTOTYPE — throwaway. Ticket #23.
 *
 * Pieces every variant shares: the chrome, the demo-credentials card, and the
 * copy. Layout is what the variants disagree about, so none of it lives here.
 *
 * Everything settled upstream is applied: A′ tokens (#18), Outfit for headings
 * (#19), the two-tone wordmark with its size rule (#21), AEST labels (ADR-0004).
 */

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Wordmark } from "./mark";

export const COPY = {
  heroLead: "Book time with a tutor,",
  heroAccent: "when it actually helps",
  subhead:
    "Students book and manage their own consultations. Administrators see every consultation in the system.",
  values: [
    {
      pill: "Book in minutes",
      body: "Pick a time, say why you need it, done. No email threads, no waiting for a reply.",
    },
    {
      pill: "Change your mind",
      body: "Reschedule or cancel from the same list. Nothing is deleted — a cancelled consultation stays visible.",
    },
    {
      pill: "Oversight built in",
      body: "Administrators see every consultation across the system, read-only, without touching a student's booking.",
    },
  ],
  roles: [
    {
      who: "Students",
      steps: "Sign in, book a consultation, and mark it complete once it has happened.",
    },
    {
      who: "Administrators",
      steps: "Sign in and see every consultation in the system, across every student.",
    },
  ],
};

export const ACCOUNTS = [
  { role: "Student", email: "student@example.com" },
  { role: "Admin", email: "admin@example.com" },
];
export const PASSWORD = "demo-password-123";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}

/** The highest-value element on the page for the person actually assessing it. */
export function CredentialsCard({ compact }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="font-[family-name:var(--font-display)] text-base font-semibold">
        Try it without signing up
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Two demo accounts, one for each role.
      </p>

      <dl className={`mt-4 space-y-2 ${compact ? "" : "sm:space-y-3"}`}>
        {ACCOUNTS.map((a) => (
          <div
            key={a.role}
            className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2"
          >
            <div className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {a.role}
              </dt>
              <dd className="truncate font-mono text-sm">{a.email}</dd>
            </div>
            <CopyButton value={a.email} label={`${a.role} email`} />
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
          <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Password — both accounts
            </dt>
            <dd className="truncate font-mono text-sm">{PASSWORD}</dd>
          </div>
          <CopyButton value={PASSWORD} label="password" />
        </div>
      </dl>
    </div>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Wordmark size="text-xl" />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href="/auth/login">Sign in</a>
          </Button>
          <Button size="sm" asChild>
            <a href="/auth/sign-up">Create account</a>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto w-full border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-col-reverse items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <Wordmark size="text-sm" />
          <span>— consultation booking</span>
        </div>
        <span>All times shown in AEST.</span>
      </div>
    </footer>
  );
}

/** The poster's one borrowed gesture: faint concentric geometry, never in front. */
export function Geometry({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute rounded-full border-primary/10 ${className}`}
    />
  );
}
