import {fail} from './security.js';

const MAX_VIDEO_SIZE = 10 * 1024 * 1024; // 10 MB

// EBML IDs for WebM
const EBML_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const TRACKS_ID = 0x1654ae6b;
const TRACK_ENTRY_ID = 0xae;
const CLUSTER_ID = 0x1f43b675;
const SIMPLE_BLOCK_ID = 0xa3;
const BLOCK_GROUP_ID = 0xa0;

/**
 * Reads variable length integer (VINT) in EBML.
 * Returns { value, length } or null if invalid/truncated.
 */
function readEbmlVint(buffer, offset, isValue = false) {
  if (offset >= buffer.length) return null;
  const firstByte = buffer[offset];
  if (firstByte === 0) return null; // zero mask not allowed in EBML

  let mask = 0x80;
  let len = 1;
  while ((firstByte & mask) === 0 && len <= 8) {
    mask >>= 1;
    len++;
  }
  if (len > 8 || offset + len > buffer.length) return null;

  let val = isValue ? (firstByte & ~mask) : firstByte;
  for (let i = 1; i < len; i++) {
    val = (val * 256) + buffer[offset + i];
  }
  return { value: val, length: len };
}

/**
 * Validates WebM container: EBML header (docType 'webm'), Segment, Tracks, and Samples (SimpleBlock or BlockGroup in Clusters).
 */
function validateWebM(buffer) {
  // Read EBML ID
  if (buffer.length < 4) fail(400, 'Malformed WebM: file too short.');
  const id = buffer.readUInt32BE(0);
  if (id !== EBML_ID) fail(400, 'Invalid WebM header.');

  let offset = 4;
  const ebmlHeaderSize = readEbmlVint(buffer, offset, true);
  if (!ebmlHeaderSize) fail(400, 'Malformed WebM: invalid EBML header size.');
  offset += ebmlHeaderSize.length;

  const ebmlHeaderEnd = offset + ebmlHeaderSize.value;
  if (ebmlHeaderEnd > buffer.length) fail(400, 'Malformed WebM: truncated EBML header.');

  // Check DocType inside EBML header
  const headerBuf = buffer.subarray(offset, ebmlHeaderEnd);
  // Look for docType byte sequence: 0x42 0x82 followed by string
  const docTypeIdx = headerBuf.indexOf(Buffer.from([0x42, 0x82]));
  if (docTypeIdx === -1) fail(400, 'Malformed WebM: missing DocType.');
  const docTypeStr = headerBuf.subarray(docTypeIdx + 2, Math.min(headerBuf.length, docTypeIdx + 12)).toString('ascii');
  if (!docTypeStr.includes('webm')) fail(400, 'Invalid WebM: DocType is not webm.');

  offset = ebmlHeaderEnd;

  let hasSegment = false;
  let hasTracks = false;
  let hasSamples = false;

  while (offset < buffer.length) {
    const elId = readEbmlVint(buffer, offset, false);
    if (!elId) break;
    offset += elId.length;

    const elSize = readEbmlVint(buffer, offset, true);
    if (!elSize) break;
    offset += elSize.length;

    if (elId.value === SEGMENT_ID) {
      hasSegment = true;
      // In WebM, segment usually encompasses the rest of the file or has unknown size
      continue;
    }

    if (elId.value === TRACKS_ID) {
      hasTracks = true;
      // Check for at least one TrackEntry (0xae)
      const trackDataEnd = Math.min(buffer.length, offset + elSize.value);
      const trackBuf = buffer.subarray(offset, trackDataEnd);
      if (trackBuf.indexOf(Buffer.from([TRACK_ENTRY_ID])) !== -1) {
        hasTracks = true;
      }
    }

    if (elId.value === CLUSTER_ID) {
      const clusterEnd = Math.min(buffer.length, offset + elSize.value);
      const clusterBuf = buffer.subarray(offset, clusterEnd);
      // Look for SimpleBlock (0xa3) or Block (0xa1)
      if (clusterBuf.indexOf(Buffer.from([SIMPLE_BLOCK_ID])) !== -1 || clusterBuf.indexOf(Buffer.from([0xa1])) !== -1) {
        hasSamples = true;
      }
    }

    if (hasTracks && hasSamples) break;
    offset += elSize.value;
  }

  if (!hasSegment) fail(400, 'Malformed WebM: missing Segment container.');
  if (!hasTracks) fail(400, 'Malformed WebM: missing Tracks.');
  if (!hasSamples) fail(400, 'Malformed WebM: missing video samples.');

  return { mime: 'video/webm' };
}

