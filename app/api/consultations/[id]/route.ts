import type { NextRequest } from "next/server";
import { z } from "zod";

import { COLUMNS, toDto } from "@/lib/api/consultations";
import {
  fromDatabaseError,
  malformedJson,
  notFound,
  unauthenticated,
  validationFailed,
} from "@/lib/api/problem";
import { PatchConsultation, toFieldErrors } from "@/lib/api/schemas";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/consultations/[id]">,
) {
  // `params` is a Promise in Next 16; the 15.x synchronous shim is fully removed.
  const { id } = await ctx.params;
  const instance = `/api/consultations/${id}`;

  const supabase = await createClient();

  // 1. Authenticate first - see the POST handler for why.
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claims?.claims?.sub) return unauthenticated(instance);

  // A malformed id would reach Postgres as invalid uuid syntax (22P02). Treat it
  // as not-found so the response is indistinguishable from any other id the
  // caller cannot see.
  if (!z.uuid().safeParse(id).success) return notFound(instance);

  // 2. Body. Narrow catch, as in POST.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return malformedJson(instance);
  }

  const parsed = PatchConsultation.safeParse(raw);
  if (!parsed.success) {
    return validationFailed(toFieldErrors(parsed.error), instance);
  }

  const patch =
    "status" in parsed.data
      ? { status: parsed.data.status }
      : { scheduled_at: parsed.data.scheduledAt };

  // 3. Update as the signed-in user. RLS restricts the target to their own rows;
  //    the rules trigger enforces which transitions are legal.
  const { data, error } = await supabase
    .from("consultations")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) return fromDatabaseError(error, instance);

  // 4. Zero rows affected is NOT a database error. It is exactly what an admin's
  //    write attempt, or a student targeting someone else's row, produces -
  //    RLS simply matches nothing. Without this the handler would return 200 for
  //    a write that changed nothing.
  if (!data) return notFound(instance);

  return Response.json(toDto(data));
}
