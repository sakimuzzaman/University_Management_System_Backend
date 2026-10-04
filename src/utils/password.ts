import bcrypt from "bcryptjs";

const ROUNDS = 12;
let dummyHash: string | null = null;

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null) {
  if (!dummyHash) dummyHash = await bcrypt.hash("dummy-password", ROUNDS);
  const ok = await bcrypt.compare(plain, hash ?? dummyHash);
  return Boolean(hash) && ok;
}