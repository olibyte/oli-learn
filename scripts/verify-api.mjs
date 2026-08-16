// Verifies the consultation route handlers end to end against a dev server
// pointed at the LOCAL Supabase stack.
//
//   pnpm supabase start && pnpm supabase db reset && pnpm dev
//   node scripts/verify-api.mjs
//
// This script WRITES. It books a consultation and leaves it behind cancelled on
// every run, and those writes go through the app at APP - not through SUPA. The
// app talks to whichever project its own .env names, so signing in against the
// local stack is no guarantee the writes land there. Two checks enforce that,
// and both are below rather than asserted here:
//
//   1. SUPA must be a loopback address, checked before sign-in.
//   2. The app must accept a session minted by SUPA, checked before the first
//      write. This is proof rather than assumption: sessions are ES256-signed,
//      so only the project holding the signing key can verify one. An app
//      pointed at a different project answers 401 and this script refuses.
//
// So a write cannot reach a deployed project unless ALLOW_REMOTE=1 says so.
const APP = process.env.APP ?? "http://localhost:3000";
const SUPA = process.env.SUPA ?? "http://127.0.0.1:54321";
const KEY = process.env.KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const ALLOW_REMOTE = process.env.ALLOW_REMOTE === "1";

function refuse(...lines) {
  console.error(`\n${lines.join("\n")}\n`);
  process.exit(1);
}

// Check 1. Only covers where this script signs in; check 2 covers where it
// writes, which is the half that reaches a deployed project.
if (
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(
    new URL(SUPA).hostname,
  ) &&
  !ALLOW_REMOTE
) {
  refuse(
    "refusing to run: SUPA is not the local stack.",
    `  SUPA = ${SUPA}`,
    "",
    "This books a consultation and leaves it behind on every run, so pointing",
    "it at a deployed project edits that project's data. Set ALLOW_REMOTE=1 if",
    "that is what you mean to do.",
  );
}

const b64url = (s) => Buffer.from(s, "utf8").toString("base64url");

async function session(email, password) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`sign-in failed: ${JSON.stringify(s)}`);
  return s;
}

function cookieFor(s, ref) {
  return `sb-${ref}-auth-token=base64-${b64url(JSON.stringify(s))}`;
}

let pass = 0;
let fail = 0;

async function check(label, expectStatus, expectType, res) {
  const body = await res.text();
  let parsed = {};
  try {
    parsed = JSON.parse(body);
  } catch {}
  const typeOk = expectType === null || parsed.type === expectType;
  const ok = res.status === expectStatus && typeOk;
  if (ok) pass++;
  else fail++;
  const got = `${res.status}${parsed.type ? ` ${parsed.type}` : ""}`;
  const want = `${expectStatus}${expectType ? ` ${expectType}` : ""}`;
  console.log(
    `${ok ? "  ok  " : "  FAIL"} ${label.padEnd(48)} want ${want.padEnd(34)} got ${got}`,
  );
  if (!ok) console.log(`        body: ${body.slice(0, 200)}`);
  return parsed;
}

const req = (path, opts = {}) =>
  fetch(`${APP}${path}`, {
    redirect: "manual",
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });

// Consultations are booked in 15-minute blocks, so every time posted here has
// to sit on one - an unaligned value would be rejected by the schema before it
// reached whatever the check is actually about.
const onBoundary = (days) =>
  new Date(
    Math.ceil((Date.now() + days * 864e5) / 900_000) * 900_000,
  ).toISOString();

const future = onBoundary(7);
const offBoundary = new Date(
  new Date(future).getTime() + 60_000,
).toISOString();
const past = "2020-01-01T10:00:00.000Z";

// Seeded by `supabase db reset`; local stack only, see supabase/seed.sql.
const PASSWORD = process.env.PASSWORD ?? "local-dev-only";

const stud = await session("student@example.com", PASSWORD);
const admin = await session("admin@example.com", PASSWORD);
// Check 2. Prove the app writes where this script signed in, before writing.
//
// The probe is a PATCH at a malformed id, which the handler answers 404 after
// authenticating and before it touches the database - see
// app/api/consultations/[id]/route.ts. So a probe cannot write, whatever the
// app turns out to be pointed at, and 401 vs 404 says only whether the session
// was accepted.
//
// The candidate list is not guessing at which project the app uses; it covers
// the local stack's hostname aliases, since the app may hold 127.0.0.1 where
// this script holds localhost, or the reverse. A hosted SUPA derives its ref
// directly and is the only candidate that can match.
const refCandidates = [
  ...new Set([new URL(SUPA).hostname.split(".")[0], "127", "localhost"]),
];
let COOKIE = null;
let lastStatus = null;
for (const ref of refCandidates) {
  const r = await req("/api/consultations/not-a-uuid", {
    method: "PATCH",
    headers: { Cookie: cookieFor(stud, ref) },
    body: JSON.stringify({ status: "completed" }),
  }).catch((e) =>
    refuse(
      `refusing to run: cannot reach the app at ${APP}`,
      `  ${e.cause?.code ?? e.message}`,
      "",
      "Start it with `pnpm dev`, or set APP to where it is listening.",
    ),
  );
  lastStatus = r.status;
  if (r.status === 404) {
    COOKIE = cookieFor(stud, ref);
    console.log(`(auth cookie ref resolved: sb-${ref}-auth-token)\n`);
    break;
  }
}
if (!COOKIE) {
  refuse(
    "refusing to run: the app did not accept a session from SUPA, so it is",
    "pointed at a different Supabase project and these writes would land there.",
    "",
    `  signed in at : ${SUPA}`,
    `  writing to   : ${APP}  (last probe answered ${lastStatus})`,
    `  cookie refs  : ${refCandidates.join(", ")}`,
    "",
    "The app follows NEXT_PUBLIC_SUPABASE_URL in its own .env, not SUPA. Point",
    "it at the local stack and restart the dev server - or, to write into the",
    "project the app is using, set SUPA, KEY and ALLOW_REMOTE=1 together.",
  );
}
const RESOLVED_REF = COOKIE.slice("sb-".length, COOKIE.indexOf("-auth-token"));
const ADMIN_COOKIE = cookieFor(admin, RESOLVED_REF);

