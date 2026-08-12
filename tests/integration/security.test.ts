/**
 * Security boundary tests, run against the LOCAL Supabase stack.
 *
 *   pnpm supabase start && pnpm supabase db reset && pnpm test:integration
 *
 * These deliberately talk to PostgREST as real signed-in users rather than
 * through the app: `lib/supabase/client.ts` is a browser client, so a student's
 * JWT reaches the database directly and this is the surface that actually has to
 * hold. Anything enforced only in a route handler is bypassable from a devtools
 * console.
 *
 * They run against local, never the linked project, so test users are disposable
 * and the demo data a reviewer sees is never polluted.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

const PASSWORD = "demo-password-123";
const STUDENT_A = "student@example.com";
const ADMIN = "admin@example.com";
const STUDENT_B = "student-b@example.com";

const SEEDED = {
  scheduled: "c0000000-0000-4000-8000-000000000001",
  completed: "c0000000-0000-4000-8000-000000000002",
  cancelled: "c0000000-0000-4000-8000-000000000003",
};

const anon = () => createClient(URL, KEY);

async function signIn(email: string) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

/** Student B does not exist in the seed - isolation needs a genuine second user. */
async function signUpOrIn(email: string) {
  const client = anon();
  const { error } = await client.auth.signUp({ email, password: PASSWORD });
  if (error && !/already registered/i.test(error.message)) {
    throw new Error(`sign-up failed for ${email}: ${error.message}`);
  }
  if (error) return signIn(email);
  return client;
}

let studentA: SupabaseClient;
let studentB: SupabaseClient;
let admin: SupabaseClient;
let studentBId: string;

beforeAll(async () => {
  const reachable = await fetch(`${URL}/auth/v1/health`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!reachable) {
    throw new Error(
      `Local Supabase is not reachable at ${URL}. Run \`pnpm supabase start\` (and \`pnpm supabase db reset\` to seed) before the integration suite.`,
    );
  }

  studentA = await signIn(STUDENT_A);
  admin = await signIn(ADMIN);
  studentB = await signUpOrIn(STUDENT_B);

  const { data } = await studentB.auth.getUser();
  studentBId = data.user!.id;
}, 60_000);

describe("tenant isolation", () => {
  // These assert the invariant - "every row I can see is mine" - rather than a
  // row count. A count only holds on a freshly reset database, so it would fail
  // on a second run for reasons that have nothing to do with security.
  it("student A sees only rows they own", async () => {
    const { data: user } = await studentA.auth.getUser();
    const { data } = await studentA.from("consultations").select("student_id");
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((r) => r.student_id === user.user!.id)).toBe(true);
  });

  it("STUDENT B CANNOT READ STUDENT A'S CONSULTATIONS", async () => {
    // The headline case: the whole security model exists for this.
    const { data } = await studentB.from("consultations").select("id, student_id");
    expect(data!.every((r) => r.student_id === studentBId)).toBe(true);
    expect(data!.some((r) => Object.values(SEEDED).includes(r.id))).toBe(false);
  });

  it("student B cannot read a specific consultation of A's by id", async () => {
    const { data } = await studentB
      .from("consultations")
      .select("id")
      .eq("id", SEEDED.scheduled);
    expect(data).toEqual([]);
  });

  it("student A cannot read student B's consultation either", async () => {
    const { error: insertError } = await studentB
      .from("consultations")
      .insert({
        student_id: studentBId,
        first_name: "Bee",
        last_name: "Two",
        reason: "isolation fixture",
        scheduled_at: new Date(Date.now() + 3 * 864e5).toISOString(),
      });
    expect(insertError).toBeNull();

    const { data } = await studentA
      .from("consultations")
      .select("id, reason")
      .eq("reason", "isolation fixture");
    expect(data).toEqual([]);
  });

  it("an anonymous client can read nothing", async () => {
    const { data, error } = await anon().from("consultations").select("id");
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe("42501");
  });
});

describe("admin access", () => {
  it("admin reads every consultation, across students", async () => {
    const { data } = await admin.from("consultations").select("id, student_id");
    // 3 seeded for A, plus the fixture B created above.
    expect(data!.length).toBeGreaterThanOrEqual(4);
    expect(new Set(data!.map((r) => r.student_id)).size).toBeGreaterThan(1);
  });

  it("admin sees cancelled consultations", async () => {
    const { data } = await admin
      .from("consultations")
      .select("id")
      .eq("status", "cancelled");
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });

  it("ADMIN CANNOT WRITE - read-only is enforced, not just unrendered", async () => {
    const { data } = await admin
      .from("consultations")
      .update({ status: "completed" })
      .eq("id", SEEDED.scheduled)
      .select();
    expect(data).toEqual([]);
  });
});

