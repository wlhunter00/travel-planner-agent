export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    // Run on every route except auth endpoints, the auth UI, and static assets.
    "/((?!api/auth|auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
