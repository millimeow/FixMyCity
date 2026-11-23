import { EventEmitter } from "node:events";
import { db } from "../db.js";
import { fail, text, safeUser } from "./security.js";
import { validateImages, validateVideos, saveImages, removeImages } from "./uploads.js";
export const events = new EventEmitter();
events.on("complaint:changed", (id) => {
  if (process.env.NODE_ENV !== "test") {
    console.info(`Complaint updated: ${id}`);
  }
});
export const statuses = [
  "SUBMITTED",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
];
export const include = {
  category: true,
  department: true,
  officer: {
    select: {
      id: true,
      name: true,
    },
  },
  images: true,
  videos: true,
  _count: {
    select: {
      supports: true,
    },
  },
  history: {
    include: {
      actor: {
        select: {
          name: true,
          role: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  },
  feedback: {
    orderBy: {
      createdAt: "desc",
    },
  },
};

export function present(complaint, user) {
  const out = {
    ...complaint,
    supportCount: complaint._count.supports,
    isOwner: complaint.citizenId === user?.id,
  };
  delete out.citizenId;
  delete out._count;
  if (!out.isOwner && !["ADMIN", "OFFICER"].includes(user?.role)) {
    out.feedback = [];
    out.history = out.history.map((h) => {
      if (
        h.actorId === complaint.citizenId &&
        ["CLOSED", "REOPENED"].includes(h.status)
      ) {
        return {
          ...h,
          note:
            h.status === "REOPENED"
              ? "Citizen requested further work."
              : "Citizen confirmed the resolution.",
        };
      } else {
        return h;
      }
    });
  }
  return out;
}

export async function getComplaint(id) {
  const complaint = await db.complaint.findUnique({
    where: {
      id,
    },
    include,
  });
  if (!complaint) {
    fail(404, "Complaint not found.");
  }
  return complaint;
}

async function notify(transaction, complaint, message) {
  const supporters = await transaction.support.findMany({
    where: {
      complaintId: complaint.id,
    },
    select: {
      userId: true,
    },
  });
  const recipients = new Set(
    [
      complaint.citizenId,
      complaint.officerId,
      ...supporters.map((s) => {
        return s.userId;
      }),
    ].filter(Boolean),
  );
  await transaction.notification.createMany({
    data: [...recipients].map((userId) => {
      return {
        userId,
        complaintId: complaint.id,
        message,
      };
    }),
  });
}

export async function createComplaint(body, user) {
  const categoryId = text(body.categoryId, "Category", 1, 100);
  const category = await db.category.findUnique({
    where: {
      id: categoryId,
    },
  });
  if (!category) {
    fail(400, "Select a valid category.");
  }
  const city = text(body.city ?? "Mumbai", "City", 3, 40);
  if (city !== "Mumbai") {
    fail(400, "Reports are currently accepted for Mumbai only.");
  }
  const priority = body.priority || "NORMAL";
  if (!["NORMAL", "URGENT"].includes(priority)) {
    fail(400, "Invalid priority.");
  }
  const data = {
    title: text(body.title, "Title", 8, 120),
    description: text(body.description, "Description", 20, 3000),
    address: text(body.address, "Address", 8, 240),
    ward: text(body.ward, "Ward or locality", 2, 80),
    city,
    priority,
    categoryId,
    departmentId: category.departmentId,
    citizenId: user.id,
    dueAt: new Date(Date.now() + (priority === "URGENT" ? 24 : 72) * 3600000),
  };
  const hasLat =
    body.latitude !== undefined && body.latitude !== null && body.latitude !== "";
  const hasLng =
    body.longitude !== undefined && body.longitude !== null && body.longitude !== "";
  if (hasLat !== hasLng) {
    fail(400, "Provide both latitude and longitude or neither.");
  }
  if (hasLat) {
    data.latitude = Number(body.latitude);
    data.longitude = Number(body.longitude);
    if (
      !Number.isFinite(data.latitude) ||
      !Number.isFinite(data.longitude) ||
      Math.abs(data.latitude) > 90 ||
      Math.abs(data.longitude) > 180
    ) {
      fail(400, "Coordinates are invalid.");
    }
  }
  const validated = validateImages(body.images),
    videos = validateVideos(body.videos);
  const paths = await saveImages([...validated, ...videos]);
  const photoPaths = paths.slice(0, validated.length),
    videoPaths = paths.slice(validated.length);
  try {
    const complaint = await db.$transaction(async (transaction) => {
      const c = await transaction.complaint.create({
        data: {
          ...data,
          images: {
            create: photoPaths.map((url) => {
              return {
                url,
              };
            }),
          },
          videos: {
            create: videoPaths.map((url, i) => {
              return {
                url,
                mimeType: videos[i].mimeType,
                sizeBytes: videos[i].sizeBytes,
              };
            }),
          },
          history: {
            create: {
              actorId: user.id,
              status: "SUBMITTED",
              note: `Reported and routed to ${
                category.departmentId
                  ? (
                      await transaction.department.findUnique({
                        where: {
                          id: category.departmentId,
                        },
                      })
                    ).name
                  : "department"
              }.`,
            },
          },
        },
      });
      await notify(transaction, c, `Your report “${c.title}” has been received.`);
      const admins = await transaction.user.findMany({
        where: {
          role: "ADMIN",
        },
        select: {
          id: true,
        },
      });
      await transaction.notification.createMany({
        data: admins.map((a) => {
          return {
            userId: a.id,
            complaintId: c.id,
            message: `New report: ${c.title}`,
          };
        }),
      });
      return c;
    });
    events.emit("complaint:changed", complaint.id);
    return present(await getComplaint(complaint.id), user);
  } catch (e) {
    await removeImages(paths);
    throw e;
  }
}

export async function assignComplaint(id, body, user) {
  const departmentId = text(body.departmentId, "Department", 1, 100);
  const department = await db.department.findUnique({
    where: {
      id: departmentId,
    },
  });
  if (!department) {
    fail(400, "Department does not exist.");
  }
  const officerId = body.officerId || null;
  const officer = officerId
    ? await db.user.findUnique({
        where: {
          id: officerId,
        },
      })
    : null;
  if (
    officerId &&
    (!officer || officer.role !== "OFFICER" || officer.departmentId !== departmentId)
  ) {
    fail(400, "Choose an officer in the selected department.");
  }
  await db.$transaction(async (transaction) => {
    const complaint = await transaction.complaint.findUnique({
      where: {
        id,
      },
    });
    if (!complaint) {
      fail(404, "Complaint not found.");
    }
    if (["CLOSED", "RESOLVED"].includes(complaint.status)) {
      fail(409, "Reopen the complaint before reassigning.");
    }
    const updated = await transaction.complaint.update({
      where: {
        id,
      },
      data: {
        departmentId,
        officerId,
        status: officerId ? "ASSIGNED" : "SUBMITTED",
        history: {
          create: {
            actorId: user.id,
            status: officerId ? "ASSIGNED" : "SUBMITTED",
            note: `Assigned to ${department.name}${officer ? " · " + officer.name : ""}.`,
          },
        },
      },
    });
    await notify(transaction, updated, `Assignment updated for “${complaint.title}”.`);
  });
  return present(await getComplaint(id), user);
}

export async function updateStatus(id, body, user) {
  const note = text(body.note, "Progress note", 5, 1000);
  const status = body.status;
  const allowed = {
    ASSIGNED: ["IN_PROGRESS"],
    REOPENED: ["IN_PROGRESS"],
    IN_PROGRESS: ["RESOLVED"],
  };
  const validated = validateImages(body.images);
  let paths = [];
  try {
    paths = await saveImages(validated);
    await db.$transaction(async (transaction) => {
      const complaint = await transaction.complaint.findUnique({
        where: {
          id,
        },
      });
      if (!complaint) {
        fail(404, "Complaint not found.");
      }
      if (
        user.role === "OFFICER" &&
        (complaint.officerId !== user.id ||
          complaint.departmentId !== user.departmentId)
      ) {
        fail(403, "This complaint is not assigned to you.");
      }
      if (!complaint.officerId) {
        fail(400, "Assign an officer before starting work.");
      }
      if (!allowed[complaint.status]?.includes(status)) {
        fail(400, "This status transition is not allowed.");
      }
      if (status === "RESOLVED" && !paths.length) {
        fail(400, "Upload a resolution photograph before resolving.");
      }
      const updated = await transaction.complaint.update({
        where: {
          id,
        },
        data: {
          status,
          resolvedAt: status === "RESOLVED" ? new Date() : null,
          images: {
            create: paths.map((url) => {
              return {
                url,
                kind: "RESOLUTION",
              };
            }),
          },
          history: {
            create: {
              actorId: user.id,
              status,
              note,
            },
          },
        },
      });
      await notify(
        transaction,
        updated,
        `“${complaint.title}” is now ${status.toLowerCase().replaceAll("_", " ")}.`,
      );
    });
    return present(await getComplaint(id), user);
  } catch (e) {
    await removeImages(paths);
    throw e;
  }
}

export async function feedback(id, body, user) {
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fail(400, "Choose a rating from 1 to 5.");
  }
  const comment = text(body.comment, "Feedback", 5, 1000);
  if (body.reopen !== undefined && typeof body.reopen !== "boolean") {
    fail(400, "Invalid reopen choice.");
  }
  const reopen = body.reopen === true;
  await db.$transaction(async (transaction) => {
    const complaint = await transaction.complaint.findUnique({
      where: {
        id,
      },
    });
    if (!complaint) {
      fail(404, "Complaint not found.");
    }
    if (complaint.citizenId !== user.id) {
      fail(403, "Only the reporting citizen can give resolution feedback.");
    }
    if (complaint.status !== "RESOLVED") {
      fail(409, "Feedback is available after an officer resolves this report.");
    }
    const status = reopen ? "REOPENED" : "CLOSED";
    const updated = await transaction.complaint.update({
      where: {
        id,
      },
      data: {
        status,
        ...(reopen
          ? {
              dueAt: new Date(Date.now() + 72 * 3600000),
              resolvedAt: null,
              escalatedAt: null,
            }
          : {}),
        feedback: {
          create: {
            userId: user.id,
            rating,
            comment,
            reopened: reopen,
          },
        },
        history: {
          create: {
            actorId: user.id,
            status,
            note: reopen
              ? "Citizen requested further work."
              : "Citizen confirmed the resolution.",
          },
        },
      },
    });
    await notify(
      transaction,
      updated,
      `Citizen ${reopen ? "reopened" : "confirmed resolution of"} “${complaint.title}”.`,
    );
  });
  return present(await getComplaint(id), user);
}

export async function escalate() {
  return db.$transaction(async (transaction) => {
    const complaints = await transaction.complaint.findMany({
      where: {
        dueAt: {
          lt: new Date(),
        },
        escalatedAt: null,
        status: {
          notIn: ["RESOLVED", "CLOSED"],
        },
      },
    });
    const admins = await transaction.user.findMany({
      where: {
        role: "ADMIN",
      },
      select: {
        id: true,
      },
    });
    for (const complaint of complaints) {
      const changed = await transaction.complaint.updateMany({
        where: {
          id: complaint.id,
          escalatedAt: null,
        },
        data: {
          escalatedAt: new Date(),
        },
      });
      if (!changed.count) {
        continue;
      }
      await transaction.history.create({
        data: {
          complaintId: complaint.id,
          status: complaint.status,
          note: "Resolution deadline exceeded. Escalated to municipal administration.",
        },
      });
      await notify(
        transaction,
        complaint,
        `“${complaint.title}” is overdue and has been escalated.`,
      );
      await transaction.notification.createMany({
        data: admins.map((a) => {
          return {
            userId: a.id,
            complaintId: complaint.id,
            message: `Overdue escalation: ${complaint.title}`,
          };
        }),
      });
    }
    return {
      count: complaints.length,
    };
  });
}

function words(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => {
        return w.length > 2;
      }),
  );
}