describe("privilege escalation", () => {
  it("a student cannot read the role table", async () => {
    const { error } = await studentA.from("user_roles").select("*");
    expect(error?.code).toBe("42501");
  });

  it("A STUDENT CANNOT PROMOTE THEMSELVES TO ADMIN", async () => {
    const { data: user } = await studentA.auth.getUser();
    const { error } = await studentA
      .from("user_roles")
      .update({ role: "admin" })
      .eq("user_id", user.user!.id);
    expect(error?.code).toBe("42501");

    // And the claim is unchanged after a fresh token.
    const fresh = await signIn(STUDENT_A);
    const { data } = await fresh.auth.getClaims();
    expect(data?.claims?.user_role).toBe("student");
  });

  it("a student cannot insert an admin row for themselves", async () => {
    const { data: user } = await studentA.auth.getUser();
    const { error } = await studentA
      .from("user_roles")
      .insert({ user_id: user.user!.id, role: "admin" });
    expect(error?.code).toBe("42501");
  });
});

describe("ownership", () => {
  it("a student cannot book on another student's behalf", async () => {
    const { error } = await studentB.from("consultations").insert({
      student_id: (await studentA.auth.getUser()).data.user!.id,
      first_name: "Not",
      last_name: "Mine",
      reason: "row for someone else",
      scheduled_at: new Date(Date.now() + 3 * 864e5).toISOString(),
    });
    expect(error?.code).toBe("42501");
  });

  it("nobody may delete a consultation - the privilege does not exist", async () => {
    const { error } = await studentA
      .from("consultations")
      .delete()
      .eq("id", SEEDED.scheduled);
    expect(error?.code).toBe("42501");
  });
});

describe("state machine, enforced in the database", () => {
  it("scheduled -> completed -> scheduled round-trips", async () => {
    const done = await studentA
      .from("consultations")
      .update({ status: "completed" })
      .eq("id", SEEDED.scheduled)
      .select()
      .single();
    expect(done.data?.status).toBe("completed");

    const reopened = await studentA
      .from("consultations")
      .update({ status: "scheduled" })
      .eq("id", SEEDED.scheduled)
      .select()
      .single();
    expect(reopened.data?.status).toBe("scheduled");
  });

  it("cancelled is terminal", async () => {
    const { error } = await studentA
      .from("consultations")
      .update({ status: "completed" })
      .eq("id", SEEDED.cancelled);
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/cancelled consultation cannot be changed/i);
  });

  it("a completed consultation cannot be cancelled", async () => {
    const { error } = await studentA
      .from("consultations")
      .update({ status: "cancelled" })
      .eq("id", SEEDED.completed);
    expect(error?.code).toBe("23514");
  });

  it("a PAST consultation can still be marked complete", async () => {
    // The regression this guards: a volatile CHECK constraint, or a trigger that
    // validated scheduled_at on every update, would freeze past rows and break
    // the app's main flow. SEEDED.completed is dated in the past.
    const { error } = await studentA
      .from("consultations")
      .update({ status: "scheduled" })
      .eq("id", SEEDED.completed);
    expect(error).toBeNull();

    await studentA
      .from("consultations")
      .update({ status: "completed" })
      .eq("id", SEEDED.completed);
  });

  it("immutable columns stay immutable after booking", async () => {
    const { error } = await studentA
      .from("consultations")
      .update({ reason: "edited after the fact" })
      .eq("id", SEEDED.scheduled);
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/only status and scheduled_at may change/i);
  });

  it("a consultation cannot be booked in the past", async () => {
    const { data: user } = await studentA.auth.getUser();
    const { error } = await studentA.from("consultations").insert({
      student_id: user.user!.id,
      first_name: "Back",
      last_name: "Dated",
      reason: "past booking",
      scheduled_at: "2020-01-01T10:00:00.000Z",
    });
    expect(error?.code).toBe("23514");
  });

  it("a new consultation cannot start as completed", async () => {
    const { data: user } = await studentA.auth.getUser();
    const { error } = await studentA.from("consultations").insert({
      student_id: user.user!.id,
      first_name: "Pre",
      last_name: "Baked",
      reason: "prebaked status",
      scheduled_at: new Date(Date.now() + 864e5).toISOString(),
      status: "completed",
    });
    expect(error?.code).toBe("23514");
  });

  it("a consultation cannot be rescheduled into the past", async () => {
    const { error } = await studentA
      .from("consultations")
      .update({ scheduled_at: "2020-01-01T10:00:00.000Z" })
      .eq("id", SEEDED.scheduled);
    expect(error?.code).toBe("23514");
  });
});
