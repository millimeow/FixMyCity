// Container validation only: playback support still depends on the browser's codecs.

function boxes(buffer, start, end) {
  const result = [];
  let offset = start;
  while (offset < end) {
    if (result.length > 20000 || offset + 8 > end) {
      throw Error();
    }
    let size = buffer.readUInt32BE(offset),
      header = 8;
    if (size === 1) {
      if (offset + 16 > end) {
        throw Error();
      }
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (!Number.isSafeInteger(size) || size < header || size > end - offset) {
      throw Error();
    }
    result.push({
      type: buffer.toString("ascii", offset + 4, offset + 8),
      start: offset + header,
      end: offset + size,
    });
    offset += size;
  }
  return result;
}

function mp4(buffer) {
  const top = boxes(buffer, 0, buffer.length),
    ftyp = top.find((x) => {
      return x.type === "ftyp";
    }),
    moov = top.find((x) => {
      return x.type === "moov";
    }),
    media = top.filter((x) => {
      return x.type === "mdat" && x.end - x.start > 4;
    });
  if (!ftyp || ftyp.end - ftyp.start < 8 || !moov || !media.length) {
    return false;
  }
  const brands = [];
  for (let offset = ftyp.start; offset + 4 <= ftyp.end; offset += 4) {
    if (offset !== ftyp.start + 4) {
      brands.push(buffer.toString("ascii", offset, offset + 4));
    }
  }
  if (
    !brands.some((x) => {
      return [
        "isom",
        "iso2",
        "iso3",
        "iso4",
        "iso5",
        "iso6",
        "mp41",
        "mp42",
        "avc1",
        "M4V ",
        "MSNV",
      ].includes(x);
    })
  ) {
    return false;
  }
  for (const track of boxes(buffer, moov.start, moov.end).filter((x) => {
    return x.type === "trak";
  })) {
    const mdia = boxes(buffer, track.start, track.end).find((x) => {
      return x.type === "mdia";
    });
    if (!mdia) {
      continue;
    }
    const children = boxes(buffer, mdia.start, mdia.end),
      handler = children.find((x) => {
        return x.type === "hdlr";
      }),
      minf = children.find((x) => {
        return x.type === "minf";
      });
    if (
      !handler ||
      handler.end - handler.start < 12 ||
      buffer.toString("ascii", handler.start + 8, handler.start + 12) !== "vide" ||
      !minf
    ) {
      continue;
    }
    const stbl = boxes(buffer, minf.start, minf.end).find((x) => {
      return x.type === "stbl";
    });
    if (!stbl) {
      continue;
    }
    const table = boxes(buffer, stbl.start, stbl.end),
      stsd = table.find((x) => {
        return x.type === "stsd";
      }),
      stsz = table.find((x) => {
        return x.type === "stsz";
      }),
      offsets = table.find((x) => {
        return ["stco", "co64"].includes(x.type);
      });
    if (
      !stsd ||
      stsd.end - stsd.start < 8 ||
      !stsz ||
      stsz.end - stsz.start < 12 ||
      !offsets ||
      offsets.end - offsets.start < 8
    ) {
      continue;
    }
    const entries = boxes(buffer, stsd.start + 8, stsd.end);
    if (
      !entries.some((x) => {
        return (
          ["avc1", "avc3", "hvc1", "hev1", "vp09", "av01", "mp4v"].includes(x.type) &&
          x.end - x.start >= 78
        );
      })
    ) {
      continue;
    }
    const count = buffer.readUInt32BE(stsz.start + 8),
      fixedSize = buffer.readUInt32BE(stsz.start + 4);
    if (!count || (!fixedSize && stsz.end - stsz.start !== 12 + count * 4)) {
      continue;
    }
    const chunks = buffer.readUInt32BE(offsets.start + 4),
      width = offsets.type === "stco" ? 4 : 8;
    if (!chunks || offsets.end - offsets.start !== 8 + chunks * width) {
      continue;
    }
    let valid = true;
    for (let i = 0; i < chunks; i++) {
      const offset = offsets.start + 8 + i * width,
        value =
          width === 4
            ? buffer.readUInt32BE(offset)
            : Number(buffer.readBigUInt64BE(offset));
      if (
        !media.some((m) => {
          return value >= m.start && value < m.end;
        })
      ) {
        valid = false;
        break;
      }
    }
    if (valid) {
      return true;
    }
  }
  return false;
}

function vint(buffer, offset, id = false) {
  let width = 1,
    mask = 128;
  while (width <= 8 && !(buffer[offset] & mask)) {
    width++;
    mask >>= 1;
  }
  if (width > 8 || offset + width > buffer.length || (id && width > 4)) {
    throw Error();
  }
  let value = BigInt(id ? buffer[offset] : buffer[offset] & (mask - 1));
  for (let i = 1; i < width; i++) {
    value = value * 256n + BigInt(buffer[offset + i]);
  }
  return {
    width,
    value: Number(value),
    unknown: !id && value === (1n << BigInt(width * 7)) - 1n,
  };
}

function elements(buffer, start, end) {
  const result = [];
  let offset = start;
  while (offset < end) {
    if (result.length > 20000) {
      throw Error();
    }
    const id = vint(buffer, offset, true);
    offset += id.width;
    const size = vint(buffer, offset);
    offset += size.width;
    const finish = size.unknown ? end : offset + size.value;
    if (finish > end || finish < offset || !Number.isSafeInteger(finish)) {
      throw Error();
    }
    if (size.unknown && ![0x18538067, 0x1f43b675].includes(id.value)) {
      throw Error();
    }
    result.push({
      id: id.value,
      start: offset,
      end: finish,
    });
    offset = finish;
  }
  return result;
}

function uint(buffer, el) {
  if (!el || el.end - el.start > 6 || el.end <= el.start) {
    throw Error();
  }
  return buffer.readUIntBE(el.start, el.end - el.start);
}

function webm(buffer) {
  const top = elements(buffer, 0, buffer.length),
    header = top[0],
    segment = top.find((x) => {
      return x.id === 0x18538067;
    });
  if (header?.id !== 0x1a45dfa3 || !segment) {
    return false;
  }
  const doc = elements(buffer, header.start, header.end).find((x) => {
    return x.id === 0x4282;
  });
  if (!doc || buffer.toString("ascii", doc.start, doc.end) !== "webm") {
    return false;
  }
  const children = elements(buffer, segment.start, segment.end),
    tracks = children.find((x) => {
      return x.id === 0x1654ae6b;
    });
  if (!tracks) {
    return false;
  }
  const videoTracks = new Set();
  for (const track of elements(buffer, tracks.start, tracks.end).filter((x) => {
    return x.id === 0xae;
  })) {
    const fields = elements(buffer, track.start, track.end),
      type = fields.find((x) => {
        return x.id === 0x83;
      }),
      codec = fields.find((x) => {
        return x.id === 0x86;
      }),
      video = fields.find((x) => {
        return x.id === 0xe0;
      });
    if (uint(buffer, type) !== 1 || !codec || !video) {
      continue;
    }
    if (
      !["V_VP8", "V_VP9", "V_AV1"].includes(
        buffer.toString("ascii", codec.start, codec.end),
      )
    ) {
      continue;
    }
    const dims = elements(buffer, video.start, video.end),
      w = uint(
        buffer,
        dims.find((x) => {
          return x.id === 0xb0;
        }),
      ),
      h = uint(
        buffer,
        dims.find((x) => {
          return x.id === 0xba;
        }),
      );
    if (w < 1 || h < 1 || w > 7680 || h > 4320) {
      return false;
    }
    videoTracks.add(
      uint(
        buffer,
        fields.find((x) => {
          return x.id === 0xd7;
        }),
      ),
    );
  }
  if (!videoTracks.size) {
    return false;
  }
  for (const cluster of children.filter((x) => {
    return x.id === 0x1f43b675;
  })) {
    for (const el of elements(buffer, cluster.start, cluster.end)) {
      const block =
        el.id === 0xa3
          ? el
          : el.id === 0xa0
            ? elements(buffer, el.start, el.end).find((x) => {
                return x.id === 0xa1;
              })
            : null;
      if (
        block &&
        block.end - block.start > 5 &&
        videoTracks.has(vint(buffer, block.start).value)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function validVideo(buffer, type) {
  try {
    if (type === "mp4") {
      return mp4(buffer);
    } else {
      if (type === "webm") {
        return webm(buffer);
      } else {
        return false;
      }
    }
  } catch {
    return false;
  }
}
