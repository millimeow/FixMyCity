import {db} from '../db.js';
import {fail, text} from './security.js';
import {saveImages, saveVideos, cleanupFiles} from './uploads.js';

export const statuses = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED'];

export const include = {
  category: true,
  department: true,
  officer: true,
  images: true,
  videos: true,
  history: {
    include: {
      actor: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  },
  feedback: {
    orderBy: {
      createdAt: 'desc'
    }
  },
  _count: {
    select: {
      supports: true
    }
  }
};

/**
 * Format a complaint object for API responses.
 * Hides feedback from users who are not the reporting citizen, officer, or admin.
 */
export function present(complaint, user = null) {
  const isOwner = user ? complaint.citizenId === user.id : false;
  const isStaff = user ? ['ADMIN', 'OFFICER'].includes(user.role) : false;
  const canSeeFeedback = isOwner || isStaff;

  return {
    id: complaint.id,
    title: complaint.title,
    description: complaint.description,
    address: complaint.address,
    ward: complaint.ward,
    city: complaint.city,
    latitude: complaint.latitude,
    longitude: complaint.longitude,
    priority: complaint.priority,
    status: complaint.status,
    citizenId: complaint.citizenId,
    categoryId: complaint.categoryId,
    category: complaint.category,
    departmentId: complaint.departmentId,
    department: complaint.department,
    officerId: complaint.officerId,
    officer: complaint.officer
      ? {
          id: complaint.officer.id,
          name: complaint.officer.name,
          email: complaint.officer.email,
          role: complaint.officer.role,
          departmentId: complaint.officer.departmentId
        }
      : null,
    createdAt: complaint.createdAt,
    updatedAt: complaint.updatedAt,
    dueAt: complaint.dueAt,
    resolvedAt: complaint.resolvedAt,
    escalatedAt: complaint.escalatedAt,
    images: complaint.images || [],
    videos: complaint.videos || [],
    history: (complaint.history || []).map(h => ({
      id: h.id,
      complaintId: h.complaintId,
      status: h.status,
      note: h.note,
      createdAt: h.createdAt,
      actor: h.actor
        ? {
            id: h.actor.id,
            name: h.actor.name,
            role: h.actor.role
          }
        : null
    })),
    feedback: canSeeFeedback ? (complaint.feedback || []) : [],
    supportCount: complaint._count ? complaint._count.supports : 0,
    isOwner
  };
}

/**
 * Fetch a single complaint by id, failing with 404 if not found.
 */
export async function getComplaint(id) {
  if (!id) fail(404, 'Complaint not found.');
  const complaint = await db.complaint.findUnique({
    where: {id: String(id)},
    include
  });
  if (!complaint) fail(404, 'Complaint not found.');
  return complaint;
}

/**
 * Calculate haversine distance in meters between two lat/lon coordinates.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Check for duplicate complaints based on title/address/ward/category and optional coordinates.
 */
export async function duplicates(query = {}) {
  const title = (query.title || '').trim();
  const address = (query.address || '').trim();
  const ward = (query.ward || '').trim();
  const categoryId = query.categoryId ? String(query.categoryId) : null;
  const lat = query.latitude != null && query.latitude !== '' ? parseFloat(query.latitude) : null;
  const lon = query.longitude != null && query.longitude !== '' ? parseFloat(query.longitude) : null;

  const activeComplaints = await db.complaint.findMany({
    where: {
      status: {notIn: ['RESOLVED', 'CLOSED']}
    },
    include: {
      category: true
    },
    take: 50
  });

  const matches = [];

  for (const c of activeComplaints) {
    let score = 0;
    let dist = null;

    if (lat != null && lon != null && c.latitude != null && c.longitude != null) {
      dist = haversineDistance(lat, lon, c.latitude, c.longitude);
      if (dist <= 300) {
        score += 3;
      }
    }

    if (categoryId && c.categoryId === categoryId) {
      score += 1;
    }

    if (ward && c.ward.toLowerCase() === ward.toLowerCase()) {
      score += 1;
    }

    const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const cTitleWords = c.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const commonTitleWords = titleWords.filter(w => cTitleWords.includes(w));
    if (commonTitleWords.length > 0) {
      score += 2;
    }

    const addrWords = address.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const cAddrWords = c.address.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const commonAddr = addrWords.filter(w => cAddrWords.includes(w));
    if (commonAddr.length > 0) {
      score += 1;
    }

    if (score >= 2) {
      matches.push({
        id: c.id,
        title: c.title,
        ward: c.ward,
        distance: dist,
        score
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 5);
}

/**
 * Citizen creates a new complaint.
 */
export async function createComplaint(body, user) {
  if (!user || user.role !== 'CITIZEN') {
    fail(403, 'Your account cannot perform this action.');
  }

  const title = text(body.title, 'Title', 8, 120);
  const description = text(body.description, 'Description', 20, 3000);
  const ward = text(body.ward, 'Ward', 2, 80);
  const address = text(body.address, 'Address', 8, 240);
  const city = (body.city || 'Mumbai').trim();

  if (city !== 'Mumbai') {
    fail(400, 'Complaints are currently only accepted for Mumbai.');
  }

  const categoryId = String(body.categoryId || '');
  const category = await db.category.findUnique({
    where: {id: categoryId},
    include: {department: true}
  });
  if (!category) fail(400, 'Invalid category selected.');

  const priority = ['NORMAL', 'URGENT'].includes(body.priority) ? body.priority : 'NORMAL';
  const hours = priority === 'URGENT' ? 24 : 72;
  const now = new Date();
  const dueAt = new Date(now.getTime() + hours * 3600000);

  const lat = body.latitude != null && body.latitude !== '' ? parseFloat(body.latitude) : null;
  const lon = body.longitude != null && body.longitude !== '' ? parseFloat(body.longitude) : null;

  // Process media uploads before transaction
  const savedImages = await saveImages(body.images);
  const savedVideos = await saveVideos(body.videos);

  try {
    const result = await db.$transaction(async tx => {
      const complaint = await tx.complaint.create({
        data: {
          title,
          description,
          address,
          ward,
          city,
          latitude: lat,
          longitude: lon,
          priority,
          status: 'SUBMITTED',
          citizenId: user.id,
          categoryId: category.id,
          departmentId: category.departmentId,
          dueAt,
          history: {
            create: {
              status: 'SUBMITTED',
              note: 'Report received and automatically routed to the relevant department.',
              actorId: user.id
            }
          },
          images: {
            create: savedImages.map(img => ({
              url: img.url,
              kind: 'REPORT'
            }))
          },
          videos: {
            create: savedVideos.map(vid => ({
              url: vid.url,
              mimeType: vid.mimeType,
              sizeBytes: vid.sizeBytes
            }))
          }
        },
        include
      });

      // Notify admins
      const admins = await tx.user.findMany({where: {role: 'ADMIN'}});
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map(admin => ({
            userId: admin.id,
            complaintId: complaint.id,
            message: `New report awaiting assignment: ${complaint.title}.`
          }))
        });
      }

      return complaint;
    });

    return present(result, user);
  } catch (err) {
    cleanupFiles([...savedImages, ...savedVideos]);
    throw err;
  }
}

/**
 * Admin assigns a complaint to a department and/or officer.
 */
export async function assignComplaint(id, body, user) {
  if (!user || user.role !== 'ADMIN') {
    fail(403, 'Your account cannot perform this action.');
  }

  const complaint = await getComplaint(id);
  if (['RESOLVED', 'CLOSED'].includes(complaint.status)) {
    fail(400, 'Cannot reassign a resolved or closed complaint.');
  }

  const departmentId = String(body.departmentId || complaint.departmentId);
  const department = await db.department.findUnique({where: {id: departmentId}});
  if (!department) fail(400, 'Invalid department selected.');

  let officerId = body.officerId ? String(body.officerId) : null;
  let officer = null;
  if (officerId) {
    officer = await db.user.findUnique({where: {id: officerId}});
    if (!officer || officer.role !== 'OFFICER' || officer.departmentId !== departmentId) {
      fail(400, 'Officer does not exist or does not belong to this department.');
    }
  }

  const newStatus = officerId ? 'ASSIGNED' : complaint.status;
  const note = officerId
    ? `Assigned to ${officer.name} (${department.name}).`
    : `Routed to ${department.name}.`;

  const updated = await db.$transaction(async tx => {
    const c = await tx.complaint.update({
      where: {id: complaint.id},
      data: {
        departmentId,
        officerId,
        status: newStatus,
        history: {
          create: {
            status: newStatus,
            note,
            actorId: user.id
          }
        }
      },
      include
    });

    // Notify citizen reporter
    await tx.notification.create({
      data: {
        userId: c.citizenId,
        complaintId: c.id,
        message: `Your report has been assigned to ${officer ? officer.name : department.name}.`
      }
    });

    // Notify assigned officer
    if (officerId) {
      await tx.notification.create({
        data: {
          userId: officerId,
          complaintId: c.id,
          message: `You have been assigned to complaint: ${c.title}.`
        }
      });
    }

    return c;
  });

  return present(updated, user);
}

/**
 * Officer or Admin updates complaint status (IN_PROGRESS, RESOLVED).
 * Resolution requires an assigned officer, note, and at least one resolution photo.
 */
export async function updateStatus(id, body, user) {
  if (!user || !['OFFICER', 'ADMIN'].includes(user.role)) {
    fail(403, 'Your account cannot perform this action.');
  }

  const complaint = await getComplaint(id);

  if (user.role === 'OFFICER' && complaint.officerId !== user.id) {
    fail(403, 'You can only update complaints assigned to you.');
  }

  const targetStatus = body.status;
  if (!['IN_PROGRESS', 'RESOLVED'].includes(targetStatus)) {
    fail(400, 'Invalid status transition.');
  }

  // Legal transitions:
  // ASSIGNED -> IN_PROGRESS
  // REOPENED -> IN_PROGRESS
  // IN_PROGRESS -> RESOLVED
  if (targetStatus === 'IN_PROGRESS' && !['ASSIGNED', 'REOPENED', 'IN_PROGRESS'].includes(complaint.status)) {
    fail(400, `Cannot move to IN_PROGRESS from ${complaint.status}.`);
  }
  if (targetStatus === 'RESOLVED' && complaint.status !== 'IN_PROGRESS') {
    fail(400, `Cannot move to RESOLVED from ${complaint.status}. Must be IN_PROGRESS first.`);
  }

  const note = text(body.note, 'Progress note', 5, 1000);

  let savedImages = [];
  if (targetStatus === 'RESOLVED') {
    if (!complaint.officerId && !user.id) {
      fail(400, 'Resolution requires an assigned officer.');
    }
    if (!body.images || !Array.isArray(body.images) || body.images.length === 0) {
      fail(400, 'Resolution requires at least one resolution photo.');
    }
    savedImages = await saveImages(body.images);
  } else if (body.images && Array.isArray(body.images) && body.images.length > 0) {
    savedImages = await saveImages(body.images);
  }

  try {
    const updated = await db.$transaction(async tx => {
      const updateData = {
        status: targetStatus,
        history: {
          create: {
            status: targetStatus,
            note,
            actorId: user.id
          }
        }
      };

      if (targetStatus === 'RESOLVED') {
        updateData.resolvedAt = new Date();
      }

      if (savedImages.length > 0) {
        updateData.images = {
          create: savedImages.map(img => ({
            url: img.url,
            kind: targetStatus === 'RESOLVED' ? 'RESOLUTION' : 'EVIDENCE'
          }))
        };
      }

      const c = await tx.complaint.update({
        where: {id: complaint.id},
        data: updateData,
        include
      });

      // Notify citizen reporter
      await tx.notification.create({
        data: {
          userId: c.citizenId,
          complaintId: c.id,
          message: `Your report status changed to ${targetStatus}: ${note}`
        }
      });

      // Notify supporting citizens
      const supports = await tx.support.findMany({
        where: {complaintId: c.id},
        select: {userId: true}
      });
      const supporterIds = supports.map(s => s.userId).filter(uid => uid !== c.citizenId);
      if (supporterIds.length > 0) {
        await tx.notification.createMany({
          data: supporterIds.map(uid => ({
            userId: uid,
            complaintId: c.id,
            message: `Report you supported has been updated to ${targetStatus}: ${note}`
          }))
        });
      }

      return c;
    });

    return present(updated, user);
  } catch (err) {
    cleanupFiles(savedImages);
    throw err;
  }
}

/**
 * Citizen reporter provides feedback on a RESOLVED complaint:
 * Can confirm closure or reopen the complaint (resetting dueAt by 72 hours, setting status REOPENED).
 */
export async function feedback(id, body, user) {
  if (!user || user.role !== 'CITIZEN') {
    fail(403, 'Your account cannot perform this action.');
  }

  const complaint = await getComplaint(id);
  if (complaint.citizenId !== user.id) {
    fail(403, 'Only the citizen who reported this issue can provide feedback.');
  }

  if (complaint.status !== 'RESOLVED') {
    fail(400, 'Feedback can only be provided when the complaint is in RESOLVED status.');
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    fail(400, 'Rating must be an integer between 1 and 5.');
  }

  const comment = text(body.comment, 'Comment', 5, 1000);
  const reopen = Boolean(body.reopen);

  const newStatus = reopen ? 'REOPENED' : 'CLOSED';
  const now = new Date();
  const newDueAt = reopen ? new Date(now.getTime() + 72 * 3600000) : complaint.dueAt;

  const updated = await db.$transaction(async tx => {
    // Record feedback
    await tx.feedback.create({
      data: {
        complaintId: complaint.id,
        userId: user.id,
        rating,
        comment,
        reopened: reopen
      }
    });

    const updateData = {
      status: newStatus,
      history: {
        create: {
          status: newStatus,
          note: reopen
            ? `Citizen requested a further inspection: ${comment}`
            : `Citizen confirmed the fix with rating ${rating}/5: ${comment}`,
          actorId: user.id
        }
      }
    };

    if (reopen) {
      updateData.dueAt = newDueAt;
      updateData.escalatedAt = null; // Reopening permits fresh escalation
      updateData.resolvedAt = null;
    }

    const c = await tx.complaint.update({
      where: {id: complaint.id},
      data: updateData,
      include
    });

    // Notify assigned officer
    if (c.officerId) {
      await tx.notification.create({
        data: {
          userId: c.officerId,
          complaintId: c.id,
          message: reopen
            ? `Complaint has been reopened by citizen: ${comment}`
            : `Citizen confirmed the fix for ${c.title}.`
        }
      });
    }

    return c;
  });

  return present(updated, user);
}

/**
 * Escalates overdue active complaints (not RESOLVED or CLOSED, dueAt < now, and escalatedAt is null).
 * Runs on server startup and every minute, or manually triggered by admin.
 */
export async function escalate() {
  const now = new Date();
  const overdue = await db.complaint.findMany({
    where: {
      dueAt: {lt: now},
      status: {notIn: ['RESOLVED', 'CLOSED']},
      escalatedAt: null
    },
    include: {
      department: true
    }
  });

  if (overdue.length === 0) {
    return {count: 0};
  }

  const admins = await db.user.findMany({where: {role: 'ADMIN'}});

  for (const c of overdue) {
    await db.$transaction(async tx => {
      await tx.complaint.update({
        where: {id: c.id},
        data: {
          escalatedAt: now,
          history: {
            create: {
              status: c.status,
              note: `Automated SLA escalation: complaint exceeded deadline (${c.dueAt.toISOString()}).`,
              actorId: null
            }
          }
        }
      });

      // Notify admins
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map(a => ({
            userId: a.id,
            complaintId: c.id,
            message: `Overdue report escalated: ${c.title} (${c.department.name}).`
          }))
        });
      }

      // Notify assigned officer if any
      if (c.officerId) {
        await tx.notification.create({
          data: {
            userId: c.officerId,
            complaintId: c.id,
            message: `Escalation notice: assigned complaint is overdue: ${c.title}.`
          }
        });
      }
    });
  }

  return {count: overdue.length};
}
