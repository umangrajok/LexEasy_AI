import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getUser, upsertUser } from "./db";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (user.email) await upsertUser(user.email, user.name || null);
      return true;
    },
    async jwt({ token, user }) {
      const email = user?.email || token.email;
      if (email) {
        const dbUser = await getUser(email);
        token.isPremium = Boolean(dbUser?.is_premium);
        token.freeChatsUsed = dbUser?.free_chats_used || 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.isPremium = Boolean(token.isPremium);
        session.user.freeChatsUsed = Number(token.freeChatsUsed || 0);
      }
      return session;
    },
  },
};