/**
 * Validates MP4 / ISO Base Media File Format:
 * Looks for ftyp box with supported brand, moov box with trak box, and mdat box containing sample data.
 */
function validateMp4(buffer) {
  if (buffer.length < 8) fail(400, 'Malformed MP4: file too short.');

  let offset = 0;
  let hasFtyp = false;
  let hasMoov = false;
  let hasTrak = false;
  let hasMdat = false;

  const validBrands = ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV'];

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;
    let boxSize = buffer.readUInt32BE(offset);
    const boxType = buffer.toString('ascii', offset + 4, offset + 8);

    let headerSize = 8;
    if (boxSize === 1) {
      // 64-bit extended size
      if (offset + 16 > buffer.length) fail(400, 'Malformed MP4: truncated extended box header.');
      const high = buffer.readUInt32BE(offset + 8);
      const low = buffer.readUInt32BE(offset + 12);
      boxSize = (high * 0x100000000) + low;
      headerSize = 16;
    } else if (boxSize === 0) {
      // Box extends to end of file
      boxSize = buffer.length - offset;
    }

    if (boxSize < headerSize || offset + boxSize > buffer.length) {
      fail(400, `Malformed MP4: invalid box size for ${boxType}.`);
    }

    const payloadStart = offset + headerSize;
    const payloadEnd = offset + boxSize;

    if (boxType === 'ftyp') {
      hasFtyp = true;
      if (boxSize < 16) fail(400, 'Malformed MP4: ftyp box too small.');
      const majorBrand = buffer.toString('ascii', payloadStart, payloadStart + 4);
      let brandFound = validBrands.includes(majorBrand);
      if (!brandFound) {
        // Check compatible brands
        for (let b = payloadStart + 8; b + 4 <= payloadEnd; b += 4) {
          const compBrand = buffer.toString('ascii', b, b + 4);
          if (validBrands.includes(compBrand)) {
            brandFound = true;
            break;
          }
        }
      }
      if (!brandFound) {
        fail(400, `Unsupported MP4 brand: ${majorBrand}.`);
      }
    } else if (boxType === 'moov') {
      hasMoov = true;
      // Inspect moov for trak box
      const moovBuf = buffer.subarray(payloadStart, payloadEnd);
      let innerOffset = 0;
      while (innerOffset + 8 <= moovBuf.length) {
        const innerSize = moovBuf.readUInt32BE(innerOffset);
        const innerType = moovBuf.toString('ascii', innerOffset + 4, innerOffset + 8);
        if (innerType === 'trak') {
          hasTrak = true;
          break;
        }
        if (innerSize < 8 || innerOffset + innerSize > moovBuf.length) break;
        innerOffset += innerSize;
      }
    } else if (boxType === 'mdat') {
      if (boxSize > headerSize) {
        hasMdat = true;
      }
    }

    offset += boxSize;
  }

  if (!hasFtyp) fail(400, 'Malformed MP4: missing ftyp box.');
  if (!hasMoov) fail(400, 'Malformed MP4: missing moov metadata box.');
  if (!hasTrak) fail(400, 'Malformed MP4: missing trak media track in moov.');
  if (!hasMdat) fail(400, 'Malformed MP4: missing mdat media sample data.');

  return { mime: 'video/mp4' };
}

/**
 * Validates video structure. Detects type (MP4, WebM).
 * Strictly enforces 10 MB limit, valid container, tracks, and media samples.
 */
export function validateVideoStructure(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    fail(400, 'Invalid video buffer.');
  }

  if (buffer.length > MAX_VIDEO_SIZE) {
    fail(400, 'The video must be 10 MB or smaller.');
  }

  if (buffer.length < 16) {
    fail(400, 'Malformed video: file too small.');
  }

  // Check WebM signature (EBML ID: 0x1a45dfa3)
  if (buffer.readUInt32BE(0) === EBML_ID) {
    return validateWebM(buffer);
  }

  // Check MP4 signature (ftyp box at offset 4)
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return validateMp4(buffer);
  }

  fail(400, 'Unsupported video format. Only MP4 and WebM are allowed.');
}
