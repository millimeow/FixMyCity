import test, {before, after, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {rmSync, mkdirSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {deflateSync} from 'node:zlib';
import {execSync} from 'node:child_process';

const testDbPath = resolve('prisma/test.db');
const testUploadDirPath = resolve('tests/uploads');

// Set environment before loading application and database modules
process.env.DATABASE_URL = `file:${testDbPath}`;
process.env.UPLOAD_DIR = testUploadDirPath;

const {createApp} = await import('../src/app.js');
const {db} = await import('../src/db.js');
const {hashPassword} = await import('../src/services/security.js');
const {escalate} = await import('../src/services/complaints.js');

let server;
let baseUrl;

// Helpers to generate valid test media
function makeTestPng(w = 10, h = 10) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(2, 9); // RGB
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const typeAndData = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    let c = 0xffffffff;
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let v = n;
      for (let k = 0; k < 8; k++) v = (v & 1) ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
      table[n] = v >>> 0;
    }
    for (let i = 0; i < typeAndData.length; i++) c = table[(c ^ typeAndData[i]) & 0xff] ^ (c >>> 8);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const rawRow = Buffer.alloc(1 + w * 3);
  const rawData = Buffer.concat(Array(h).fill(rawRow));
  const compressed = deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function makeTestJpeg(w = 10, h = 10) {
  const soi = Buffer.from([0xff, 0xd8]);
  // SOF0 marker: 0xff, 0xc0, length: 2 + 6 = 8 bytes
  const sof0 = Buffer.alloc(10);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(8, 2); // length
  sof0[4] = 8; // precision
  sof0.writeUInt16BE(h, 5); // height
  sof0.writeUInt16BE(w, 7); // width
  sof0[9] = 3; // 3 components

  const eoi = Buffer.from([0xff, 0xd9]);
  return Buffer.concat([soi, sof0, eoi]);
}

function makeTestMp4() {
  const ftypPayload = Buffer.from('isom\x00\x00\x02\x00isomiso2mp41');
  const ftypBox = Buffer.alloc(8 + ftypPayload.length);
  ftypBox.writeUInt32BE(ftypBox.length, 0);
  ftypBox.write('ftyp', 4, 'ascii');
  ftypPayload.copy(ftypBox, 8);

  const trakBox = Buffer.alloc(8);
  trakBox.writeUInt32BE(8, 0);
  trakBox.write('trak', 4, 'ascii');

  const moovBox = Buffer.alloc(8 + trakBox.length);
  moovBox.writeUInt32BE(moovBox.length, 0);
  moovBox.write('moov', 4, 'ascii');
  trakBox.copy(moovBox, 8);

  const mdatPayload = Buffer.from('videodata');
  const mdatBox = Buffer.alloc(8 + mdatPayload.length);
  mdatBox.writeUInt32BE(mdatBox.length, 0);
  mdatBox.write('mdat', 4, 'ascii');
  mdatPayload.copy(mdatBox, 8);

  return Buffer.concat([ftypBox, moovBox, mdatBox]);
}

function makeTestWebM() {
  function vint(id, isVal = false) {
    if (id === 0x1a45dfa3) return Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
    if (id === 0x18538067) return Buffer.from([0x18, 0x53, 0x80, 0x67]);
    if (id === 0x1654ae6b) return Buffer.from([0x16, 0x54, 0xae, 0x6b]);
    if (id === 0x1f43b675) return Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
    if (id === 0xae) return Buffer.from([0xae]);
    if (id === 0xa3) return Buffer.from([0xa3]);
    if (id < 127) return Buffer.from([0x80 | id]);
    return Buffer.from([0x40, id]);
  }

  const docType = Buffer.concat([Buffer.from([0x42, 0x82]), vint(4), Buffer.from('webm', 'ascii')]);
  const ebmlHeader = Buffer.concat([vint(0x1a45dfa3), vint(docType.length), docType]);
  const trackEntry = Buffer.concat([vint(0xae), vint(2), Buffer.from([0x01, 0x02])]);
  const tracks = Buffer.concat([vint(0x1654ae6b), vint(trackEntry.length), trackEntry]);
  const simpleBlock = Buffer.concat([vint(0xa3), vint(4), Buffer.from([0x01, 0x02, 0x03, 0x04])]);
  const cluster = Buffer.concat([vint(0x1f43b675), vint(simpleBlock.length), simpleBlock]);
  const segPayload = Buffer.concat([tracks, cluster]);
  const segment = Buffer.concat([vint(0x18538067), vint(segPayload.length), segPayload]);

  return Buffer.concat([ebmlHeader, segment]);
}

const toDataUri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;

// HTTP Client helper
class TestClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = null;
    this.csrf = null;
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...(options.headers || {})
    };
    if (this.cookie) {
      headers['cookie'] = this.cookie;
    }
    if (this.csrf && !['GET', 'HEAD', 'OPTIONS'].includes(options.method || 'GET')) {
      headers['x-csrf-token'] = this.csrf;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof Buffer)) {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, {
      ...options,
      headers
    });

    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/fmc_session=[^;]+/);
      if (match) this.cookie = match[0];
    }

    let json = null;
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }

    if (json && json.csrf) {
      this.csrf = json.csrf;
    }

    return {
      status: res.status,
      headers: res.headers,
      body: json
    };
  }
}