console.log("=== AUTH ===");
await check(
  "POST unauthenticated",
  401,
  "/errors/unauthenticated",
  await req("/api/consultations", { method: "POST", body: "{}" }),
);

console.log("=== POST validation ===");
await check(
  "malformed JSON",
  400,
  "/errors/malformed-json",
  await req("/api/consultations", {
    method: "POST",
    headers: { Cookie: COOKIE },
    body: "{not json",
  }),
);
await check(
  "empty body",
  422,
  "/errors/validation-failed",
  await req("/api/consultations", {
    method: "POST",
    headers: { Cookie: COOKIE },
    body: "{}",
  }),
);
await check(
  "past scheduledAt (zod, before DB)",
  422,
  "/errors/validation-failed",
  await req("/api/consultations", {
    method: "POST",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({
      firstName: "A",
      lastName: "B",
      reason: "past",
      scheduledAt: past,
    }),
  }),
);
await check(
  "off-boundary scheduledAt (zod, before DB)",
  422,
  "/errors/validation-failed",
  await req("/api/consultations", {
    method: "POST",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({
      firstName: "A",
      lastName: "B",
      reason: "off the 15-minute grid",
      scheduledAt: offBoundary,
    }),
  }),
);
await check(
  "blank reason (whitespace only)",
  422,
  "/errors/validation-failed",
  await req("/api/consultations", {
    method: "POST",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({
      firstName: "A",
      lastName: "B",
      reason: "   ",
      scheduledAt: future,
    }),
  }),
);
await check(
  "unknown field rejected (strict)",
  422,
  "/errors/validation-failed",
  await req("/api/consultations", {
    method: "POST",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({
      firstName: "A",
      lastName: "B",
      reason: "x",
      scheduledAt: future,
      status: "completed",
    }),
  }),
);

console.log("=== POST success ===");
const created = await check(
  "book a consultation",
  201,
  null,
  await req("/api/consultations", {
    method: "POST",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({
      firstName: "Ada",
      lastName: "Lovelace",
      reason: "Recursion help",
      scheduledAt: future,
    }),
  }),
);
console.log(
  `        -> id=${created.id} status=${created.status} camelCase=${"scheduledAt" in created} leaksStudentId=${"student_id" in created || "studentId" in created}`,
);

console.log("=== PATCH ===");
const id = created.id;
await check(
  "both fields at once rejected",
  422,
  "/errors/validation-failed",
  await req(`/api/consultations/${id}`, {
    method: "PATCH",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ status: "completed", scheduledAt: future }),
  }),
);
await check(
  "mark complete",
  200,
  null,
  await req(`/api/consultations/${id}`, {
    method: "PATCH",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ status: "completed" }),
  }),
);
await check(
  "mark incomplete again",
  200,
  null,
  await req(`/api/consultations/${id}`, {
    method: "PATCH",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ status: "scheduled" }),
  }),
);
await check(
  "reschedule",
  200,
  null,
  await req(`/api/consultations/${id}`, {
    method: "PATCH",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ scheduledAt: onBoundary(14) }),
  }),
);
await check(
  "cancel",
  200,
  null,
  await req(`/api/consultations/${id}`, {
    method: "PATCH",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ status: "cancelled" }),
  }),
);
await check(
  "cancelled is terminal (trigger -> 422)",
  422,
  "/errors/invalid-transition",
  await req(`/api/consultations/${id}`, {
    method: "PATCH",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ status: "completed" }),
  }),
);

console.log("=== 404 surface ===");
await check(
  "unknown uuid",
  404,
  "/errors/not-found",
  await req("/api/consultations/00000000-0000-4000-8000-00000000dead", {
    method: "PATCH",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ status: "completed" }),
  }),
);
await check(
  "malformed id (not a uuid)",
  404,
  "/errors/not-found",
  await req("/api/consultations/not-a-uuid", {
    method: "PATCH",
    headers: { Cookie: COOKIE },
    body: JSON.stringify({ status: "completed" }),
  }),
);
await check(
  "ADMIN patching a student's row",
  404,
  "/errors/not-found",
  await req("/api/consultations/c0000000-0000-4000-8000-000000000001", {
    method: "PATCH",
    headers: { Cookie: ADMIN_COOKIE },
    body: JSON.stringify({ status: "completed" }),
  }),
);

console.log("=== method not allowed ===");
await check(
  "DELETE is not defined",
  405,
  null,
  await req(`/api/consultations/${id}`, {
    method: "DELETE",
    headers: { Cookie: COOKIE },
  }),
);
await check(
  "GET on collection is not defined",
  405,
  null,
  await req("/api/consultations", { headers: { Cookie: COOKIE } }),
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
