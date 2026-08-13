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
 *
 * One block is the exception to "as real signed-in users": `the layers behind a
 * refusal` connects to Postgres as its owner, because when two independent rules
 * both refuse a write, no test at the API boundary can say which one answered -
 * and a rule that is never the one answering is not being tested. Everything it
 * changes happens inside a transaction it rolls back.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { nextBookingBoundary } from "@/lib/consultations/booking-boundary";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

/** Matches `supabase/seed.sql`; local stack only, see the header there. */
const PASSWORD = "local-dev-only";
const STUDENT_A = "student@example.com";
const ADMIN = "admin@example.com";
const STUDENT_B = "student-b@example.com";

/**
 * Seeded ids. Both students are seeded, which is what makes isolation testable:
 * every assertion below is about one of these two people failing to reach the
 * other, and a fixed id lets that be asserted on row identity rather than on a
 * count that only holds on a freshly reset database.
 */
const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";
const STUDENT_A_ID = "a0000000-0000-4000-8000-000000000002";
const STUDENT_B_ID = "a0000000-0000-4000-8000-000000000003";

const SEEDED = {
  scheduled: "c0000000-0000-4000-8000-000000000001",
  completed: "c0000000-0000-4000-8000-000000000002",
  cancelled: "c0000000-0000-4000-8000-000000000003",
};

/** Student B's own row - the other side of every isolation assertion. */
const SEEDED_B = "c0000000-0000-4000-8000-000000000004";

const anon = () => createClient(URL, KEY);

/**
 * A future time on a 15-minute boundary.
 *
 * Every fixture insert needs one now that the rules trigger enforces the grid:
 * an unaligned `scheduled_at` would be rejected for *that* reason, and a test
 * asserting some other rule would pass while proving nothing.
 */
const futureBoundary = (days = 3) =>
  nextBookingBoundary(new Date(Date.now() + days * 864e5)).toISOString();

/** The same instant, nudged off the grid. */
const offBoundary = (days = 3) =>
  new Date(
    nextBookingBoundary(new Date(Date.now() + days * 864e5)).getTime() + 60_000,
  ).toISOString();

async function signIn(email: string) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

/**
 * Runs SQL against the local database as its owner.
 *
 * Used by exactly one block below, which has to take a trigger out of the way to
 * see what is behind it - something no API client can do, by design. The Docker
 * container is the connection route because `supabase start` already requires
 * Docker, so this adds no dependency a reviewer does not already have.
 */
