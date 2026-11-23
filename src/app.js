import express from "express";
import { resolve } from "node:path";
import { api } from "./routes/api.js";
import { session, csrf } from "./middleware/auth.js";
import { uploadDir } from "./services/uploads.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((request, response, next) => {
    response.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    });
    next();
  });
  app.use(
    express.json({
      limit: "24mb",
      strict: true,
    }),
  );
  app.use((request, response, next) => {
    request.body ??= {};
    next();
  });
  app.use(
    "/api",
    (request, response, next) => {
      response.set("Cache-Control", "no-store");
      next();
    },
    session,
    csrf,
    api,
  );
  app.use(
    "/uploads",
    express.static(uploadDir, {
      dotfiles: "deny",
      immutable: true,
      maxAge: "7d",
      setHeaders: (response) => {
        return response.set("Content-Security-Policy", "default-src 'none'; sandbox");
      },
    }),
  );
  app.use(
    express.static(resolve("public"), {
      etag: true,
    }),
  );
  app.use("/api", (request, response) => {
    return response.status(404).json({
      error: "API route not found.",
    });
  });
  app.use((err, request, response, next) => {
    const status =
      err.status || (err.code === "P2002" ? 409 : err.code === "P2025" ? 404 : 500);
    if (status === 500) {
      console.error(err);
    }
    response.status(status).json({
      error:
        status === 413
          ? "Request is too large. Choose up to 3 photos under 2 MB each and one video under 10 MB."
          : err.code === "P2002"
            ? "This email or name is already in use."
            : status === 500
              ? "Something went wrong. Please try again."
              : err.message,
    });
  });
  return app;
}
