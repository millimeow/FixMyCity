import { Router } from "express";
import * as auth from "../controllers/auth.js";
import * as c from "../controllers/complaints.js";
import * as admin from "../controllers/admin.js";
import { db } from "../db.js";
import { requireUser, roles, throttle } from "../middleware/auth.js";
import { escalate } from "../services/complaints.js";
export const api = Router();
api.get("/health", (request, response) => {
  return response.json({
    ok: true,
  });
});
api.get("/meta", async (request, response) => {
  return response.json({
    categories: await db.category.findMany({
      include: {
        department: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    departments: await db.department.findMany({
      orderBy: {
        name: "asc",
      },
    }),
    cities: ["Mumbai"],
  });
});
api.post("/auth/register", throttle, auth.register);
api.post("/auth/login", throttle, auth.login);
api.get("/auth/me", requireUser, auth.me);
api.post("/auth/logout", requireUser, auth.logout);
api.get("/complaints", c.list);
api.get("/complaints/duplicates", c.duplicates);
api.get("/complaints/:id", c.detail);
api.post("/complaints", roles("CITIZEN"), c.create);
api.post("/complaints/:id/support", roles("CITIZEN"), c.support);
api.delete("/complaints/:id/support", roles("CITIZEN"), c.support);
api.post("/complaints/:id/assign", roles("ADMIN"), c.assign);
api.post("/complaints/:id/status", roles("ADMIN", "OFFICER"), c.status);
api.post("/complaints/:id/feedback", roles("CITIZEN"), c.feedback);
api.get("/notifications", requireUser, async (request, response) => {
  return response.json(
    await db.notification.findMany({
      where: {
        userId: request.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    }),
  );
});
api.post("/notifications/read", requireUser, async (request, response) => {
  await db.notification.updateMany({
    where: {
      userId: request.user.id,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
  response.json({
    ok: true,
  });
});
api.get("/analytics", roles("ADMIN", "OFFICER"), admin.analytics);
api.get("/admin/users", roles("ADMIN"), admin.users);
api.post("/admin/users", roles("ADMIN"), admin.createUser);
api.post("/admin/departments", roles("ADMIN"), admin.createDepartment);
api.post("/admin/categories", roles("ADMIN"), admin.createCategory);
api.post("/admin/escalate", roles("ADMIN"), async (request, response) => {
  return response.json(await escalate());
});