function similarity(a, b) {
  const x = words(a),
    y = words(b);
  return (
    [...x].filter((w) => {
      return y.has(w);
    }).length / Math.max(1, new Set([...x, ...y]).size)
  );
}

function meters(a, b, complaint, d) {
  const rad = (n) => {
    return (n * Math.PI) / 180;
  };
  const x =
    Math.sin(rad(complaint - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(complaint)) * Math.sin(rad(d - b) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export async function duplicates(query) {
  const candidates = await db.complaint.findMany({
    where: {
      status: {
        notIn: ["CLOSED", "RESOLVED"],
      },
      ...(query.city
        ? {
            city: String(query.city),
          }
        : {}),
      ...(query.categoryId
        ? {
            categoryId: String(query.categoryId),
          }
        : {}),
    },
    include,
    orderBy: {
      createdAt: "desc",
    },
    take: 300,
  });
  return candidates
    .map((complaint) => {
      const location = similarity(query.address, complaint.address);
      const title = similarity(query.title, complaint.title);
      const sameWard =
        query.ward && query.ward.toLowerCase() === complaint.ward.toLowerCase();
      const distance =
        query.latitude && query.longitude && complaint.latitude !== null
          ? meters(
              Number(query.latitude),
              Number(query.longitude),
              complaint.latitude,
              complaint.longitude,
            )
          : null;
      return {
        ...present(complaint),
        score:
          title * 0.65 +
          location * 0.25 +
          (sameWard ? 0.1 : 0) +
          (distance !== null && distance < 300 ? 0.3 : 0),
        distance: distance === null ? null : Math.round(distance),
      };
    })
    .filter((complaint) => {
      return complaint.score >= 0.28;
    })
    .sort((a, b) => {
      return b.score - a.score;
    })
    .slice(0, 5);
}
