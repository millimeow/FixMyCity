import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { fail } from "./security.js";
import { validVideo } from "./video-structure.js";
import { validImage } from "./image-structure.js";
export const uploadDir = resolve(process.env.UPLOAD_DIR || "uploads");

export function validateImages(images = []) {
  if (!Array.isArray(images) || images.length > 3) {
    fail(400, "Choose up to 3 photographs.");
  }
  return images.map((value) => {
    if (typeof value !== "string") {
      fail(400, "Invalid image.");
    }
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!m || m[2].length % 4 !== 0) {
      fail(400, "Only PNG, JPEG and WebP photographs are accepted.");
    }
    const buffer = Buffer.from(m[2], "base64");
    if (buffer.length > 2 * 1024 * 1024 || buffer.length < 24) {
      fail(400, "Each photograph must be under 2 MB and a valid image.");
    }
    if (!validImage(buffer, m[1])) {
      fail(
        400,
        "The photo is damaged, unsupported, or too large to decode. Choose a valid still PNG, JPEG or WebP image (maximum 16 megapixels).",
      );
    }
    return {
      buffer: buffer,
      ext: m[1] === "jpeg" ? "jpg" : m[1],
    };
  });
}

export async function saveImages(validated) {
  await mkdir(uploadDir, {
    recursive: true,
  });
  const paths = [];
  try {
    for (const image of validated) {
      const name = `${randomUUID()}.${image.ext}`;
      await writeFile(join(uploadDir, name), image.buffer, {
        flag: "wx",
        mode: 0o600,
      });
      paths.push(`/uploads/${name}`);
    }
    return paths;
  } catch (e) {
    await removeImages(paths);
    throw e;
  }
}

export async function removeImages(paths) {
  await Promise.all(
    paths.map((p) => {
      return unlink(join(uploadDir, p.split("/").pop())).catch(() => {});
    }),
  );
}

export function validateVideos(videos = []) {
  if (!Array.isArray(videos) || videos.length > 1) {
    fail(400, "Choose at most one video.");
  }
  return videos.map((value) => {
    if (typeof value !== "string") {
      fail(400, "Invalid video.");
    }
    const m = /^data:video\/(mp4|webm);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!m || m[2].length % 4 !== 0) {
      fail(400, "Only MP4 or WebM videos are accepted.");
    }
    if (m[2].length > Math.ceil((10 * 1024 * 1024) / 3) * 4) {
      fail(400, "The video must be 10 MB or smaller.");
    }
    const buffer = Buffer.from(m[2], "base64");
    if (
      buffer.length < 64 ||
      buffer.length > 10 * 1024 * 1024 ||
      !validVideo(buffer, m[1])
    ) {
      fail(
        400,
        "Choose a valid MP4 or WebM video under 10 MB. Audio-only, damaged and unsupported files are not accepted.",
      );
    }
    return {
      buffer,
      ext: m[1],
      mimeType: "video/" + m[1],
      sizeBytes: buffer.length,
    };
  });
}
