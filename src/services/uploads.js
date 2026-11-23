import {randomBytes} from 'node:crypto';
import {mkdirSync, writeFileSync, unlinkSync, existsSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {validateImageStructure} from './image-structure.js';
import {validateVideoStructure} from './video-structure.js';
import {fail} from './security.js';

export const uploadDir = resolve(process.env.UPLOAD_DIR || 'uploads');

// Ensure upload directory exists
mkdirSync(uploadDir, {recursive: true});

const DATA_URI_REGEX = /^data:([a-zA-Z0-9/+-]+);base64,(.+)$/;

/**
 * Parses a Data URI into a Buffer and MIME type.
 */
export function parseDataUri(uri) {
  if (typeof uri !== 'string') {
    fail(400, 'Invalid upload format: expected data URI string.');
  }
  const match = uri.match(DATA_URI_REGEX);
  if (!match) {
    fail(400, 'Invalid data URI format. Expected data:<mime>;base64,<encoded>');
  }
  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    return {mimeType, buffer};
  } catch {
    fail(400, 'Invalid base64 payload in data URI.');
  }
}

/**
 * Validates and saves an array of image data URIs (max 3 images, 2 MB each, PNG/JPEG/WebP).
 * Returns array of { url, filename, filePath }.
 */
export async function saveImages(imageUris) {
  if (!imageUris || !Array.isArray(imageUris)) return [];
  if (imageUris.length > 3) {
    fail(400, 'Choose up to 3 photos.');
  }

  const saved = [];
  try {
    for (const uri of imageUris) {
      const {mimeType, buffer} = parseDataUri(uri);
      const validated = validateImageStructure(buffer);

      let ext = '.bin';
      if (validated.mime === 'image/png') ext = '.png';
      else if (validated.mime === 'image/jpeg') ext = '.jpg';
      else if (validated.mime === 'image/webp') ext = '.webp';

      const filename = `${randomBytes(16).toString('hex')}${ext}`;
      const filePath = resolve(uploadDir, filename);

      writeFileSync(filePath, buffer);
      saved.push({
        url: `/uploads/${filename}`,
        filename,
        filePath,
        mimeType: validated.mime,
        sizeBytes: buffer.length
      });
    }
    return saved;
  } catch (err) {
    cleanupFiles(saved);
    throw err;
  }
}

/**
 * Validates and saves video data URIs (max 1 video, 10 MB, MP4/WebM).
 * Returns array of { url, filename, filePath, mimeType, sizeBytes }.
 */
export async function saveVideos(videoUris) {
  if (!videoUris || !Array.isArray(videoUris)) return [];
  if (videoUris.length > 1) {
    fail(400, 'Choose one video.');
  }

  const saved = [];
  try {
    for (const uri of videoUris) {
      const {mimeType, buffer} = parseDataUri(uri);
      const validated = validateVideoStructure(buffer);

      let ext = '.bin';
      if (validated.mime === 'video/mp4') ext = '.mp4';
      else if (validated.mime === 'video/webm') ext = '.webm';

      const filename = `${randomBytes(16).toString('hex')}${ext}`;
      const filePath = resolve(uploadDir, filename);

      writeFileSync(filePath, buffer);
      saved.push({
        url: `/uploads/${filename}`,
        filename,
        filePath,
        mimeType: validated.mime,
        sizeBytes: buffer.length
      });
    }
    return saved;
  } catch (err) {
    cleanupFiles(saved);
    throw err;
  }
}

/**
 * Removes saved files on filesystem when a database transaction or operation fails.
 */
export function cleanupFiles(files) {
  if (!files || !Array.isArray(files)) return;
  for (const f of files) {
    try {
      const p = f.filePath || (f.url ? resolve(uploadDir, f.url.replace(/^\/uploads\//, '')) : null);
      if (p && existsSync(p)) {
        unlinkSync(p);
      }
    } catch {
      // Ignore cleanup error
    }
  }
}
