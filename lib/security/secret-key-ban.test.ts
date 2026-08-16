import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Two rules this repository states in prose, checked instead of asserted.
 *
 * 1. ADR-0001's ban: the Supabase **secret key** never reaches application
 *    code, because `service_role` bypasses RLS and every isolation proof in
 *    `tests/integration/security.test.ts` is reached with the publishable key.
 * 2. The repository publishes **no credential**: no file git tracks carries a
 *    live secret.
 *
 * Both were previously held up by someone remembering to grep.
 *
 * **Why this file is in `lib/` and not `tests/`.** Not taste — a glob.
 * `pnpm test:unit` is `vitest run lib components`, and those two words are
 * filename filters, not directories added to the config. `vitest.config.mts`
 * does collect `tests/**` — but only for bare `pnpm test`, which also runs the
 * 50 integration tests and therefore needs Docker. Measured by planting a probe
 * at `tests/glob-probe.test.ts`: `vitest list` collected it, `pnpm test:unit`
 * still reported 9 files and 159 tests. CI's fast job runs `pnpm test:unit`, so
 * a check placed under `tests/` would have been invisible to it and to any
 * reviewer without a running Docker daemon.
 *
 * **Never print a matched value.** Violations are reported as file, line and
 * the *name* of the thing matched. A failure message is the most likely thing
 * to be pasted into a pull request or an issue while it is being fixed, and the
 * second scan reads files that exist to hold credentials.
 *
 * **What this does not catch.** It is a string check, not a proof that RLS is
 * respected. A `security definer` function, a widened policy or a route handler
 * that forgets its claim check all bypass tenant isolation without tripping
 * anything here — those are the integration suite's job. What this rules out is
 * the one bypass that would leave the entire integration suite green.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Repo-relative, `/`-separated, so messages and the allowlist read the same on every OS. */
const rel = (absolute: string) =>
  absolute.slice(ROOT.length).split(sep).join(posix.sep);

// ---------------------------------------------------------------------------
// What counts as a violation
// ---------------------------------------------------------------------------

type Pattern = { readonly name: string; readonly find: RegExp };

/**
 * Ordered most specific first: the first match names the violation, so
 * `SUPABASE_SERVICE_ROLE_KEY` is reported as itself rather than as the
 * `service_role` it contains.
 */
const FORBIDDEN: readonly Pattern[] = [
  { name: "SUPABASE_SECRET_KEY", find: /SUPABASE_SECRET_KEY/i },
  { name: "SUPABASE_SERVICE_ROLE_KEY", find: /SUPABASE_SERVICE_ROLE_KEY/i },
  { name: "service_role", find: /service_role/i },
  { name: "an `sb_secret_…` literal", find: /sb_secret_/ },
];

/** Anything JWT-shaped. The payload is base64, so a pasted key hides its own claim. */
const JWT_SHAPED = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]+/g;

/**
 * `pnpm supabase status` prints a `SERVICE_ROLE_KEY` in the legacy JWT format,
 * which makes it the credential most likely to be copied out of a terminal. Its
 * `role` claim is base64 inside the payload, so none of the patterns above see
 * it. Decoding is exact where three base64 alignment variants would be a guess.
 */
function carriesServiceRoleClaim(text: string): boolean {
  for (const [, payload] of text.matchAll(JWT_SHAPED)) {
    let decoded: string;
    try {
      decoded = Buffer.from(payload, "base64url").toString("utf8");
    } catch {
      continue;
    }
    if (/"role"\s*:\s*"service_role"/.test(decoded)) return true;
  }
  return false;
}

/** The name of the first forbidden thing on this line, or `undefined`. */
function forbiddenIn(line: string): string | undefined {
  const matched = FORBIDDEN.find(({ find }) => find.test(line));
  if (matched) return matched.name;
  if (carriesServiceRoleClaim(line)) return "a `service_role` JWT";
  return undefined;
}

type Violation = { file: string; line: number; matched: string };

const format = ({ file, line, matched }: Violation) =>
  `${file}:${line} — ${matched}`;

// ---------------------------------------------------------------------------
// Scan 1: application source
// ---------------------------------------------------------------------------

/**
 * `docs/` and `supabase/config.toml` are deliberately absent. ADR-0001 has to
 * name the rule it states, and the CLI's own config file ships commented
 * `secret_key` lines and a live `s3_secret_key`. Neither is application code and
 * neither can build a Supabase client, so scanning them would mean allowlisting
 * legitimate prose — and an allowlist that grows is a check on its way out.
 *
 * `tests/` **is** scanned, and is clean today. A fixture that reaches for the
 * secret key is exactly the change that should have to argue for itself: a
 * suite that grants itself RLS bypass proves less than it appears to.
 */
const SOURCE_ROOTS = [
  "app",
  "components",
  "lib",
  "scripts",
  "tests",
  "proxy.ts",
];

const CODE_FILE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * One exemption, and it is this file: a check for a string has to spell the
 * string. Held as an exact path rather than a directory so a second file cannot
 * quietly inherit the exemption, and asserted below to be exactly this.
 */
