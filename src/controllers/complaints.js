import { db } from "../db.js";
import * as service from "../services/complaints.js";
import { fail } from "../services/security.js";

export async function list(request, response) {
  const query = request.query;
  const where =
    query.scope === "mine" || query.scope === "assigned"
      ? {}
      : {
          city: "Mumbai",
        };
  if (query.q) {
    where.OR = ["title", "description", "address", "ward"].map((field) => {
      return {
        [field]: {
          contains: String(query.q).slice(0, 120),
        },
      };
    });
  }
  if (query.city) {
    where.city = String(query.city);
  }
  if (query.category) {
    where.categoryId = String(query.category);
  }
  if (query.status) {
    if (!service.statuses.includes(query.status)) {
      fail(400, "Invalid status filter.");
    }
    where.status = query.status;
  }
  if (query.scope === "mine") {
    if (!request.user) {
      fail(401, "Please sign in.");
    }
    where.citizenId = request.user.id;
  }
  if (query.scope === "assigned") {
    if (!request.user || request.user.role === "CITIZEN") {
      fail(403, "Staff access required.");
    }
    if (request.user.role === "OFFICER") {
      where.officerId = request.user.id;
    }
  }
  if (query.overdue === "true") {
    Object.assign(where, {
      dueAt: {
        lt: new Date(),
      },
      status: {
        notIn: ["RESOLVED", "CLOSED"],
      },
    });
  }
  const page = Math.max(1, Math.min(10000, Number(query.page) || 1));
  const [items, total] = await Promise.all([
    db.complaint.findMany({
      where,
      include: service.include,
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
      skip: (page - 1) * 12,
    }),
    db.complaint.count({
      where,
    }),
  ]);
  const supports = request.user
    ? await db.support.findMany({
        where: {
          userId: request.user.id,
        },
        select: {
          complaintId: true,
        },
      })
    : [];
  response.json({
    items: items.map((complaint) => {
      return {
        ...service.present(complaint, request.user),
        supported: supports.some((s) => {
          return s.complaintId === complaint.id;
        }),
      };
    }),
    total,
    page,
    pages: Math.ceil(total / 12),
  });
}

export async function detail(request, response) {
  const complaint = await service.getComplaint(request.params.id);
  const supported = request.user
    ? !!(await db.support.findUnique({
        where: {
          userId_complaintId: {
            userId: request.user.id,
            complaintId: complaint.id,
          },
        },
      }))
    : false;
  response.json({
    ...service.present(complaint, request.user),
    supported,
  });
}

export async function create(request, response) {
  response.status(201).json(await service.createComplaint(request.body, request.user));
}

export async function assign(request, response) {
  response.json(
    await service.assignComplaint(request.params.id, request.body, request.user),
  );
}

export async function status(request, response) {
  response.json(
    await service.updateStatus(request.params.id, request.body, request.user),
  );
}

export async function feedback(request, response) {
  response.json(await service.feedback(request.params.id, request.body, request.user));
}

export async function support(request, response) {
  await service.getComplaint(request.params.id);
  const where = {
    userId_complaintId: {
      userId: request.user.id,
      complaintId: request.params.id,
    },
  };
  if (request.method === "DELETE") {
    await db.support.deleteMany({
      where: where.userId_complaintId,
    });
  } else {
    await db.support.upsert({
      where,
      create: {
        userId: request.user.id,
        complaintId: request.params.id,
      },
      update: {},
    });
  }
  response.json({
    supportCount: await db.support.count({
      where: {
        complaintId: request.params.id,
      },
    }),
    supported: request.method !== "DELETE",
  });
}

export async function duplicates(request, response) {
  response.json(await service.duplicates(request.query));
}
