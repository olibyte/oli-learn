import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";
import { unauthenticatedBody } from "../api/problem";
import { routeForRole } from "../auth/role-routing";

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

  // Role routing, in one place - both a student kept out of the admin view and
  // an admin kept off the booking dashboard. `lib/auth/role-routing.ts` holds
  // the rule and its tests; this block only turns the answer into a response.
  //
  // It lives here because a page cannot do it. Under Cache Components a page's
  // shell is prerendered and sent with a 200 before anything inside its Suspense
  // boundary runs, so a `notFound()` or `redirect()` from a page body arrives
  // after the status is already committed - a student got the correct not-found
  // page with the wrong code. The proxy is the last point at which the response
  // has not started.
  //
  // `export const instant = false` does not change that and never did. It is a
  // *validation* control - it opts a segment out of Cache Components' dev-time
  // checks and has no effect on when a segment renders. See
  // node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
  // 02-route-segment-config/instant.md.
  //
  // This is routing, not authorization. RLS is the real boundary - Next's docs
  // are explicit that the proxy is not one - and the admin page keeps its own
  // claim check as defence in depth.
  if (user) {
    const routing = routeForRole(request.nextUrl.pathname, user.user_role);

    // Any response built here replaces `supabaseResponse`, so it has to carry
    // the refreshed auth cookies over or the session is dropped on the way out.
    const withCookies = (response: NextResponse) => {
      supabaseResponse.cookies
        .getAll()
        .forEach((cookie) => response.cookies.set(cookie));
      return response;
    };

    if (routing.kind === "not-found") {
      const url = request.nextUrl.clone();
      url.pathname = "/_not-found";
      return withCookies(NextResponse.rewrite(url, { status: 404 }));
    }

    if (routing.kind === "redirect") {
      const url = request.nextUrl.clone();
      url.pathname = routing.to;
      // A redirect rather than a rewrite: the address bar should agree with the
      // page, so a bookmark or a Back press behaves. 307 rather than 308 - the
      // reason is the user's role, which can change, not a moved route.
      return withCookies(NextResponse.redirect(url));
    }
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
