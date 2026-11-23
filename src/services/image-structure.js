import {inflateSync} from 'node:zlib';
import {fail} from './security.js';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_SIG = Buffer.from('RIFF');
const WEBP_SIG = Buffer.from('WEBP');

const MAX_PIXELS = 16_000_000; // 16 megapixels

// CRC32 implementation for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function calculateCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Validates PNG structure, header, chunks, dimensions, animated rejection (acTL),
 * CRC32 checksums, and decompresses IDAT chunks.
 */
function validatePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIG)) {
    fail(400, 'Invalid PNG signature.');
  }

  let offset = 8;
  let hasIHDR = false;
  let hasIEND = false;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idatParts = [];

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      fail(400, 'Malformed PNG: truncated chunk header.');
    }
    const length = buffer.readUInt32BE(offset);
    const typeStr = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;

    if (crcOffset + 4 > buffer.length) {
      fail(400, `Malformed PNG: truncated chunk ${typeStr}.`);
    }

    // CRC covers chunk type + data
    const chunkTypeAndData = buffer.subarray(offset + 4, dataEnd);
    const expectedCrc = buffer.readUInt32BE(crcOffset);
    const actualCrc = calculateCrc32(chunkTypeAndData);
    if (expectedCrc !== actualCrc) {
      fail(400, `Invalid PNG CRC checksum in chunk ${typeStr}.`);
    }

    // Reject animated PNGs
    if (typeStr === 'acTL') {
      fail(400, 'Animated PNG files are not allowed.');
    }

    if (typeStr === 'IHDR') {
      if (hasIHDR) fail(400, 'Duplicate PNG IHDR chunk.');
      if (length !== 13) fail(400, 'Invalid PNG IHDR chunk length.');
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer.readUInt8(dataStart + 8);
      colorType = buffer.readUInt8(dataStart + 9);
      if (width === 0 || height === 0) fail(400, 'Invalid PNG dimensions.');
      if (width * height > MAX_PIXELS) {
        fail(400, `Image dimensions exceed the 16 megapixel limit (${width}x${height}).`);
      }
      hasIHDR = true;
    } else if (typeStr === 'IDAT') {
      if (!hasIHDR) fail(400, 'PNG IDAT chunk before IHDR.');
      idatParts.push(buffer.subarray(dataStart, dataEnd));
    } else if (typeStr === 'IEND') {
      hasIEND = true;
      offset = crcOffset + 4;
      break;
    }

    offset = crcOffset + 4;
  }

  if (!hasIHDR) fail(400, 'Malformed PNG: missing IHDR chunk.');
  if (!hasIEND) fail(400, 'Malformed PNG: missing IEND chunk.');
  if (idatParts.length === 0) fail(400, 'Malformed PNG: missing IDAT image data.');

  // Check decompression
  try {
    const concatenatedIdat = Buffer.concat(idatParts);
    inflateSync(concatenatedIdat);
  } catch (err) {
    fail(400, 'Malformed PNG: failed to decompress image data.');
  }

  return {width, height, mime: 'image/png'};
}

/**
 * Validates JPEG structure, segments (SOF markers), dimensions, megapixel limit.
 */
function validateJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    fail(400, 'Invalid JPEG signature.');
  }

  let offset = 2;
  let hasSof = false;
  let width = 0;
  let height = 0;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      fail(400, 'Malformed JPEG: expected marker byte.');
    }
    // Skip extra 0xff padding bytes
    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset++;
    }
    if (offset >= buffer.length) fail(400, 'Malformed JPEG: unexpected end of markers.');
    const marker = buffer[offset];
    offset++;

    // Standalone markers without length: SOI (0xd8), EOI (0xd9), RST0-7 (0xd0-0xd7)
    if (marker === 0xd9) {
      // EOI
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      continue;
    }

    if (offset + 2 > buffer.length) fail(400, 'Malformed JPEG: truncated segment header.');
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      fail(400, 'Malformed JPEG: invalid segment length.');
    }

    // SOF markers: SOF0 (0xc0) to SOF15 (0xcf) except DHT (0xc4), JPG (0xc8), DAC (0xcc)
    const isSof = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (segmentLength < 8) fail(400, 'Malformed JPEG: SOF segment too short.');
      height = buffer.readUInt16BE(offset + 3);
      width = buffer.readUInt16BE(offset + 5);
      if (width === 0 || height === 0) fail(400, 'Invalid JPEG dimensions.');
      if (width * height > MAX_PIXELS) {
        fail(400, `Image dimensions exceed the 16 megapixel limit (${width}x${height}).`);
      }
      hasSof = true;
      break;
    }

    // SOS (Start of Scan) marker 0xda - after SOS is entropy data
    if (marker === 0xda) {
      break;
    }

    offset += segmentLength;
  }

  if (!hasSof) fail(400, 'Malformed JPEG: missing SOF segment.');
  return {width, height, mime: 'image/jpeg'};
}

/**
 * Validates WebP structure: RIFF container, WEBP fourcc, VP8 / VP8L / VP8X chunks.
 * Rejects animated WebP (ANIM / ANMF or ANIM flag in VP8X).
 */
