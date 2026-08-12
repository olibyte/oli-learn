import type { NextRequest } from "next/server";

import { COLUMNS, toDto } from "@/lib/api/consultations";
import {
  fromDatabaseError,
  internal,
  malformedJson,
  unauthenticated,
  validationFailed,
} from "@/lib/api/problem";
import { CreateConsultation, toFieldErrors } from "@/lib/api/schemas";
import { createClient } from "@/lib/supabase/server";

const INSTANCE = "/api/consultations";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1. Authenticate before anything else, so an unauthenticated caller cannot
  //    probe the schema through validation error messages. getClaims() is the
  //    authoritative check here - this project uses asymmetric ES256 signing
  //    keys, so it verifies locally. proxy.ts is not an authorization boundary.
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const studentId = claims?.claims?.sub;
  if (claimsError || !studentId) return unauthenticated(INSTANCE);

  // 2. Body. The catch is deliberately narrow: under Cache Components, runtime
  //    data access bails out of prerendering *by throwing*, so a broad
  //    try/catch around the handler would swallow the framework's control flow.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return malformedJson(INSTANCE);
  }

  const parsed = CreateConsultation.safeParse(raw);
  if (!parsed.success) {
    return validationFailed(toFieldErrors(parsed.error), INSTANCE);
  }

  // 3. Insert as the signed-in user. The insert policy's WITH CHECK pins
  //    student_id to auth.uid(), so booking on someone else's behalf is
  //    rejected by the database even though we set it here.
  const { data, error } = await supabase
    .from("consultations")
    .insert({
      student_id: studentId,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      reason: parsed.data.reason,
      scheduled_at: parsed.data.scheduledAt,
    })
    .select(COLUMNS)
    .maybeSingle();

  if (error) return fromDatabaseError(error, INSTANCE);
  if (!data) return internal(INSTANCE);

  return Response.json(toDto(data), {
    status: 201,
    headers: { Location: `${INSTANCE}/${data.id}` },
  });
}