const EXEMPT = ["lib/security/secret-key-ban.test.ts"];

function codeFilesUnder(entry: string): string[] {
  const absolute = join(ROOT, entry);
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) walk(path);
      else if (CODE_FILE.test(item.name)) found.push(path);
    }
  };

  if (CODE_FILE.test(entry)) found.push(absolute);
  else walk(absolute);

  return found;
}

function scanSource(): { violations: Violation[]; scanned: string[] } {
  const scanned: string[] = [];
  const violations: Violation[] = [];

  for (const root of SOURCE_ROOTS) {
    for (const absolute of codeFilesUnder(root)) {
      const file = rel(absolute);
      if (EXEMPT.includes(file)) continue;
      scanned.push(file);

      readFileSync(absolute, "utf8").split("\n").forEach((line, index) => {
        const matched = forbiddenIn(line);
        if (matched) violations.push({ file, line: index + 1, matched });
      });
    }
  }

  return { violations, scanned };
}

const ADR_0001 = `
Application source must not name the Supabase secret key, or the service_role it
authenticates as.

docs/adr/0001-rbac-via-jwt-claim-and-rls.md rejects application-layer-only
authorisation because RLS stands behind it as a second line of defence.
service_role bypasses RLS entirely, so that argument holds only for as long as
the secret key stays out of application code — the ADR says so itself, in its
own Consequences.

Every isolation proof in tests/integration/security.test.ts is reached with the
publishable key. A single client built with the secret key voids all fifty of
them and turns none of them red. That is the whole reason this is a check
rather than a sentence.

The file and line above are the usage. If the usage is correct, then the thing
that needs to change is ADR-0001, not this test.
`.trim();

// ---------------------------------------------------------------------------
// Scan 2: credentials in files git tracks
// ---------------------------------------------------------------------------

/**
 * Variables that carry a credential. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is
 * deliberately not among them: `.env.example` ships it populated on purpose,
 * with the CLI's fixed local value, and the application sends it to the browser.
 */
const CREDENTIAL_VARS = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_PASSWORD",
];

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * Empty, whitespace, `""` and `''` all mean "no value here".
 *
 * `[\s\S]` rather than `.` with the `s` flag: `tsconfig.json` targets ES2017,
 * where that flag is a compile error. The first draft used it, and `vitest`
 * reported 176 of 176 passing while `pnpm typecheck` was red — the same trap
 * #61 and #54 recorded, met while writing a check about a rule holding.
 */