function validateWebP(buffer) {
  if (buffer.length < 12) fail(400, 'Malformed WebP: truncated header.');
  if (!buffer.subarray(0, 4).equals(RIFF_SIG)) fail(400, 'Invalid WebP: missing RIFF header.');
  if (!buffer.subarray(8, 12).equals(WEBP_SIG)) fail(400, 'Invalid WebP: missing WEBP signature.');

  let offset = 12;
  let hasImageChunk = false;
  let width = 0;
  let height = 0;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) fail(400, 'Malformed WebP: truncated chunk header.');
    const chunkHeader = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;

    // Reject animation chunks
    if (chunkHeader === 'ANIM' || chunkHeader === 'ANMF') {
      fail(400, 'Animated WebP files are not allowed.');
    }

    if (chunkHeader === 'VP8 ') {
      // Lossy format: requires at least 10 bytes for keyframe header
      if (chunkSize < 10 || dataStart + 10 > buffer.length) {
        fail(400, 'Malformed WebP VP8 data.');
      }
      // Check 3-byte start code 0x9d 0x01 0x2a
      if (buffer[dataStart + 3] !== 0x9d || buffer[dataStart + 4] !== 0x01 || buffer[dataStart + 5] !== 0x2a) {
        fail(400, 'Malformed WebP VP8 keyframe start code.');
      }
      const rawWidth = buffer.readUInt16LE(dataStart + 6);
      const rawHeight = buffer.readUInt16LE(dataStart + 8);
      width = rawWidth & 0x3fff;
      height = rawHeight & 0x3fff;
      if (width === 0 || height === 0) fail(400, 'Invalid WebP dimensions.');
      if (width * height > MAX_PIXELS) {
        fail(400, `Image dimensions exceed the 16 megapixel limit (${width}x${height}).`);
      }
      hasImageChunk = true;
    } else if (chunkHeader === 'VP8L') {
      // Lossless format: 1 byte signature 0x2f, then 4 bytes of bitstream for dimensions
      if (chunkSize < 5 || dataStart + 5 > buffer.length) {
        fail(400, 'Malformed WebP VP8L data.');
      }
      if (buffer[dataStart] !== 0x2f) {
        fail(400, 'Malformed WebP VP8L signature byte.');
      }
      const b1 = buffer[dataStart + 1];
      const b2 = buffer[dataStart + 2];
      const b3 = buffer[dataStart + 3];
      const b4 = buffer[dataStart + 4];
      width = 1 + (((b2 & 0x3f) << 8) | b1);
      height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      if (width * height > MAX_PIXELS) {
        fail(400, `Image dimensions exceed the 16 megapixel limit (${width}x${height}).`);
      }
      hasImageChunk = true;
    } else if (chunkHeader === 'VP8X') {
      // Extended format: 10 bytes payload
      if (chunkSize < 10 || dataStart + 10 > buffer.length) {
        fail(400, 'Malformed WebP VP8X chunk.');
      }
      const flags = buffer[dataStart];
      // Bit 1 (0x02) indicates Animation
      if (flags & 0x02) {
        fail(400, 'Animated WebP files are not allowed.');
      }
      const widthMinus1 = buffer.readUIntLE(dataStart + 4, 3);
      const heightMinus1 = buffer.readUIntLE(dataStart + 7, 3);
      width = widthMinus1 + 1;
      height = heightMinus1 + 1;
      if (width * height > MAX_PIXELS) {
        fail(400, `Image dimensions exceed the 16 megapixel limit (${width}x${height}).`);
      }
      hasImageChunk = true;
    }

    // WebP chunks are padded to even sizes
    const paddedSize = chunkSize + (chunkSize & 1);
    offset = dataStart + paddedSize;
  }

  if (!hasImageChunk) fail(400, 'Malformed WebP: missing image data chunk.');
  return {width, height, mime: 'image/webp'};
}

/**
 * Validates image structure. Detects type (PNG, JPEG, WebP).
 * Explicitly rejects SVG, HTML, animated formats, oversized files (> 2 MB), and > 16 megapixels.
 */
export function validateImageStructure(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    fail(400, 'Invalid image buffer.');
  }

  if (buffer.length > 2 * 1024 * 1024) {
    fail(400, 'Each photo must be under 2 MB.');
  }

  // Quick check for SVG or text/HTML
  const head = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trim().toLowerCase();
  if (head.includes('<svg') || head.includes('<?xml') || head.includes('<html') || head.includes('<!doctype')) {
    fail(400, 'SVG and HTML image formats are not allowed.');
  }

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIG)) {
    return validatePng(buffer);
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return validateJpeg(buffer);
  }

  if (buffer.length >= 12 && buffer.subarray(0, 4).equals(RIFF_SIG) && buffer.subarray(8, 12).equals(WEBP_SIG)) {
    return validateWebP(buffer);
  }

  fail(400, 'Unsupported image format. Only PNG, JPEG, and WebP are allowed.');
}
