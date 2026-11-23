import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { rm, writeFile, readFile } from "node:fs/promises";
const db = resolve("prisma/test.db");
process.env.DATABASE_URL = `file:${db}`;
process.env.UPLOAD_DIR = resolve("tests/uploads");
process.env.NODE_ENV = "test";
let server, base;
const users = {};

async function call(path, { method = "GET", body, user, csrf = true } = {}) {
  const headers = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  if (user) {
    headers.Cookie = user.cookie;
    if (csrf) {
      headers["X-CSRF-Token"] = user.csrf;
    }
  }
  const r = await fetch(base + "/api" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  return {
    status: r.status,
    data,
    headers: r.headers,
  };
}

async function login(email) {
  const r = await call("/auth/login", {
    method: "POST",
    body: {
      email,
      password: "CityDemo!2026",
    },
  });
  assert.equal(r.status, 200);
  return {
    cookie: r.headers.get("set-cookie").split(";")[0],
    csrf: r.data.csrf,
    user: r.data.user,
  };
}
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGOQCHb7D8IMMAYAN4IGwRgnzcwAAAAASUVORK5CYII=";
test("real civic reporting and security flows", async (t) => {
  await rm(db, {
    force: true,
  });
  await writeFile(db, "");
  const migration = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(migration.status, 0, migration.stdout + migration.stderr);
  assert.equal(
    spawnSync("node", ["prisma/seed.js"], {
      env: process.env,
      encoding: "utf8",
    }).status,
    0,
  );
  const { createApp } = await import("../src/app.js");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => {
    return server.once("listening", r);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  try {
    await t.test("anonymous users cannot create complaints", async () => {
      return assert.equal(
        (
          await call("/complaints", {
            method: "POST",
            body: {},
          })
        ).status,
        401,
      );
    });
    await t.test(
      "register cannot elevate role and credentials are validated",
      async () => {
        assert.equal(
          (
            await call("/auth/register", {
              method: "POST",
              body: {
                name: "Bad",
                email: "bad",
                password: "x",
              },
            })
          ).status,
          400,
        );
        const r = await call("/auth/register", {
          method: "POST",
          body: {
            name: "Test Citizen",
            email: "test@example.com",
            password: "StrongPassword!42",
            role: "ADMIN",
          },
        });
        assert.equal(r.status, 201);
        assert.equal(r.data.user.role, "CITIZEN");
        assert.equal(
          (
            await call("/auth/login", {
              method: "POST",
              body: {
                email: "test@example.com",
                password: "wrong",
              },
            })
          ).status,
          401,
        );
      },
    );
    users.citizen = await login("citizen@fixmycity.local");
    users.other = await login("neighbor@fixmycity.local");
    users.officer = await login("officer@fixmycity.local");
    users.admin = await login("admin@fixmycity.local");
    users.wrongOfficer = await login("officer2@fixmycity.local");
    const meta = (await call("/meta")).data;
    const cat = meta.categories.find((c) => {
      return c.name === "Roads & potholes";
    });
    let id;
    await t.test("service area is Mumbai only and staff cannot report", async () => {
      assert.deepEqual(meta.cities, ["Mumbai"]);
      for (const user of [users.officer, users.admin]) {
        assert.equal(
          (
            await call("/complaints", {
              method: "POST",
              user,
              body: {},
            })
          ).status,
          403,
        );
      }
      const bad = await call("/complaints", {
        method: "POST",
        user: users.citizen,
        body: {
          categoryId: cat.id,
          city: "Navi Mumbai",
        },
      });
      assert.equal(bad.status, 400);
    });
    await t.test("CSRF and RBAC block unauthorized writes", async () => {
      assert.equal(
        (
          await call("/complaints", {
            method: "POST",
            body: {},
            user: users.citizen,
            csrf: false,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call("/admin/users", {
            user: users.citizen,
          })
        ).status,
        403,
      );
    });
    await t.test("upload validation rejects mismatched images", async () => {
      return assert.equal(
        (
          await call("/complaints", {
            method: "POST",
            user: users.citizen,
            body: {
              title: "Broken road outside station",
              description: "A deep pothole blocks the crossing at the station.",
              address: "Station road 12",
              ward: "Vashi",
              city: "Mumbai",
              categoryId: cat.id,
              images: ["data:image/png;base64,PHNjcmlwdD4="],
            },
          })
        ).status,
        400,
      );
    });
    await t.test("citizen reports with evidence and department routing", async () => {
      const r = await call("/complaints", {
        method: "POST",
        user: users.citizen,
        body: {
          title: "Broken road outside station",
          description: "A deep pothole blocks the crossing at the station.",
          address: "Station road 12",
          ward: "Vashi",
          city: "Mumbai",
          categoryId: cat.id,
          images: [png],
          latitude: 19.077,
          longitude: 72.998,
        },
      });
      assert.equal(r.status, 201);
      id = r.data.id;
      assert.equal(r.data.departmentId, cat.departmentId);
      assert.equal(r.data.images.length, 1);
    });
    await t.test(
      "citizen video evidence persists and supports byte-range playback",
      async () => {
        const clip = await readFile(new URL("./fixtures/video.mp4", import.meta.url));
        const body = {
          title: "Video evidence for a damaged road",
          description:
            "Demonstration upload of a short video accompanying this civic report.",
          address: "Dadar station crossing",
          ward: "Dadar",
          city: "Mumbai",
          categoryId: cat.id,
          images: [png],
          videos: ["data:video/mp4;base64," + clip.toString("base64")],
        };
        const result = await call("/complaints", {
          method: "POST",
          user: users.citizen,
          body,
        });
        assert.equal(result.status, 201);
        assert.equal(result.data.videos.length, 1);
        assert.equal(result.data.videos[0].mimeType, "video/mp4");
        assert.equal(result.data.images.length, 1);
        const video = result.data.videos[0];
        const playback = await fetch(base + video.url, {
          headers: {
            Range: "bytes=0-31",
          },
        });
        assert.equal(playback.status, 206);
        assert.equal(playback.headers.get("content-type"), "video/mp4");
        assert.equal((await playback.arrayBuffer()).byteLength, 32);
        const detail = await call("/complaints/" + result.data.id);
        assert.equal(detail.data.videos[0].id, video.id);
        const invalid = await call("/complaints", {
          method: "POST",
          user: users.citizen,
          body: {
            ...body,
            videos: ["data:video/mp4;base64," + Buffer.alloc(64).toString("base64")],
          },
        });
        assert.equal(invalid.status, 400);
      },
    );
    await t.test("duplicates, filters and support work without a map", async () => {
      const d = await call(
        "/complaints/duplicates?" +
          new URLSearchParams({
            title: "Broken road outside station",
            address: "Station road 12",
            ward: "Vashi",
            city: "Mumbai",
            categoryId: cat.id,
          }),
      );
      assert.ok(
        d.data.some((x) => {
          return x.id === id;
        }),
      );
      assert.equal(
        (
          await call(`/complaints/${id}/support`, {
            method: "POST",
            user: users.other,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call(`/complaints/${id}/support`, {
            method: "POST",
            user: users.other,
          })
        ).data.supportCount,
        1,
      );
      assert.ok(
        (await call("/complaints?q=Broken%20road&city=Mumbai")).data.items.some((x) => {
          return x.id === id;
        }),
      );
    });
    await t.test(
      "only administrators assign officers; work requires an assignee",
      async () => {
        assert.equal(
          (
            await call(`/complaints/${id}/assign`, {
              method: "POST",
              user: users.citizen,
              body: {
                officerId: users.officer.user.id,
                departmentId: cat.departmentId,
              },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await call(`/complaints/${id}/status`, {
              method: "POST",
              user: users.officer,
              body: {
                status: "IN_PROGRESS",
                note: "Starting repairs today",
              },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await call(`/complaints/${id}/assign`, {
              method: "POST",
              user: users.admin,
              body: {
                officerId: users.officer.user.id,
                departmentId: cat.departmentId,
              },
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "resolution requires work, a note and photo; citizen may reopen",
      async () => {
        assert.equal(
          (
            await call(`/complaints/${id}/status`, {
              method: "POST",
              user: users.officer,
              body: {
                status: "RESOLVED",
                note: "Fixed the hole",
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call(`/complaints/${id}/status`, {
              method: "POST",
              user: users.officer,
              body: {
                status: "IN_PROGRESS",
                note: "Repair crew is on site",
              },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(`/complaints/${id}/status`, {
              method: "POST",
              user: users.wrongOfficer,
              body: {
                status: "RESOLVED",
                note: "Road has been resurfaced",
                images: [png],
              },
            })
          ).status,
          403,
        );
        const forged = Buffer.alloc(24);
        forged.write("RIFF");
        forged.writeUInt32LE(16, 4);
        forged.write("WEBP", 8);
        assert.equal(
          (
            await call(`/complaints/${id}/status`, {
              method: "POST",
              user: users.officer,
              body: {
                status: "RESOLVED",
                note: "Attempt with invalid evidence",
                images: ["data:image/webp;base64," + forged.toString("base64")],
              },
            })
          ).status,
          400,
        );
        assert.equal((await call(`/complaints/${id}`)).data.status, "IN_PROGRESS");
        assert.equal((await call(`/complaints/${id}`)).data.images.length, 1);
        assert.equal(
          (
            await call(`/complaints/${id}/status`, {
              method: "POST",
              user: users.officer,
              body: {
                status: "RESOLVED",
                note: "Road has been resurfaced",
                images: [png],
              },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(`/complaints/${id}/feedback`, {
              method: "POST",
              user: users.other,
              body: {
                rating: 2,
                comment: "Needs more work",
                reopen: true,
              },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await call(`/complaints/${id}/feedback`, {
              method: "POST",
              user: users.citizen,
              body: {
                rating: 2,
                comment: "The pothole is still partly open",
                reopen: true,
              },
            })
          ).status,
          200,
        );
        const outsider = (
          await call(`/complaints/${id}`, {
            user: users.other,
          })
        ).data;
        assert.ok(
          !JSON.stringify(outsider).includes("The pothole is still partly open"),
        );
        assert.ok(
          !JSON.stringify((await call(`/complaints/${id}`)).data).includes(
            "The pothole is still partly open",
          ),
        );
        const c = (
          await call(`/complaints/${id}`, {
            user: users.citizen,
          })
        ).data;
        assert.equal(c.status, "REOPENED");
        assert.ok(c.history.length >= 5);
        assert.equal(c.feedback.length, 1);
        assert.equal(
          c.images.filter((x) => {
            return x.kind === "RESOLUTION";
          }).length,
          1,
        );
      },
    );
    await t.test(
      "reopened reports can be repaired again and confirmed closed",
      async () => {
        assert.equal(
          (
            await call(`/complaints/${id}/status`, {
              method: "POST",
              user: users.officer,
              body: {
                status: "IN_PROGRESS",
                note: "Inspecting the remaining damage",
              },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(`/complaints/${id}/status`, {
              method: "POST",
              user: users.officer,
              body: {
                status: "RESOLVED",
                note: "Remaining damage has been fixed",
                images: [png],
              },
            })
          ).status,
          200,
        );
        const closed = await call(`/complaints/${id}/feedback`, {
          method: "POST",
          user: users.citizen,
          body: {
            rating: 5,
            comment: "Repair is now complete",
            reopen: false,
          },
        });
        assert.equal(closed.status, 200);
        assert.equal(closed.data.status, "CLOSED");
        assert.equal(closed.data.feedback.length, 2);
      },
    );
    await t.test("notifications are private and can be read", async () => {
      const n = (
        await call("/notifications", {
          user: users.citizen,
        })
      ).data;
      assert.ok(n.length > 0);
      assert.equal(
        (
          await call("/notifications/read", {
            method: "POST",
            user: users.citizen,
            body: {},
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call("/notifications", {
            user: users.citizen,
          })
        ).data.filter((n) => {
          return !n.readAt;
        }).length,
        0,
      );
    });
    await t.test(
      "escalation is idempotent and analytics reflect actual records",
      async () => {
        const a = await call("/admin/escalate", {
          method: "POST",
          user: users.admin,
          body: {},
        });
        assert.equal(a.status, 200);
        assert.ok(a.data.count > 0);
        assert.equal(
          (
            await call("/admin/escalate", {
              method: "POST",
              user: users.admin,
              body: {},
            })
          ).data.count,
          0,
        );
        const stats = (
          await call("/analytics", {
            user: users.admin,
          })
        ).data;
        assert.ok(stats.total > 0);
        assert.ok(stats.categories.length > 0);
      },
    );
    await t.test("admin creates staff/departments and logs out securely", async () => {
      const d = await call("/admin/departments", {
        method: "POST",
        user: users.admin,
        body: {
          name: "Test Department",
          description: "Testing municipal services",
        },
      });
      assert.equal(d.status, 201);
      const u = await call("/admin/users", {
        method: "POST",
        user: users.admin,
        body: {
          name: "New Officer",
          email: "newstaff@example.com",
          password: "StaffPassword!42",
          role: "OFFICER",
          departmentId: d.data.id,
        },
      });
      assert.equal(u.status, 201);
      assert.equal(u.data.passwordHash, undefined);
      assert.equal(
        (
          await call("/auth/logout", {
            method: "POST",
            user: users.other,
            body: {},
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call("/auth/me", {
            user: users.other,
          })
        ).status,
        401,
      );
    });
  } finally {
    await new Promise((r) => {
      return server.close(r);
    });
    const { db: prisma } = await import("../src/db.js");
    await prisma.$disconnect();
    await rm(db, {
      force: true,
    });
    await rm(process.env.UPLOAD_DIR, {
      recursive: true,
      force: true,
    });
  }
});
