import { inflateSync } from "node:zlib";
const maxPixels = 16_000_000;

function dimensions(w, h) {
  return w > 0 && h > 0 && w <= 12000 && h <= 12000 && w * h <= maxPixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function png(buffer) {
  if (!buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return false;
  }
  let p = 8,
    header = null,
    end = false;
  const compressed = [];
  let palette = false;
  while (p < buffer.length) {
    if (p + 12 > buffer.length) {
      return false;
    }
    const size = buffer.readUInt32BE(p),
      type = buffer.toString("ascii", p + 4, p + 8);
    if (size > buffer.length - p - 12) {
      return false;
    }
    const chunk = buffer.subarray(p + 8, p + 8 + size);
    if (
      crc32(buffer.subarray(p + 4, p + 8 + size)) !== buffer.readUInt32BE(p + 8 + size)
    ) {
      return false;
    }
    if (!header && type !== "IHDR") {
      return false;
    }
    if (type === "IHDR") {
      if (header || size !== 13) {
        return false;
      }
      header = chunk;
      if (!dimensions(chunk.readUInt32BE(0), chunk.readUInt32BE(4))) {
        return false;
      }
      if (chunk[10] !== 0 || chunk[11] !== 0 || chunk[12] > 1) {
        return false;
      }
    } else if (type === "IDAT") {
      compressed.push(chunk);
    } else if (type === "PLTE") {
      palette = size > 0 && size % 3 === 0 && size <= 768;
    } else if (type === "IEND") {
      if (size !== 0 || p + 12 !== buffer.length) {
        return false;
      }
      end = true;
      break;
    } else if (type === "acTL") {
      return false; // Still photographs only.
    } else if (type[0] === type[0].toUpperCase()) {
      return false;
    }
    p += size + 12;
  }
  if (!header || !end || !compressed.length) {
    return false;
  }
  const depth = header[8],
    color = header[9];
  const depths = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16],
  };
  if (!depths[color]?.includes(depth) || (color === 3 && !palette)) {
    return false;
  }
  const channels = {
      0: 1,
      2: 3,
      3: 1,
      4: 2,
      6: 4,
    }[color],
    w = header.readUInt32BE(0),
    h = header.readUInt32BE(4);
  const passes =
    header[12] === 0
      ? [[0, 0, 1, 1]]
      : [
          [0, 0, 8, 8],
          [4, 0, 8, 8],
          [0, 4, 4, 8],
          [2, 0, 4, 4],
          [0, 2, 2, 4],
          [1, 0, 2, 2],
          [0, 1, 1, 2],
        ];
  const rows = [];
  let expected = 0;
  for (const [x, y, dx, dy] of passes) {
    const width = Math.max(0, Math.ceil((w - x) / dx)),
      height = Math.max(0, Math.ceil((h - y) / dy));
    if (!width || !height) {
      continue;
    }
    const row = 1 + Math.ceil((width * channels * depth) / 8);
    expected += row * height;
    rows.push([row, height]);
  }
  if (expected > 64 * 1024 * 1024) {
    return false;
  }
  const raw = inflateSync(Buffer.concat(compressed), {
    maxOutputLength: expected + 1,
  });
  if (raw.length !== expected) {
    return false;
  }
  let offset = 0;
  for (const [row, height] of rows) {
    for (let y = 0; y < height; y++) {
      if (raw[offset] > 4) {
        return false;
      }
      offset += row;
    }
  }
  return true;
}

function jpeg(buffer) {
  if (
    buffer[0] !== 255 ||
    buffer[1] !== 216 ||
    buffer[buffer.length - 2] !== 255 ||
    buffer[buffer.length - 1] !== 217
  ) {
    return false;
  }
  let offset = 2,
    frame = false,
    scan = false,
    entropy = 0;
  while (offset < buffer.length) {
    if (buffer[offset++] !== 255) {
      return false;
    }
    while (buffer[offset] === 255) {
      offset++;
    }
    const marker = buffer[offset++];
    if (marker === 217) {
      return offset === buffer.length && frame && scan && entropy > 0;
    }
    if (marker === 0 || marker === 216) {
      return false;
    }
    if (offset + 2 > buffer.length) {
      return false;
    }
    const size = buffer.readUInt16BE(offset);
    if (size < 2 || offset + size > buffer.length) {
      return false;
    }
    if ([192, 193, 194].includes(marker)) {
      if (size < 11 || buffer[offset + 2] !== 8) {
        return false;
      }
      const h = buffer.readUInt16BE(offset + 3),
        w = buffer.readUInt16BE(offset + 5),
        components = buffer[offset + 7];
      if (
        !dimensions(w, h) ||
        ![1, 3, 4].includes(components) ||
        size !== 8 + 3 * components
      ) {
        return false;
      }
      frame = true;
    }
    if (marker === 218) {
      if (!frame || size < 6) {
        return false;
      }
      scan = true;
      offset += size;
      const start = offset;
      while (offset < buffer.length - 1) {
        if (buffer[offset] !== 255) {
          offset++;
          continue;
        }
        const next = buffer[offset + 1];
        if (next === 0 || (next >= 208 && next <= 215)) {
          offset += 2;
          continue;
        }
        break;
      }
      entropy += offset - start;
    } else {
      offset += size;
    }
  }
  return false;
}

function webp(buffer) {
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP" ||
    buffer.readUInt32LE(4) !== buffer.length - 8
  ) {
    return false;
  }
  let offset = 12,
    frames = 0;
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      return false;
    }
    const type = buffer.toString("ascii", offset, offset + 4),
      size = buffer.readUInt32LE(offset + 4),
      start = offset + 8;
    if (size > buffer.length - start) {
      return false;
    }
    const chunk = buffer.subarray(start, start + size);
    if (type === "VP8 ") {
      if (size < 14 || chunk[0] & 1 || chunk.toString("hex", 3, 6) !== "9d012a") {
        return false;
      }
      const partition = chunk.readUIntLE(0, 3) >>> 5;
      if (
        partition < 1 ||
        partition + 10 > size ||
        !dimensions(chunk.readUInt16LE(6) & 0x3fff, chunk.readUInt16LE(8) & 0x3fff)
      ) {
        return false;
      }
      frames++;
    } else if (type === "VP8L") {
      if (size < 6 || chunk[0] !== 0x2f || chunk[4] >> 5 !== 0) {
        return false;
      }
      const bits = chunk.readUInt32LE(1);
      if (!dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)) {
        return false;
      }
      frames++;
    } else if (type === "VP8X") {
      if (size !== 10 || chunk[0] & 2) {
        return false;
      }
      if (!dimensions(chunk.readUIntLE(4, 3) + 1, chunk.readUIntLE(7, 3) + 1)) {
        return false;
      }
    } else if (!["ALPH", "ICCP", "EXIF", "XMP "].includes(type)) {
      return false;
    }
    offset = start + size + (size % 2);
    if (offset > buffer.length) {
      return false;
    }
  }
  return offset === buffer.length && frames === 1;
}

export function validImage(buffer, type) {
  try {
    return (
      {
        png,
        jpeg,
        webp,
      }[type]?.(buffer) === true
    );
  } catch {
    return false;
  }
}
