import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-safe auth (no Prisma adapter). The `authorized` callback inside
// authConfig handles redirecting unauthenticated users to /auth/signin.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: [
    "/((?!api/auth|auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
