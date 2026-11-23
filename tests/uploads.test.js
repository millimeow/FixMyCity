import test from "node:test";
import assert from "node:assert/strict";
import { validateImages } from "../src/services/uploads.js";
const data = (type, b) => {
  return `data:image/${type};base64,${b.toString("base64")}`;
};
test("rejects forged and truncated image structures", () => {
  const fakeWebP = Buffer.alloc(24);
  fakeWebP.write("RIFF", 0);
  fakeWebP.writeUInt32LE(16, 4);
  fakeWebP.write("WEBP", 8);
  const fakeJpeg = Buffer.alloc(40);
  fakeJpeg[0] = 255;
  fakeJpeg[1] = 216;
  fakeJpeg[38] = 255;
  fakeJpeg[39] = 217;
  const fakePng = Buffer.alloc(40);
  Buffer.from("89504e470d0a1a0a", "hex").copy(fakePng);
  fakePng.write("IHDR", 12);
  Buffer.from("49454e44ae426082", "hex").copy(fakePng, 32);
  for (const [type, buffer] of [
    ["webp", fakeWebP],
    ["jpeg", fakeJpeg],
    ["png", fakePng],
  ]) {
    assert.throws(
      () => {
        return validateImages([data(type, buffer)]);
      },
      {
        status: 400,
      },
      type + " must contain a structurally valid image",
    );
  }
});
test("rejects SVG, oversized uploads and excessive photo count", () => {
  assert.throws(
    () => {
      return validateImages(["data:image/svg+xml;base64,PHN2Zz4="]);
    },
    {
      status: 400,
    },
  );
  assert.throws(
    () => {
      return validateImages(Array(4).fill("x"));
    },
    {
      status: 400,
    },
  );
  assert.throws(
    () => {
      return validateImages([data("jpeg", Buffer.alloc(2 * 1024 * 1024 + 1))]);
    },
    {
      status: 400,
    },
  );
});
test("accepts real PNG, JPEG and WebP fixtures", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const [type, ext] of [
    ["png", "png"],
    ["jpeg", "jpg"],
    ["webp", "webp"],
  ]) {
    const b = await readFile(new URL("./fixtures/photo." + ext, import.meta.url));
    assert.equal(validateImages([data(type, b)]).length, 1);
  }
});
test("video uploads reject fake containers, mismatches, excessive count and oversize", async () => {
  const { validateVideos } = await import("../src/services/uploads.js");
  const mp4 = Buffer.alloc(64);
  mp4.writeUInt32BE(24);
  mp4.write("ftyp", 4);
  mp4.write("isom", 8);
  for (const value of [
    "data:video/mp4;base64," + mp4.toString("base64"),
    "data:video/webm;base64," + mp4.toString("base64"),
    "data:video/quicktime;base64,AAAA",
  ]) {
    assert.throws(
      () => {
        return validateVideos([value]);
      },
      {
        status: 400,
      },
    );
  }
  assert.throws(
    () => {
      return validateVideos(["x", "y"]);
    },
    {
      status: 400,
    },
  );
  assert.throws(
    () => {
      return validateVideos([
        "data:video/mp4;base64," +
          Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64"),
      ]);
    },
    {
      status: 400,
    },
  );
});
test("accepts genuine MP4 and WebM clips and rejects truncated media", async () => {
  const { validateVideos } = await import("../src/services/uploads.js");
  const { readFile } = await import("node:fs/promises");
  for (const type of ["mp4", "webm"]) {
    const buffer = await readFile(new URL("./fixtures/video." + type, import.meta.url));
    const video = validateVideos([
      `data:video/${type};base64,${buffer.toString("base64")}`,
    ])[0];
    assert.equal(video.mimeType, "video/" + type);
    assert.equal(video.sizeBytes, buffer.length);
    assert.throws(
      () => {
        return validateVideos([
          `data:video/${type};base64,${buffer.subarray(0, 80).toString("base64")}`,
        ]);
      },
      {
        status: 400,
      },
    );
  }
});
