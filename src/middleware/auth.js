// Request checks for login sessions, roles, CSRF protection, and sign-in limits.

import { db } from "../db.js";
import { digest, fail } from "../services/security.js";

export async function session(request, response, next) {
  const sessionToken = (request.headers.cookie || "")
    .split(";")
    .map((s) => {
      return s.trim();
    })
    .find((s) => {
      return s.startsWith("fmc_session=");
    })
    ?.slice(12);
  if (sessionToken && /^[a-f0-9]{64}$/.test(sessionToken)) {
    const s = await db.session.findUnique({
      where: {
        id: digest(sessionToken),
      },
      include: {
        user: true,
      },
    });
    if (s && s.expiresAt > new Date()) {
      request.user = s.user;
      request.session = s;
    }
  }
  next();
}

export function requireUser(request, response, next) {
  if (!request.user) {
    fail(401, "Please sign in to continue.");
  }
  next();
}

export const roles = (...allowed) => {
  return (request, response, next) => {
    if (!request.user) {
      fail(401, "Please sign in to continue.");
    }
    if (!allowed.includes(request.user.role)) {
      fail(403, "Your account cannot perform this action.");
    }
    next();
  };
};

export function csrf(request, response, next) {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.origin;
    if (origin && origin !== `${request.protocol}://${request.get("host")}`) {
      fail(403, "Cross-origin requests are not allowed.");
    }
    if (request.session && request.headers["x-csrf-token"] !== request.session.csrf) {
      fail(403, "Your session needs refreshing. Reload and try again.");
    }
  }
  next();
}
const buckets = new Map();

export function throttle(request, response, next) {
  const key = request.ip;
  const now = Date.now();
  const attemptBucket = buckets.get(key) || {
    count: 0,
    reset: now + 900000,
  };
  if (now > attemptBucket.reset) {
    attemptBucket.count = 0;
    attemptBucket.reset = now + 900000;
  }
  attemptBucket.count++;
  buckets.set(key, attemptBucket);
  if (attemptBucket.count > 50) {
    fail(429, "Too many sign-in attempts. Try again in 15 minutes.");
  }
  next();
}
setInterval(() => {
  for (const [key, attemptBucket] of buckets) {
    if (Date.now() > attemptBucket.reset) {
      buckets.delete(key);
    }
  }
}, 60000).unref();
