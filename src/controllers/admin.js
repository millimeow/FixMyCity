import { db } from "../db.js";
import {
  text,
  email,
  password,
  hashPassword,
  safeUser,
  fail,
} from "../services/security.js";

export async function users(request, response) {
  response.json(
    (
      await db.user.findMany({
        include: {
          department: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      })
    ).map((user) => {
      return {
        ...safeUser(user),
        department: user.department,
      };
    }),
  );
}

export async function createUser(request, response) {
  const body = request.body;
  const role = body.role;
  if (!["OFFICER", "ADMIN"].includes(role)) {
    fail(400, "Staff role must be officer or admin.");
  }
  if (
    role === "OFFICER" &&
    !(await db.department.findUnique({
      where: {
        id: String(body.departmentId || ""),
      },
    }))
  ) {
    fail(400, "Choose a department for this officer.");
  }
  const user = await db.user.create({
    data: {
      name: text(body.name, "Name", 2, 70),
      email: email(body.email),
      passwordHash: await hashPassword(password(body.password)),
      role,
      departmentId: role === "OFFICER" ? body.departmentId : null,
    },
  });
  response.status(201).json(safeUser(user));
}

export async function createDepartment(request, response) {
  response.status(201).json(
    await db.department.create({
      data: {
        name: text(request.body.name, "Department name", 3, 80),
        description: text(request.body.description, "Description", 5, 400),
      },
    }),
  );
}

export async function createCategory(request, response) {
  if (
    !(await db.department.findUnique({
      where: {
        id: String(request.body.departmentId || ""),
      },
    }))
  ) {
    fail(400, "Choose a department.");
  }
  response.status(201).json(
    await db.category.create({
      data: {
        name: text(request.body.name, "Category", 3, 80),
        icon: "general",
        departmentId: request.body.departmentId,
      },
    }),
  );
}

export async function analytics(request, response) {
  const where =
    request.user.role === "OFFICER"
      ? {
          officerId: request.user.id,
        }
      : {};
  const all = await db.complaint.findMany({
    where,
    include: {
      category: true,
      department: true,
      feedback: true,
      _count: {
        select: {
          supports: true,
        },
      },
    },
  });
  const closed = all.filter((complaint) => {
    return ["RESOLVED", "CLOSED"].includes(complaint.status);
  });
  const overdue = all.filter((complaint) => {
    return (
      !["RESOLVED", "CLOSED"].includes(complaint.status) && complaint.dueAt < new Date()
    );
  });
  const group = (key) => {
    return Object.values(
      all.reduce((a, complaint) => {
        const name = complaint[key].name;
        a[name] ||= {
          name,
          total: 0,
          resolved: 0,
        };
        a[name].total++;
        if (["RESOLVED", "CLOSED"].includes(complaint.status)) {
          a[name].resolved++;
        }
        return a;
      }, {}),
    );
  };
  const ratings = all.flatMap((complaint) => {
    return complaint.feedback.map((f) => {
      return f.rating;
    });
  });
  const trend = Array.from(
    {
      length: 6,
    },
    (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 5 + i);
      return {
        month: d.toLocaleString("en-IN", {
          month: "short",
        }),
        total: all.filter((complaint) => {
          return (
            complaint.createdAt.getMonth() === d.getMonth() &&
            complaint.createdAt.getFullYear() === d.getFullYear()
          );
        }).length,
      };
    },
  );
  response.json({
    total: all.length,
    resolved: closed.length,
    active: all.length - closed.length,
    overdue: overdue.length,
    escalated: all.filter((complaint) => {
      return complaint.escalatedAt;
    }).length,
    supports: all.reduce((a, complaint) => {
      return a + complaint._count.supports;
    }, 0),
    averageHours: closed.length
      ? Math.round(
          closed.reduce((a, complaint) => {
            return a + (complaint.resolvedAt - complaint.createdAt) / 3600000;
          }, 0) / closed.length,
        )
      : 0,
    averageRating: ratings.length
      ? Number(
          (
            ratings.reduce((a, body) => {
              return a + body;
            }, 0) / ratings.length
          ).toFixed(1),
        )
      : null,
    categories: group("category"),
    departments: group("department"),
    statuses: await db.complaint.groupBy({
      by: ["status"],
      where,
      _count: {
        _all: true,
      },
    }),
    trend,
  });
}
