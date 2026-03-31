import { neon } from "@neondatabase/serverless";

export type UserRecord = {
  email: string;
  name: string | null;
  free_chats_used: number;
  is_premium: boolean;
};

let initialized = false;
const memoryUsers = new Map<string, UserRecord>();
const client = process.env.POSTGRES_URL ? neon(process.env.POSTGRES_URL) : null;

async function ensureSchema() {
  if (initialized) return;
  if (!client) return;
  await client`
    CREATE TABLE IF NOT EXISTS users (
      email TEXT PRIMARY KEY,
      name TEXT,
      free_chats_used INTEGER NOT NULL DEFAULT 0,
      is_premium BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  initialized = true;
}

function canUsePostgres() {
  return Boolean(client);
}

export async function upsertUser(email: string, name: string | null) {
  if (!email) return;
  if (!canUsePostgres()) {
    const existing = memoryUsers.get(email) || {
      email,
      name: null,
      free_chats_used: 0,
      is_premium: false,
    };
    existing.name = name ?? existing.name;
    memoryUsers.set(email, existing);
    return;
  }
  await ensureSchema();
  await client!`
    INSERT INTO users (email, name)
    VALUES (${email}, ${name})
    ON CONFLICT (email)
    DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();
  `;
}

export async function getUser(email: string): Promise<UserRecord | null> {
  if (!email) return null;
  if (!canUsePostgres()) return memoryUsers.get(email) || null;
  await ensureSchema();
  const rows = (await client!`
    SELECT email, name, free_chats_used, is_premium
    FROM users
    WHERE email = ${email}
    LIMIT 1;
  `) as unknown as UserRecord[];
  return rows?.[0] || null;
}

export async function incrementFreeChats(email: string) {
  if (!canUsePostgres()) {
    const existing = memoryUsers.get(email);
    if (existing) {
      existing.free_chats_used += 1;
      memoryUsers.set(email, existing);
    }
    return;
  }
  await ensureSchema();
  await client!`
    UPDATE users
    SET free_chats_used = free_chats_used + 1, updated_at = NOW()
    WHERE email = ${email};
  `;
}
