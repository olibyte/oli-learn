"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Published deliberately so a reviewer can reach the admin view without running
 * SQL by hand. These are seeded accounts on a throwaway project - see the
 * README before carrying the pattern anywhere near a real one.
 */
const ACCOUNTS = [
  { role: "Student", email: "student@example.com" },
  { role: "Admin", email: "admin@example.com" },
] as const;

const PASSWORD = "demo-password-123";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  // Cleared on a timer, and cleaned up on unmount so the timeout cannot fire
  // against a component that is no longer mounted.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access is unavailable on insecure origins and can be denied
      // outright. The credential is on screen and selectable either way, so the
      // fallback is the text itself: the button simply does not confirm, which
      // is the honest signal that nothing was copied.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`Copy ${label}`}
      onClick={onCopy}
    >
      {copied ? (
        <Check className="size-4 text-primary" />
      ) : (
        <Copy className="size-4" />
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied` : ""}
      </span>
    </Button>
  );
}

function Credential({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="truncate font-mono text-sm">{value}</dd>
      </div>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}

/**
 * The highest-value element on the page for the person actually assessing it,
 * which is why it sits beside the hero rather than below the fold.
 *
 * The border is load-bearing, not decoration: this card is white on `--wash`,
 * and those two separate at only 1.05:1.
 */
export function CredentialsCard() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="font-display text-base font-semibold">
        Try it without signing up
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Two demo accounts, one for each role.
      </p>

      <dl className="mt-4 space-y-2">
        {ACCOUNTS.map((account) => (
          <Credential
            key={account.role}
            label={account.role}
            value={account.email}
            copyLabel={`${account.role} email`}
          />
        ))}
        <Credential
          label="Password — both accounts"
          value={PASSWORD}
          copyLabel="password"
        />
      </dl>
    </div>
  );
}