function isPopulated(rawValue: string): boolean {
  const value = rawValue
    .trim()
    .replace(/^(["'])([\s\S]*)\1$/, "$2")
    .trim();
  return value.length > 0;
}

/**
 * Unlike the source scan this looks at values, not mentions — a comment in
 * `.env.example` warning against the secret key is useful text, not a leak. So
 * it fires on a *populated* credential variable, or on a secret in any variable.
 */
function credentialIn(line: string): string | undefined {
  const assignment = line.match(ASSIGNMENT);
  if (assignment) {
    const [, name, value] = assignment;
    if (CREDENTIAL_VARS.includes(name.toUpperCase()) && isPopulated(value)) {
      return `${name} is set to a non-empty value`;
    }
  }
  if (/sb_secret_/.test(line)) return "an `sb_secret_…` literal";
  if (carriesServiceRoleClaim(line)) return "a `service_role` JWT";
  return undefined;
}

/**
 * git is the only authority on what is tracked, and this fails rather than
 * skips without it. A security check that quietly does nothing is worse than no
 * check: it reports on something other than what the reader thinks it does.
 */
function trackedEnvFiles(): string[] {
  let output: string;
  try {
    output = execFileSync("git", ["ls-files", "-z", "--", ".env*"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch (cause) {
    throw new Error(
      "Could not ask git which files are tracked, so this check cannot run. " +
        "It fails rather than skipping, because the question it answers is " +
        "whether this repository publishes a credential.",
      { cause },
    );
  }
  return output.split("\0").filter(Boolean);
}

function scanTrackedEnvFiles(): { violations: Violation[]; scanned: string[] } {
  const scanned = trackedEnvFiles();
  const violations: Violation[] = [];

  for (const file of scanned) {
    readFileSync(join(ROOT, file), "utf8").split("\n").forEach((line, index) => {
      const matched = credentialIn(line);
      if (matched) violations.push({ file, line: index + 1, matched });
    });
  }

  return { violations, scanned };
}

const PUBLISHED = `
A file git tracks is a file this public repository publishes.

The variable named above holds a credential and has a value in a tracked file.
An untracked .env is where those values belong and is not read by this check;
this one is committed.

Only the file, the line and the variable name are reported. The value is not
read into this message, and it must not be pasted into an issue, a pull request
or a terminal transcript on the way to fixing it.

Fixing it starts with rotating the credential, because it is already in the git
history and git rm --cached does not unpublish anything. Removing the line is
the second step, not the first.
`.trim();

// ---------------------------------------------------------------------------

describe("ADR-0001's secret key ban", () => {
  const { violations, scanned } = scanSource();

  it("holds across every source file", () => {
    expect(violations.map(format), ADR_0001).toEqual([]);
  });

  it("was applied to source that actually exists", () => {
    // A walk that finds nothing passes the test above without checking
    // anything. These two assertions are what stop that being indistinguishable
    // from a clean repository.
    expect(scanned).toContain("lib/supabase/client.ts");
    expect(scanned).toContain("proxy.ts");
    expect(scanned.length).toBeGreaterThan(50);
  });

  it("exempts this file and nothing else", () => {
    expect(EXEMPT).toEqual(["lib/security/secret-key-ban.test.ts"]);
    // A rename would otherwise leave a dead entry standing in for a real one.
    for (const file of EXEMPT) {
      expect(() => readFileSync(join(ROOT, file), "utf8")).not.toThrow();
    }
  });
});

describe("credentials in tracked files", () => {
  const { violations, scanned } = scanTrackedEnvFiles();

  it("finds none", () => {
    expect(violations.map(format), PUBLISHED).toEqual([]);
  });

  it("looked at the env file this repository does commit", () => {
    expect(scanned).toContain(".env.example");
  });
});

// ---------------------------------------------------------------------------
// The checks above are only worth their line count if they can fail. These
// rehearse each way they are meant to, on strings rather than on the tree.
// ---------------------------------------------------------------------------

/** Synthetic, so the fixtures below never carry a real key. */
const jwtWithPayload = (payload: object) =>
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(
    JSON.stringify(payload),
  ).toString("base64url")}.bm90LWEtc2lnbmF0dXJl`;

describe("forbiddenIn", () => {
  it("catches the secret key arriving by env var", () => {
    expect(
      forbiddenIn(
        "const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!);",
      ),
    ).toBe("SUPABASE_SECRET_KEY");
  });

  it("catches the legacy env var name, and names it precisely", () => {
    expect(forbiddenIn("process.env.SUPABASE_SERVICE_ROLE_KEY")).toBe(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
  });

  it("catches the role itself, however it is reached", () => {
    expect(forbiddenIn(`db.auth.setRole("service_role")`)).toBe("service_role");
  });

  it("catches a hardcoded secret key", () => {
    expect(forbiddenIn(`const key = "sb_secret_" + rest;`)).toBe(
      "an `sb_secret_…` literal",
    );
  });

  it("catches a pasted legacy key, whose claim is hidden in base64", () => {
    const key = jwtWithPayload({ iss: "supabase", role: "service_role" });
    expect(key).not.toMatch(/service_role/);
    expect(forbiddenIn(`const key = "${key}";`)).toBe("a `service_role` JWT");
  });

  it("leaves the publishable key and an anon token alone", () => {
    expect(
      forbiddenIn("createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)"),
    ).toBeUndefined();
    expect(forbiddenIn(`const key = "sb_publishable_abc123";`)).toBeUndefined();
    expect(
      forbiddenIn(jwtWithPayload({ iss: "supabase", role: "anon" })),
    ).toBeUndefined();
  });

  it("leaves ordinary application code alone", () => {
    expect(
      forbiddenIn(`const { data } = await supabase.from("consultations").select();`),
    ).toBeUndefined();
  });
});

describe("credentialIn", () => {
  it("passes an empty credential slot, which is what the example ships", () => {
    expect(credentialIn("SUPABASE_ACCESS_TOKEN=")).toBeUndefined();
    expect(credentialIn('SUPABASE_PROJECT_PASSWORD=""')).toBeUndefined();
    expect(credentialIn("# SUPABASE_SECRET_KEY is never committed")).toBeUndefined();
  });

  it("fails a populated one, and names the variable rather than the value", () => {
    const found = credentialIn("SUPABASE_ACCESS_TOKEN=sbp_deadbeef");
    expect(found).toBe("SUPABASE_ACCESS_TOKEN is set to a non-empty value");
    expect(found).not.toContain("sbp_deadbeef");
  });

  it("sees through quotes and an export prefix", () => {
    expect(credentialIn(`export SUPABASE_PROJECT_PASSWORD="hunter2"`)).toBe(
      "SUPABASE_PROJECT_PASSWORD is set to a non-empty value",
    );
  });

  it("catches a secret hiding under a variable name it does not know", () => {
    expect(credentialIn("MY_OWN_NAME_FOR_IT=sb_secret_abc123")).toBe(
      "an `sb_secret_…` literal",
    );
    expect(
      credentialIn(
        `ANYTHING=${jwtWithPayload({ iss: "supabase", role: "service_role" })}`,
      ),
    ).toBe("a `service_role` JWT");
  });

  it("leaves the two variables the example commits on purpose alone", () => {
    expect(
      credentialIn("NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321"),
    ).toBeUndefined();
    expect(
      credentialIn("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc123"),
    ).toBeUndefined();
  });
});
