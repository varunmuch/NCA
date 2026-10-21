import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((request) => {
  const pathname =
    request.nextUrl.pathname;

  const isLoggedIn =
    Boolean(request.auth);

  const isLoginPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password";

  // Reachable signed in or not (links from emails, forced sign-out).
  const isOpenPage =
    pathname === "/verify-email" ||
    pathname === "/session-expired";

  const isAuthApi =
    pathname.startsWith(
      "/api/auth"
    );

  const isPublicAsset =
    pathname.startsWith(
      "/_next/"
    ) ||
    pathname.startsWith(
      "/brand/"
    ) ||
    pathname === "/favicon.ico";


  if (
    isAuthApi ||
    isPublicAsset ||
    isOpenPage
  ) {
    return NextResponse.next();
  }


  // API callers get a status code, not a login page.
  if (
    !isLoggedIn &&
    pathname.startsWith("/api/cie/")
  ) {
    return NextResponse.json(
      { detail: "Please sign in again." },
      { status: 401 }
    );
  }


  if (
    !isLoggedIn &&
    !isLoginPage
  ) {
    const loginUrl =
      new URL(
        "/login",
        request.nextUrl
      );

    return NextResponse.redirect(
      loginUrl
    );
  }


  if (
    isLoggedIn &&
    isLoginPage
  ) {
    const homeUrl =
      new URL(
        "/",
        request.nextUrl
      );

    return NextResponse.redirect(
      homeUrl
    );
  }


  return NextResponse.next();
});


export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