describe('FixMyCity Comprehensive Test Suite', () => {
  let dept1, dept2;
  let cat1, cat2;
  let citizenUser, officerUser, otherOfficerUser, adminUser;
  let citizenClient, officerClient, otherOfficerClient, adminClient, anonClient;

  before(async () => {
    // Reset test database and uploads directory
    if (existsSync(testDbPath)) rmSync(testDbPath, {force: true});
    if (existsSync(testUploadDirPath)) rmSync(testUploadDirPath, {recursive: true, force: true});
    mkdirSync(testUploadDirPath, {recursive: true});

    // Deploy prisma migrations to test.db
    execSync('npx prisma migrate deploy', {
      env: {
        ...process.env,
        DATABASE_URL: `file:${testDbPath}`
      },
      stdio: 'pipe'
    });

    await db.$connect();

    // Start Express HTTP Server
    const app = createApp();
    await new Promise(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Seed departments and categories
    dept1 = await db.department.create({
      data: {
        name: 'Roads & Infrastructure',
        description: 'Repairs roads and pavements.'
      }
    });
    dept2 = await db.department.create({
      data: {
        name: 'Solid Waste Management',
        description: 'Cleans streets and collects waste.'
      }
    });

    cat1 = await db.category.create({
      data: {
        name: 'Roads & potholes',
        icon: 'road',
        departmentId: dept1.id
      }
    });
    cat2 = await db.category.create({
      data: {
        name: 'Garbage & cleanliness',
        icon: 'waste',
        departmentId: dept2.id
      }
    });

    // Seed test users
    const pwdHash = await hashPassword('CityDemo!2026');
    citizenUser = await db.user.create({
      data: {
        name: 'Aarav Sharma',
        email: 'citizen@fixmycity.local',
        passwordHash: pwdHash,
        role: 'CITIZEN'
      }
    });
    officerUser = await db.user.create({
      data: {
        name: 'Rohan Patil',
        email: 'officer@fixmycity.local',
        passwordHash: pwdHash,
        role: 'OFFICER',
        departmentId: dept1.id
      }
    });
    otherOfficerUser = await db.user.create({
      data: {
        name: 'Sana Shaikh',
        email: 'officer2@fixmycity.local',
        passwordHash: pwdHash,
        role: 'OFFICER',
        departmentId: dept2.id
      }
    });
    adminUser = await db.user.create({
      data: {
        name: 'Priya Kulkarni',
        email: 'admin@fixmycity.local',
        passwordHash: pwdHash,
        role: 'ADMIN'
      }
    });

    // Initialize authenticated clients
    citizenClient = new TestClient(baseUrl);
    const citLog = await citizenClient.request('/api/auth/login', {
      method: 'POST',
      body: {email: citizenUser.email, password: 'CityDemo!2026'}
    });
    assert.equal(citLog.status, 200);

    officerClient = new TestClient(baseUrl);
    const offLog = await officerClient.request('/api/auth/login', {
      method: 'POST',
      body: {email: officerUser.email, password: 'CityDemo!2026'}
    });
    assert.equal(offLog.status, 200);

    otherOfficerClient = new TestClient(baseUrl);
    const off2Log = await otherOfficerClient.request('/api/auth/login', {
      method: 'POST',
      body: {email: otherOfficerUser.email, password: 'CityDemo!2026'}
    });
    assert.equal(off2Log.status, 200);

    adminClient = new TestClient(baseUrl);
    const admLog = await adminClient.request('/api/auth/login', {
      method: 'POST',
      body: {email: adminUser.email, password: 'CityDemo!2026'}
    });
    assert.equal(admLog.status, 200);

    anonClient = new TestClient(baseUrl);
  });

  after(async () => {
    if (server) {
      await new Promise(res => server.close(res));
    }
    await db.$disconnect();
    // Clean up test database and test uploads
    if (existsSync(testDbPath)) rmSync(testDbPath, {force: true});
    if (existsSync(testUploadDirPath)) rmSync(testUploadDirPath, {recursive: true, force: true});
  });

  it('Health and Meta endpoints return valid data', async () => {
    const health = await anonClient.request('/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, {ok: true});

    const meta = await anonClient.request('/api/meta');
    assert.equal(meta.status, 200);
    assert.equal(meta.body.cities[0], 'Mumbai');
    assert.equal(meta.body.departments.length, 2);
    assert.equal(meta.body.categories.length, 2);
  });

  describe('User Authentication & Permissions', () => {
    it('Citizens can register; staff roles cannot self-register', async () => {
      const regRes = await anonClient.request('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'New Citizen',
          email: 'newcitizen@fixmycity.local',
          password: 'Password12345!'
        }
      });
      assert.equal(regRes.status, 201);
      assert.equal(regRes.body.user.role, 'CITIZEN');

      // Reject duplicate email
      const dupRes = await anonClient.request('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Duplicate Citizen',
          email: 'newcitizen@fixmycity.local',
          password: 'Password12345!'
        }
      });
      assert.equal(dupRes.status, 409);
    });

    it('Only Admin can create staff accounts', async () => {
      const nonAdminRes = await officerClient.request('/api/admin/users', {
        method: 'POST',
        body: {
          name: 'Staff Unauthorized',
          email: 'unauth@fixmycity.local',
          password: 'Password12345!',
          role: 'OFFICER',
          departmentId: dept1.id
        }
      });
      assert.equal(nonAdminRes.status, 403);

      const adminRes = await adminClient.request('/api/admin/users', {
        method: 'POST',
        body: {
          name: 'New Officer',
          email: 'newofficer@fixmycity.local',
          password: 'Password12345!',
          role: 'OFFICER',
          departmentId: dept1.id
        }
      });
      assert.equal(adminRes.status, 201);
      assert.equal(adminRes.body.role, 'OFFICER');
    });
  });

  describe('Complaint Creation & Validation', () => {
    it('Requires citizen role to create complaint', async () => {
      const res = await officerClient.request('/api/complaints', {
        method: 'POST',
        body: {
          title: 'Officer Pothole Report',
          description: 'This is an officer trying to create a complaint.',
          ward: 'Andheri West',
          address: 'SV Road, Andheri West',
          categoryId: cat1.id
        }
      });
      assert.equal(res.status, 403);
    });

    it('Rejects complaints outside Mumbai', async () => {
      const res = await citizenClient.request('/api/complaints', {
        method: 'POST',
        body: {
          title: 'Pune Pothole Report Outside Mumbai',
          description: 'This complaint is located outside the service city.',
          ward: 'Kothrud',
          city: 'Pune',
          address: 'Main Road Pune',
          categoryId: cat1.id
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /Mumbai/);
    });

    it('Creates complaint with valid PNG and MP4 video', async () => {
      const pngData = toDataUri('image/png', makeTestPng(50, 50));
      const mp4Data = toDataUri('video/mp4', makeTestMp4());

      const res = await citizenClient.request('/api/complaints', {
        method: 'POST',
        body: {
          title: 'Massive pothole near Andheri station',
          description: 'A deep pothole at the station crossing is causing vehicles to swerve.',
          ward: 'Andheri West',
          address: 'SV Road, near Andheri railway station',
          categoryId: cat1.id,
          priority: 'URGENT',
          latitude: 19.119,
          longitude: 72.846,
          images: [pngData],
          videos: [mp4Data]
        }
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Massive pothole near Andheri station');
      assert.equal(res.body.status, 'SUBMITTED');
      assert.equal(res.body.priority, 'URGENT');
      assert.equal(res.body.departmentId, dept1.id);
      assert.equal(res.body.images.length, 1);
      assert.equal(res.body.videos.length, 1);
      assert.equal(res.body.videos[0].mimeType, 'video/mp4');

      // Admin should have received a notification for new complaint
      const adminNotifs = await adminClient.request('/api/notifications');
      assert.equal(adminNotifs.status, 200);
      assert(adminNotifs.body.some(n => n.complaintId === res.body.id));
    });

    it('Rejects SVG or HTML image uploads', async () => {
      const svgData = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>').toString('base64')}`;
      const res = await citizenClient.request('/api/complaints', {
        method: 'POST',
        body: {
          title: 'SVG upload attempt report',
          description: 'Testing that SVG formats are strictly rejected by the validator.',
          ward: 'Bandra West',
          address: 'Hill Road, Bandra West',
          categoryId: cat1.id,
          images: [svgData]
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /SVG and HTML image formats are not allowed|Unsupported image format/);
    });

    it('Rejects more than 3 images or more than 1 video', async () => {
      const pngData = toDataUri('image/png', makeTestPng(10, 10));
      const mp4Data = toDataUri('video/mp4', makeTestMp4());

      const resImages = await citizenClient.request('/api/complaints', {
        method: 'POST',
        body: {
          title: 'Four images upload test',
          description: 'Testing that more than three images are rejected properly.',
          ward: 'Dadar West',
          address: 'Ranade Road, Dadar West',
          categoryId: cat1.id,
          images: [pngData, pngData, pngData, pngData]
        }
      });
      assert.equal(resImages.status, 400);

      const resVideos = await citizenClient.request('/api/complaints', {
        method: 'POST',
        body: {
          title: 'Two videos upload test',
          description: 'Testing that more than one video is rejected properly.',
          ward: 'Dadar West',
          address: 'Ranade Road, Dadar West',
          categoryId: cat1.id,
          videos: [mp4Data, mp4Data]
        }
      });
      assert.equal(resVideos.status, 400);
    });

    it('Rejects malformed video or invalid container', async () => {
      const corruptData = `data:video/mp4;base64,${Buffer.from('not an mp4 file content').toString('base64')}`;
      const res = await citizenClient.request('/api/complaints', {
        method: 'POST',
        body: {
          title: 'Corrupt video file report',
          description: 'Testing that invalid video containers are safely rejected.',
          ward: 'Dadar West',
          address: 'Ranade Road, Dadar West',
          categoryId: cat1.id,
          videos: [corruptData]
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /Unsupported video format|Malformed video/);
    });
  });

  describe('Duplicate Detection', () => {
    it('Detects existing complaints based on coordinates and title similarity', async () => {
      const res = await anonClient.request(
        `/api/complaints/duplicates?title=Pothole+near+Andheri+station&ward=Andheri+West&categoryId=${cat1.id}&latitude=19.119&longitude=72.846`
      );
      assert.equal(res.status, 200);
      assert(Array.isArray(res.body));
      assert(res.body.length > 0);
      assert.equal(res.body[0].title, 'Massive pothole near Andheri station');
      assert.equal(res.body[0].distance, 0);
    });
  });

  describe('Workflow: Assignment, Status Updates, Feedback, Reopening', () => {
    let complaintId;

    before(async () => {
      // Create a fresh complaint for the workflow
      const pngData = toDataUri('image/png', makeTestPng(20, 20));
      const res = await citizenClient.request('/api/complaints', {
        method: 'POST',
        body: {
          title: 'Broken pavement on Linking Road',
          description: 'Multiple concrete slabs are damaged causing pedestrians to trip.',
          ward: 'Bandra West',
          address: 'Linking Road, near KFC junction',
          categoryId: cat1.id,
          priority: 'NORMAL',
          images: [pngData]
        }
      });
      assert.equal(res.status, 201);
      complaintId = res.body.id;
    });

    it('Only Admin can assign complaint; rejects assigning officer from different department', async () => {
      // Citizen attempt
      const citAssign = await citizenClient.request(`/api/complaints/${complaintId}/assign`, {
        method: 'POST',
        body: {departmentId: dept1.id, officerId: officerUser.id}
      });
      assert.equal(citAssign.status, 403);

      // Wrong department officer
      const wrongOfficerAssign = await adminClient.request(`/api/complaints/${complaintId}/assign`, {
        method: 'POST',
        body: {departmentId: dept1.id, officerId: otherOfficerUser.id}
      });
      assert.equal(wrongOfficerAssign.status, 400);

      // Successful assign
      const okAssign = await adminClient.request(`/api/complaints/${complaintId}/assign`, {
        method: 'POST',
        body: {departmentId: dept1.id, officerId: officerUser.id}
      });
      assert.equal(okAssign.status, 200);
      assert.equal(okAssign.body.status, 'ASSIGNED');
      assert.equal(okAssign.body.officerId, officerUser.id);

      // Verify officer received notification
      const offNotifs = await officerClient.request('/api/notifications');
      assert(offNotifs.body.some(n => n.complaintId === complaintId));
    });

    it('Another officer cannot update status', async () => {
      const res = await otherOfficerClient.request(`/api/complaints/${complaintId}/status`, {
        method: 'POST',
        body: {
          status: 'IN_PROGRESS',
          note: 'Trying to update an unassigned complaint.'
        }
      });
      assert.equal(res.status, 403);
    });

    it('Assigned officer transitions to IN_PROGRESS', async () => {
      const res = await officerClient.request(`/api/complaints/${complaintId}/status`, {
        method: 'POST',
        body: {
          status: 'IN_PROGRESS',
          note: 'Maintenance team dispatched to inspect damaged pavement.'
        }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'IN_PROGRESS');
    });

    it('Resolution requires a resolution photo', async () => {
      const res = await officerClient.request(`/api/complaints/${complaintId}/status`, {
        method: 'POST',
        body: {
          status: 'RESOLVED',
          note: 'Pavement replaced successfully with new concrete tiles.',
          images: []
        }
      });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /resolution photo/i);
    });

    it('Assigned officer resolves complaint with resolution photo', async () => {
      const resPhoto = toDataUri('image/jpeg', makeTestJpeg(30, 30));
      const res = await officerClient.request(`/api/complaints/${complaintId}/status`, {
        method: 'POST',
        body: {
          status: 'RESOLVED',
          note: 'Pavement replaced and fully cured.',
          images: [resPhoto]
        }
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'RESOLVED');
      assert(res.body.resolvedAt);

      // Citizen should receive update notification
      const citNotifs = await citizenClient.request('/api/notifications');
      assert(citNotifs.body.some(n => n.complaintId === complaintId && n.message.includes('RESOLVED')));
    });

    it('Non-owner cannot give feedback; owner can reopen complaint', async () => {
      // Non-owner citizen
      const otherCitizen = await anonClient.request('/api/auth/register', {
        method: 'POST',
        body: {
          name: 'Another Citizen',
          email: 'citizen2@fixmycity.local',
          password: 'Password12345!'
        }
      });
      const otherCitClient = new TestClient(baseUrl);
      await otherCitClient.request('/api/auth/login', {
        method: 'POST',
        body: {email: 'citizen2@fixmycity.local', password: 'Password12345!'}
      });

      const unauthFeedback = await otherCitClient.request(`/api/complaints/${complaintId}/feedback`, {
        method: 'POST',
        body: {rating: 3, comment: 'I did not report this.'}
      });
      assert.equal(unauthFeedback.status, 403);

      // Owner reopens complaint
      const reopenRes = await citizenClient.request(`/api/complaints/${complaintId}/feedback`, {
        method: 'POST',
        body: {
          rating: 2,
          comment: 'Some tiles are still wobbly and need adjustment.',
          reopen: true
        }
      });
      assert.equal(reopenRes.status, 200);
      assert.equal(reopenRes.body.status, 'REOPENED');

      // Check detail shows updated status and privacy: feedback is only visible to owner/staff
      const anonDetail = await anonClient.request(`/api/complaints/${complaintId}`);
      assert.equal(anonDetail.body.feedback.length, 0);

      const ownerDetail = await citizenClient.request(`/api/complaints/${complaintId}`);
      assert.equal(ownerDetail.body.feedback.length, 1);
    });

    it('Reopened complaint can be put IN_PROGRESS, RESOLVED, and CLOSED', async () => {
      // Move to IN_PROGRESS
      const step1 = await officerClient.request(`/api/complaints/${complaintId}/status`, {
        method: 'POST',
        body: {
          status: 'IN_PROGRESS',
          note: 'Re-inspecting and fixing wobbly tiles.'
        }
      });
      assert.equal(step1.status, 200);
      assert.equal(step1.body.status, 'IN_PROGRESS');

      // Resolve with new photo
      const resPhoto = toDataUri('image/png', makeTestPng(20, 20));
      const step2 = await officerClient.request(`/api/complaints/${complaintId}/status`, {
        method: 'POST',
        body: {
          status: 'RESOLVED',
          note: 'All loose tiles re-grouted and firmly anchored.',
          images: [resPhoto]
        }
      });
      assert.equal(step2.status, 200);
      assert.equal(step2.body.status, 'RESOLVED');

      // Citizen confirms fix and closes
      const step3 = await citizenClient.request(`/api/complaints/${complaintId}/feedback`, {
        method: 'POST',
        body: {
          rating: 5,
          comment: 'Perfect now, thank you for the prompt revisit!',
          reopen: false
        }
      });
      assert.equal(step3.status, 200);
      assert.equal(step3.body.status, 'CLOSED');
    });
  });

  describe('Community Support & Idempotency', () => {
    let supportComplaintId;

    before(async () => {
      const res = await citizenClient.request('/api/complaints', {
        method: 'POST',
        body: {
          title: 'Damaged street corner garbage bin',
          description: 'Garbage bin lid is broken and garbage is spilling onto the street.',
          ward: 'Dadar',
          address: 'Dadar Flower Market entrance',
          categoryId: cat2.id
        }
      });
      supportComplaintId = res.body.id;
    });

    it('Allows citizen to add and remove support idempotently', async () => {
      // Add support
      const add1 = await citizenClient.request(`/api/complaints/${supportComplaintId}/support`, {
        method: 'POST'
      });
      assert.equal(add1.status, 200);
      assert.equal(add1.body.supported, true);
      assert.equal(add1.body.supportCount, 1);

      // Repeated add is idempotent
      const add2 = await citizenClient.request(`/api/complaints/${supportComplaintId}/support`, {
        method: 'POST'
      });
      assert.equal(add2.status, 200);
      assert.equal(add2.body.supported, true);
      assert.equal(add2.body.supportCount, 1);

      // Remove support
      const del = await citizenClient.request(`/api/complaints/${supportComplaintId}/support`, {
        method: 'DELETE'
      });
      assert.equal(del.status, 200);
      assert.equal(del.body.supported, false);
      assert.equal(del.body.supportCount, 0);
    });
  });

  describe('Escalation Service & SLA', () => {
    it('Escalates overdue complaints and notifies admins and officers', async () => {
      // Create a complaint with past dueAt directly in DB
      const pastDue = new Date(Date.now() - 3600000);
      const overdueComplaint = await db.complaint.create({
        data: {
          title: 'Urgent overdue electrical issue',
          description: 'Live wire dangling from post near bus stop.',
          ward: 'Kurla',
          city: 'Mumbai',
          address: 'LBS Marg, Kurla',
          categoryId: cat1.id,
          departmentId: dept1.id,
          citizenId: citizenUser.id,
          officerId: officerUser.id,
          status: 'ASSIGNED',
          priority: 'URGENT',
          dueAt: pastDue
        }
      });

      // Run escalation
      const res = await escalate();
      assert(res.count >= 1);

      // Check complaint now has escalatedAt set
      const reloaded = await db.complaint.findUnique({where: {id: overdueComplaint.id}});
      assert(reloaded.escalatedAt);

      // Running escalate again should be idempotent (count: 0 for this complaint)
      const res2 = await escalate();
      assert.equal(res2.count, 0);
    });
  });

  describe('Analytics & Administration', () => {
    it('Admin and Officer can access analytics', async () => {
      const adminAnalytics = await adminClient.request('/api/analytics');
      assert.equal(adminAnalytics.status, 200);
      assert(adminAnalytics.body.total >= 1);
      assert(Array.isArray(adminAnalytics.body.categories));
      assert(Array.isArray(adminAnalytics.body.departments));

      const officerAnalytics = await officerClient.request('/api/analytics');
      assert.equal(officerAnalytics.status, 200);
    });

    it('Citizens cannot access analytics', async () => {
      const res = await citizenClient.request('/api/analytics');
      assert.equal(res.status, 403);
    });

    it('Admin can trigger manual escalation endpoint', async () => {
      const res = await adminClient.request('/api/admin/escalate', {
        method: 'POST'
      });
      assert.equal(res.status, 200);
      assert('count' in res.body);
    });
  });
});
