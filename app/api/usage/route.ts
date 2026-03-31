import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getUser } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const email = token?.email;
  if (!email) {
    return NextResponse.json({ authenticated: false, freeChatsUsed: 0, isPremium: false });
  }
  const user = await getUser(email);
  return NextResponse.json({
    authenticated: true,
    email,
    freeChatsUsed: user?.free_chats_used || 0,
    isPremium: Boolean(user?.is_premium),
  });
}
