// HTTP handlers for citizen registration, login, logout, and the current session.

import { db } from "../db.js";
import {
  email,
  password,
  text,
  hashPassword,
  verifyPassword,
  safeUser,
  token,
  digest,
  fail,
} from "../services/security.js";
const cookie = (response, sessionToken, maxAge) => {
  return response.cookie("fmc_session", sessionToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "1",
    path: "/",
    maxAge,
  });
};

async function openSession(request, response, user) {
  if (request.session) {
    await db.session.deleteMany({
      where: {
        id: request.session.id,
      },
    });
  }
  const sessionToken = token();
  const csrfToken = token();
  await db.session.create({
    data: {
      id: digest(sessionToken),
      csrf: csrfToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  cookie(response, sessionToken, 7 * 86400000);
  return {
    user: safeUser(user),
    csrf: csrfToken,
  };
}

export async function register(request, response) {
  const data = {
    name: text(request.body.name, "Name", 2, 70),
    email: email(request.body.email),
    passwordHash: await hashPassword(password(request.body.password)),
    role: "CITIZEN",
  };
  if (
    await db.user.findUnique({
      where: {
        email: data.email,
      },
    })
  ) {
    fail(409, "An account already uses this email.");
  }
  const user = await db.user.create({
    data,
  });
  response.status(201).json(await openSession(request, response, user));
}
const dummy = await hashPassword("DummyPassword!123");

export async function login(request, response) {
  const address = email(request.body.email);
  const submittedPassword = text(request.body.password, "Password", 1, 128);
  const user = await db.user.findUnique({
    where: {
      email: address,
    },
  });
  const valid = await verifyPassword(submittedPassword, user?.passwordHash || dummy);
  if (!user || !valid) {
    fail(401, "Email or password is incorrect.");
  }
  response.json(await openSession(request, response, user));
}

export async function logout(request, response) {
  await db.session.deleteMany({
    where: {
      id: request.session.id,
    },
  });
  cookie(response, "", 0);
  response.json({
    ok: true,
  });
}

export function me(request, response) {
  response.json({
    user: safeUser(request.user),
    csrf: request.session.csrf,
  });
}
