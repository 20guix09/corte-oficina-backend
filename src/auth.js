import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { text } from "./validation.js";
import { ensure } from "./errors.js";
const scrypt = promisify(scryptCallback);
export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export function email(value) {
  const address = text(value, "E-mail").toLowerCase();
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address), "E-mail inválido.");
  return address;
}
export async function hashPassword(value) {
  const password = text(value, "Senha", 128);
  ensure(password.length >= 10, "A senha deve ter pelo menos 10 caracteres.");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}
export async function checkPassword(value, encoded) {
  if (typeof value !== "string" || value.length > 128) return false;
  const [salt, hash] = encoded.split(":");
  const actual = await scrypt(value.trim(), salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export function sessionCookie(token, secure = false, seconds = 28800) {
  return `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? seconds : 0}${secure ? "; Secure" : ""}`;
}
export function authenticate(store, req) {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("session="))
    ?.slice(8);
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : cookie;
  ensure(token, "Entre na sua conta.", 401);
  const user = store.accounts.findSession(tokenHash(token), Date.now());
  ensure(user, "Sessão expirada. Entre novamente.", 401);
  return { user, token };
}
