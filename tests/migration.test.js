import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
test("Mumbai service-area migration preserves real historical locations", async () => {
  const file = resolve("prisma/migration-test.db");
  await rm(file, {
    force: true,
  });
  await writeFile(file, "");
  const client = new PrismaClient({
    datasources: {
      db: {
        url: "file:" + file,
      },
    },
  });
  try {
    await client.$executeRawUnsafe(
      "CREATE TABLE Complaint (id TEXT PRIMARY KEY, city TEXT, title TEXT, address TEXT, ward TEXT, latitude REAL, longitude REAL)",
    );
    await client.$executeRaw`INSERT INTO Complaint(id,city,title,address,ward) VALUES ('real-citizen-report','Navi Mumbai','Historical water leak','Sector 9, Vashi','Vashi')`;
    await client.$executeRaw`INSERT INTO Complaint(id,city,title,address,ward) VALUES ('demo-001','Navi Mumbai','Sample pothole','Vashi station','Vashi')`;
    const sql = await readFile(
      new URL(
        "../prisma/migrations/20261114110000_mumbai_video/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of sql
      .split("\n")
      .filter((line) => {
        return !line.trim().startsWith("--");
      })
      .join("\n")
      .split(";")
      .filter((s) => {
        return s.trim();
      })) {
      await client.$executeRawUnsafe(statement);
    }
    const [real] =
      await client.$queryRaw`SELECT * FROM Complaint WHERE id='real-citizen-report'`;
    assert.equal(real.city, "Navi Mumbai");
    assert.equal(real.address, "Sector 9, Vashi");
    const [demo] = await client.$queryRaw`SELECT * FROM Complaint WHERE id='demo-001'`;
    assert.equal(demo.city, "Mumbai");
    assert.equal(demo.ward, "Andheri West");
  } finally {
    await client.$disconnect();
    await rm(file, {
      force: true,
    });
  }
});
