import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      provider?: string;
      providerSubject?: string;
      googleEmailVerified?: boolean;
      authTime?: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    provider?: string;
    providerSubject?: string;
    googleEmailVerified?: boolean;
    authTime?: number;
  }
}
