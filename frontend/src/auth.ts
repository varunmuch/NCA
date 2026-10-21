import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { callAuthBridge } from "@/lib/cie-server";


// The code is exposed to the browser, so it only says *why* in broad terms.
class AccountLockedError extends CredentialsSignin {
  code = "locked";
}


type PasswordLoginResponse = {
  student_id?: string;
  email?: string;
  name?: string;
};

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  trustHost: true,

  secret: process.env.AUTH_SECRET,

  pages: {
    signIn: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8,
  },

  providers: [
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: {
        email: {},
        password: {},
      },

      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";

        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : "";

        if (!email || !password) {
          return null;
        }

        const result =
          await callAuthBridge<PasswordLoginResponse>(
            "/api/v1/auth/password/login",
            {
              email,
              password,
            }
          );

        if (result.status === 429) {
          throw new AccountLockedError();
        }

        if (
          !result.ok ||
          !result.data.student_id
        ) {
          return null;
        }

        return {
          id: result.data.student_id,
          email: result.data.email ?? email,
          name: result.data.name ?? "",
        };
      },
    }),

    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          prompt: "select_account",
          scope: "openid email profile",
        },
      },
    }),
  ],

  callbacks: {
    async jwt({
      token,
      account,
      profile,
      user,
    }) {
      if (account?.provider) {
        token.provider = account.provider;
        // When this sign-in happened; lets the backend end sessions that
        // began before a password reset.
        token.authTime = Math.floor(Date.now() / 1000);
      }

      if (
        account?.provider === "google" &&
        profile?.sub
      ) {
        token.providerSubject = profile.sub;
      }

      // For password accounts the subject is the CIE student ID.
      if (
        account?.provider === "password" &&
        user?.id
      ) {
        token.providerSubject = user.id;
      }

      if (
        typeof profile?.email_verified === "boolean"
      ) {
        token.googleEmailVerified =
          profile.email_verified;
      }

      return token;
    },

    async session({
      session,
      token,
    }) {
      if (session.user) {
        session.user.provider =
          typeof token.provider === "string"
            ? token.provider
            : undefined;

        session.user.providerSubject =
          typeof token.providerSubject === "string"
            ? token.providerSubject
            : typeof token.sub === "string"
              ? token.sub
              : undefined;

        session.user.googleEmailVerified =
          token.googleEmailVerified === true;

        session.user.authTime =
          typeof token.authTime === "number" ? token.authTime : undefined;
      }

      return session;
    },
  },
});
