import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Edge-safe Auth.js config — no Prisma adapter. Imported by middleware.ts
// (which runs in the edge runtime where Prisma's query engine can't load).
// The full config in src/auth.ts spreads this and adds the PrismaAdapter.
export const authConfig = {
  // JWT sessions instead of database sessions: required so the edge
  // middleware can decode the session cookie without hitting Postgres.
  session: { strategy: "jwt" },
  providers: [
    Google({
      // Auto-link Google sign-ins to existing User rows that match by email.
      // Safe with Google because the OAuth flow only succeeds if Google has
      // verified the user controls that email address. This is required so
      // that data migrated in from .travel-planner/ files (which created a
      // User row without an Account) can be claimed on first sign-in.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
    signIn({ user }) {
      if (allowedEmails.length === 0) return true;
      const email = user.email?.toLowerCase();
      return Boolean(email && allowedEmails.includes(email));
    },
    jwt({ token, user }) {
      // First sign-in: `user` is the DB User row; persist its id into the JWT.
      // Subsequent calls: `user` is undefined and we just return the token.
      if (user?.id) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      // Mirror the userId we stashed in the JWT onto session.user.id so
      // server code (requireAuth) can read it.
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
