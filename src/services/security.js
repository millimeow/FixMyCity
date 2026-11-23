// Password hashing, random tokens, safe user responses, and shared input validation.

import {
  randomBytes,
  scrypt as derive,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(derive);

export const token = () => {
  return randomBytes(32).toString("hex");
};

export const digest = (value) => {
  return createHash("sha256").update(value).digest("hex");
};

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const actual = await scrypt(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

export function fail(status, message) {
  throw Object.assign(new Error(message), {
    status,
  });
}

export function text(value, name, min = 1, max = 500) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  ) {
    fail(400, `${name} must be ${min}–${max} characters.`);
  }
  return value.trim();
}

export function email(value) {
  const normalizedEmail = text(value, "Email", 5, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    fail(400, "Enter a valid email address.");
  }
  return normalizedEmail;
}

export function password(value) {
  const validatedPassword = text(value, "Password", 12, 128);
  if (
    !/[a-z]/.test(validatedPassword) ||
    !/[A-Z]/.test(validatedPassword) ||
    !/[0-9]/.test(validatedPassword)
  ) {
    fail(400, "Password needs upper and lowercase letters and a number.");
  }
  return validatedPassword;
}

export const safeUser = (user) => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
  };
};
