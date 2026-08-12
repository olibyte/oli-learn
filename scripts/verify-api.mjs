// Verifies the consultation route handlers end to end against a dev server
// pointed at the LOCAL Supabase stack.
const APP = process.env.APP ?? "http://localhost:3000";
const SUPA = process.env.SUPA ?? "https://wdntcehfaallkiwrvmeu.supabase.co";
const KEY = process.env.KEY;
if (!KEY) throw new Error("set KEY to the publishable key");

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

const future = new Date(Date.now() + 7 * 864e5).toISOString();
const past = "2020-01-01T10:00:00.000Z";

const stud = await session("student@example.com", "demo-password-123");
const admin = await session("admin@example.com", "demo-password-123");
// Discover the storage-key ref the app actually uses by asking the app itself.
const refCandidates = [new URL(SUPA).hostname.split(".")[0], "127", "localhost"];
let COOKIE = null;
for (const ref of refCandidates) {
  const r = await req("/api/consultations", {
    method: "POST",
    headers: { Cookie: cookieFor(stud, ref) },
    body: JSON.stringify({}),
  });
  if (r.status !== 401) {
    COOKIE = cookieFor(stud, ref);
    console.log(`(auth cookie ref resolved: sb-${ref}-auth-token)\n`);
    break;
  }
}
if (!COOKIE) {
  console.log("could not resolve auth cookie ref — aborting");
  process.exit(1);
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
    body: JSON.stringify({
      scheduledAt: new Date(Date.now() + 14 * 864e5).toISOString(),
    }),
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