function asOwner(script: string) {
  const config = readFileSync(
    new global.URL("../../supabase/config.toml", import.meta.url),
    "utf8",
  );
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!projectId) throw new Error("no project_id in supabase/config.toml");

  const psql = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${projectId}`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: script, encoding: "utf8" },
  );
  if (psql.error) {
    throw new Error(
      `Could not reach the local database container: ${psql.error.message}. ` +
        "This block needs the same Docker that `pnpm supabase start` uses.",
    );
  }
  return `${psql.stdout}\n${psql.stderr}`;
}

let studentA: SupabaseClient;
let studentB: SupabaseClient;
let admin: SupabaseClient;

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
  studentB = await signIn(STUDENT_B);
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
    expect(data!.every((r) => r.student_id === STUDENT_B_ID)).toBe(true);
    expect(data!.some((r) => Object.values(SEEDED).includes(r.id))).toBe(false);
  });

  it("student B cannot read a specific consultation of A's by id", async () => {
    const { data } = await studentB
      .from("consultations")
      .select("id")
      .eq("id", SEEDED.scheduled);
    expect(data).toEqual([]);
  });

  it("student A cannot read student B's seeded consultation by id", async () => {
    // The mirror of the case above, so neither direction rests on which student
    // happens to be the one the seed calls "the" student.
    const { data } = await studentA
      .from("consultations")
      .select("id")
      .eq("id", SEEDED_B);
    expect(data).toEqual([]);
  });

  it("student A cannot read a row B has only just written", async () => {
    // A seeded row proves the policy; a fresh one proves it applies to rows the
    // application creates at runtime too, on the same path a real booking takes.
    const { error: insertError } = await studentB
      .from("consultations")
      .insert({
        student_id: STUDENT_B_ID,
        first_name: "Bee",
        last_name: "Two",
        reason: "isolation fixture",
        scheduled_at: futureBoundary(),
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
    // 3 seeded for A, 1 for B. Asserted on identity as well as breadth: seeing
    // "more than one student_id" would also be true of a policy that leaked some
    // third party's rows while still hiding B's.
    expect(new Set(data!.map((r) => r.student_id)).size).toBeGreaterThan(1);
    const ids = data!.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(Object.values(SEEDED)));
    expect(ids).toContain(SEEDED_B);
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

describe("the admin page function", () => {
  // `admin_consultations_page` exists because PostgREST cannot express the row
  // comparison that bounds the keyset scan. Moving a query into the database is
  // exactly where a read accidentally becomes privileged, so the isolation
  // invariant is asserted through the function itself and not only through the
  // table - `security definer` here would silently hand every caller the lot.
  it("IS SUBJECT TO RLS - a student reaches only their own rows through it", async () => {
    const { data, error } = await studentB.rpc("admin_consultations_page", {
      page_size: 100,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(
      data!.every((r: { student_id: string }) => r.student_id === STUDENT_B_ID),
    ).toBe(true);
  });

  it("lets an admin page across students", async () => {
    const { data } = await admin.rpc("admin_consultations_page", {
      page_size: 100,
    });
    expect(new Set(data!.map((r: { student_id: string }) => r.student_id)).size)
      .toBeGreaterThan(1);
  });

  it("is unreachable signed out", async () => {
    const { error } = await anon().rpc("admin_consultations_page", {});
    expect(error?.code).toBe("42501");
  });

  it("pages with the cursor without skipping or repeating a row", async () => {
    const { data: first } = await admin.rpc("admin_consultations_page", {
      page_size: 2,
    });
    const last = first![first!.length - 1];

    const { data: second } = await admin.rpc("admin_consultations_page", {
      cursor_scheduled_at: last.scheduled_at,
      cursor_id: last.id,
      page_size: 2,
    });

    const firstIds = first!.map((r: { id: string }) => r.id);
    const secondIds = second!.map((r: { id: string }) => r.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
    // Newest first, so the second page continues strictly below the cursor.
    expect(
      second!.every(
        (r: { scheduled_at: string }) => r.scheduled_at <= last.scheduled_at,
      ),
    ).toBe(true);
  });

  it("clamps page_size, so a caller cannot ask for the whole table", async () => {
    const { data } = await admin.rpc("admin_consultations_page", {
      page_size: 1_000_000,
    });
    expect(data!.length).toBeLessThanOrEqual(100);
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

  it("a student cannot look up who the admins are", async () => {
    // Not the same question as the blanket select above. A table that answered
    // filtered queries while refusing unfiltered ones would still hand an
    // attacker the list of accounts worth going after, and the revoke is what
    // makes even a pinpoint read impossible rather than merely empty.
    const { data, error } = await studentA
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("a brand-new account is a student, not an admin", async () => {
    // The one place the suite still exercises signup, and deliberately: this is
    // the self-service escalation path - if the default role were wrong, anyone
    // could mint an admin by registering. Both seeded students take the same
    // trigger, but a seeded row cannot prove the trigger still fires.
    const fresh = anon();
    const email = `signup-${Date.now()}@example.com`;
    const { error: signUpError } = await fresh.auth.signUp({
      email,
      password: PASSWORD,
    });
    expect(signUpError).toBeNull();

    const { data } = await fresh.auth.getClaims();
    expect(data?.claims?.user_role).toBe("student");

    const { error } = await fresh.from("consultations").select("id");
    expect(error).toBeNull();
  });
});

describe("ownership", () => {
  it("a student cannot book on another student's behalf", async () => {
    const { error } = await studentB.from("consultations").insert({
      student_id: STUDENT_A_ID,
      first_name: "Not",
      last_name: "Mine",
      reason: "row for someone else",
      scheduled_at: futureBoundary(),
    });
    expect(error?.code).toBe("42501");
  });

  it("A STUDENT CANNOT EDIT ANOTHER STUDENT'S ROW", async () => {
    // The refusal here is silent, and that is not a bug: no row satisfies the
    // policy's USING clause, so the UPDATE matches nothing and PostgREST
    // reports zero rows rather than an error. `PATCH /api/consultations/[id]`
    // already relies on that distinction to return 404 rather than 403 - it
    // cannot tell "not yours" from "does not exist", which is the correct
    // answer to give a caller either way.
    //
    // Zero rows is also exactly what a successful no-op looks like, so the
    // assertion that matters is the second one: B's row is still untouched.
    const before = await studentB
      .from("consultations")
      .select("status")
      .eq("id", SEEDED_B)
      .single();

    const { data, error } = await studentA
      .from("consultations")
      .update({ status: "cancelled" })
      .eq("id", SEEDED_B)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const after = await studentB
      .from("consultations")
      .select("status")
      .eq("id", SEEDED_B)
      .single();
    expect(after.data!.status).toBe(before.data!.status);
  });

  it("a student cannot hand their own row to someone else", async () => {
    // What WITH CHECK exists for. Note the error code: 23514 is the rules
    // trigger, not 42501 from the policy - the trigger's immutability rule fires
    // first and the policy never gets asked. The refusal is real either way, but
    // "which layer refuses it" is a separate question, and asserting only this
    // would leave WITH CHECK looking tested when it is merely shadowed. The
    // block below settles it.
    const { error } = await studentA
      .from("consultations")
      .update({ student_id: STUDENT_B_ID })
      .eq("id", SEEDED.scheduled);
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/only status and scheduled_at may change/i);
  });

  it("nobody may delete a consultation - the privilege does not exist", async () => {
    // 42501 with this message, rather than a policy violation, is the point:
    // DELETE is not merely unpolicied, the grant was never issued. A future
    // permissive policy could not switch it on by itself.
    const { error } = await studentA
      .from("consultations")
      .delete()
      .eq("id", SEEDED.scheduled);
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/permission denied for table consultations/i);
  });

  it("a student cannot delete another student's row either", async () => {
    const { error } = await studentB
      .from("consultations")
      .delete()
      .eq("id", SEEDED.scheduled);
    expect(error?.code).toBe("42501");
  });
});

describe("the admin's write surface", () => {
  // "Read-only" is the claim the brief allows and the README makes. These pin
  // its exact edges, because the interesting failure is not an admin who can do
  // everything - it is one who can do slightly more than the sentence admits.
  it("AN ADMIN CANNOT BOOK FOR SOMEONE ELSE", async () => {
    const { error } = await admin.from("consultations").insert({
      student_id: STUDENT_A_ID,
      first_name: "On",
      last_name: "Behalf",
      reason: "admin booking for a student",
      scheduled_at: futureBoundary(6),
    });
    expect(error?.code).toBe("42501");
  });

  it("an admin cannot delete", async () => {
    const { error } = await admin
      .from("consultations")
      .delete()
      .eq("id", SEEDED.scheduled);
    expect(error?.code).toBe("42501");
  });

  it("but an admin CAN book their own consultation, like any signed-in user", async () => {
    // Deliberate, and worth stating out loud so nobody later "fixes" it into a
    // blanket ban. The admin role adds a read across students; it takes nothing
    // away. The insert policy is `auth.uid() = student_id` for every
    // authenticated user, and an admin is one - so an admin books for
    // themselves, and for nobody else.
    const { data, error } = await admin
      .from("consultations")
      .insert({
        student_id: (await admin.auth.getUser()).data.user!.id,
        first_name: "Ad",
        last_name: "Min",
        reason: "an admin is also a person",
        scheduled_at: futureBoundary(7),
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.status).toBe("scheduled");
  });
});

describe("the layers behind a refusal", () => {
  // Two rules stand between a student and another student's row, and at the API
  // boundary you cannot tell which one answered - so neither can be said to be
  // tested. Taking one away needs owner rights the API deliberately does not
  // offer. Every script below runs inside a transaction that is rolled back, and
  // DDL in Postgres is transactional, so nothing it changes outlives the call.
  const asStudentA = (setUp: string) => `
    begin;
    ${setUp}
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${STUDENT_A_ID}","role":"authenticated","user_role":"student"}';
    update public.consultations
       set student_id = '${STUDENT_B_ID}'
     where id = '${SEEDED.scheduled}';
    rollback;
  `;

  const DISABLE_TRIGGER =
    "alter table public.consultations disable trigger consultations_enforce_rules;";

  it("the trigger answers first, so the policy is never consulted", () => {
    const out = asOwner(asStudentA(""));
    expect(out).toMatch(/Only status and scheduled_at may change after booking/);
    expect(out).not.toMatch(/violates row-level security policy/);
  });

  it("the policy refuses it too, with the trigger out of the way", () => {
    const out = asOwner(asStudentA(DISABLE_TRIGGER));
    expect(out).toMatch(/new row violates row-level security policy/);
  });

  // Careful here, because the obvious next assertion is wrong. Dropping this
  // policy's WITH CHECK changes nothing: when an UPDATE policy has no WITH
  // CHECK, Postgres reuses its USING expression for the resulting row, and the
  // two expressions are identical. So the explicit clause is not what stops
  // today's reassignment, and a test claiming it was would pass with the clause
  // deleted.
  //
  // What it does buy is independence from USING. The day someone widens USING -
  // an admin-write feature is the obvious way - the fallback would widen writes
  // along with reads, silently. These two halves are that day, rehearsed.
  const asAdminAgainstAsRow = (withCheck: boolean) =>
    asOwner(`
      begin;
      ${DISABLE_TRIGGER}
      drop policy "students update own consultations" on public.consultations;
      create policy "students update own consultations"
        on public.consultations for update to authenticated
        using ( (select auth.uid()) = student_id
                or ((select auth.jwt()) ->> 'user_role') = 'admin' )
        ${withCheck ? "with check ( (select auth.uid()) = student_id )" : ""};
      set local role authenticated;
      set local request.jwt.claims = '{"sub":"${ADMIN_ID}","role":"authenticated","user_role":"admin"}';
      update public.consultations
         set status = 'cancelled'
       where id = '${SEEDED.scheduled}';
      rollback;
    `);

  it("WITH CHECK IS WHAT KEEPS A WIDER USING FROM WIDENING WRITES", () => {
    expect(asAdminAgainstAsRow(true)).toMatch(
      /new row violates row-level security policy/,
    );
    // Same widening, clause removed: the write lands on a row the writer does
    // not own. This is the regression the clause is there to prevent.
    expect(asAdminAgainstAsRow(false)).toMatch(/UPDATE 1/);
  });

  it("leaves the trigger enabled, so the rest of the suite still means something", () => {
    const out = asOwner(`
      select tgenabled from pg_trigger
       where tgname = 'consultations_enforce_rules';
    `);
    // 'O' is origin, Postgres's word for an enabled trigger.
    expect(out).toMatch(/^\s*O\s*$/m);
  });

  it("the update policy still carries its own WITH CHECK", () => {
    // Not cleanup - an invariant. The test above shows what removing this clause
    // costs once USING is widened, and the two changes can arrive in separate
    // commits months apart. This one fails on the first of them.
    const out = asOwner(`
      select polwithcheck is not null as has_with_check from pg_policy
       where polrelid = 'public.consultations'::regclass
         and polname = 'students update own consultations';
    `);
    expect(out).toMatch(/^\s*t\s*$/m);
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
      scheduled_at: futureBoundary(1),
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

describe("15-minute booking boundaries, enforced in the database", () => {
  // The zod refinement and the picker's `step` both state this rule, and both
  // are a devtools console away from being skipped: these tests go straight to
  // PostgREST as a signed-in student, which is the surface that has to hold.
  const book = (client: SupabaseClient, scheduledAt: string, id: string) =>
    client.auth
      .getUser()
      .then(({ data }) =>
        client.from("consultations").insert({
          student_id: data.user!.id,
          first_name: "Bound",
          last_name: "Ary",
          reason: id,
          scheduled_at: scheduledAt,
        }),
      );

  it.each([0, 15, 30, 45])("accepts a booking at :%s", async (minute) => {
    const at = nextBookingBoundary(new Date(Date.now() + 30 * 864e5));
    at.setUTCMinutes(minute, 0, 0);
    const { error } = await book(studentA, at.toISOString(), `boundary-${minute}`);
    expect(error).toBeNull();
  });

  it("REJECTS A BOOKING OFF THE GRID, straight through PostgREST", async () => {
    const { error } = await book(studentA, offBoundary(), "off-grid");
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/15-minute blocks/i);
  });

  it("rejects stray seconds on an otherwise legal minute", async () => {
    // The minute is right and the time still is not - which is why the check is
    // a modulo on the epoch rather than a look at `extract(minute from ...)`.
    const at = nextBookingBoundary(new Date(Date.now() + 31 * 864e5));
    const { error } = await book(
      studentA,
      new Date(at.getTime() + 1_000).toISOString(),
      "stray-seconds",
    );
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/15-minute blocks/i);
  });

  it("rejects rescheduling off the grid", async () => {
    const { error } = await studentA
      .from("consultations")
      .update({ scheduled_at: offBoundary(4) })
      .eq("id", SEEDED.scheduled);
    expect(error?.code).toBe("23514");
    expect(error?.message).toMatch(/15-minute blocks/i);
  });

  it("accepts rescheduling onto the grid", async () => {
    const at = futureBoundary(5);
    const { data, error } = await studentA
      .from("consultations")
      .update({ scheduled_at: at })
      .eq("id", SEEDED.scheduled)
      .select()
      .single();
    expect(error).toBeNull();
    expect(new Date(data!.scheduled_at).toISOString()).toBe(at);
  });

  it("the seed's own rows sit on the grid", async () => {
    // Otherwise the demo data contradicts the rule the moment a reviewer reads
    // a consultation at 4:37 pm. The seed inserts with the trigger disabled, so
    // nothing but this test holds it to the rule.
    const all = [...Object.values(SEEDED), SEEDED_B];
    const { data } = await admin.from("consultations").select("id, scheduled_at");
    const seeded = data!.filter((r) => all.includes(r.id));
    expect(seeded.length).toBe(all.length);
    expect(
      seeded.every((r) => new Date(r.scheduled_at).getTime() % 900_000 === 0),
    ).toBe(true);
  });

  it("the boundary is checked only when scheduled_at changes", async () => {
    // The rule is prospective, exactly as the past-time rule is: a status-only
    // update must not re-validate the time. This is what stops a consultation
    // booked before the rule existed from becoming permanently un-updatable -
    // the regression a check constraint would have caused.
    //
    // No off-grid row is reachable in a fresh database - after this migration
    // nothing in the repo can create one - so what is asserted here is the
    // guard itself: a status round-trip that never touches scheduled_at.
    const round = async (status: "completed" | "scheduled") =>
      studentA
        .from("consultations")
        .update({ status })
        .eq("id", SEEDED.scheduled)
        .select("scheduled_at")
        .single();

    const before = await round("completed");
    expect(before.error).toBeNull();
    const after = await round("scheduled");
    expect(after.error).toBeNull();
    expect(after.data!.scheduled_at).toBe(before.data!.scheduled_at);
  });
});
