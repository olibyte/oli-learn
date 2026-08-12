import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { unauthenticatedBody } from "../api/problem";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    // API routes get a JSON 401, not a redirect. `fetch` follows a 302
    // transparently, so the caller would otherwise receive 200 OK containing an
    // HTML login page and fail while parsing it as JSON. Keeping /api inside the
    // matcher is deliberate - it is the safer default - so the distinction is
    // made here instead. See docs/api-contract.md.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const unauthorized = NextResponse.json(
        unauthenticatedBody(request.nextUrl.pathname),
        { status: 401 },
      );
      unauthorized.headers.set("Content-Type", "application/problem+json");
      // Carry over any refreshed auth cookies rather than dropping them.
      supabaseResponse.cookies
        .getAll()
        .forEach((cookie) => unauthorized.cookies.set(cookie));
      return unauthorized;
    }

    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Admin-only routes.
  //
  // The page guards itself too, but under Cache Components its shell is
  // committed with a 200 before `notFound()` can change the status - a student
  // received the correct not-found page with the wrong code. `instant = false`
  // does not help: it marks a segment as *allowed* to block, not required to.
  // The status has to be decided before anything streams, which means here.
  //
  // This is routing, not authorization. The page's own check stays as defence in
  // depth, and RLS remains the real boundary - Next's docs are explicit that the
  // proxy is not one.
  if (
    user &&
    request.nextUrl.pathname.startsWith("/protected/admin") &&
    user.user_role !== "admin"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/_not-found";
    const notFound = NextResponse.rewrite(url, { status: 404 });
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => notFound.cookies.set(cookie));
    return notFound;
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
