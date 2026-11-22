CREATE TABLE "Video" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "url" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL,
 "sizeBytes" INTEGER NOT NULL,
 "complaintId" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Video_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Video_complaintId_idx" ON "Video"("complaintId");
UPDATE "Complaint" SET "city" = 'Mumbai' WHERE "city" = 'Navi Mumbai' AND "id" LIKE 'demo-%';
-- Refresh fictional sample locations only; citizens' historical address text is preserved.
UPDATE "Complaint" SET "title"='Pothole near Andheri station entrance', "address"='SV Road, near Andheri railway station', "ward"='Andheri West', "latitude"=19.119, "longitude"=72.846 WHERE "id"='demo-001';
UPDATE "Complaint" SET "title"='Streetlights out along SV Road', "address"='SV Road, opposite the municipal garden', "ward"='Borivali West', "latitude"=19.23, "longitude"=72.85 WHERE "id"='demo-003';
UPDATE "Complaint" SET "title"='Damaged footpath near Shivaji Park', "address"='Shivaji Park main entrance', "ward"='Dadar', "latitude"=19.027, "longitude"=72.838 WHERE "id"='demo-006';
UPDATE "Complaint" SET "address"='Pant Nagar, near the municipal school', "ward"='Ghatkopar East', "latitude"=19.087, "longitude"=72.909 WHERE "id"='demo-007';
UPDATE "Complaint" SET "title"='Low water pressure in Mulund West', "address"='LBS Marg, opposite the public garden', "ward"='Mulund West', "latitude"=19.172, "longitude"=72.942 WHERE "id"='demo-009';
UPDATE "Complaint" SET "address"='Sion Station Road, near the community hall', "ward"='Sion', "latitude"=19.047, "longitude"=72.863 WHERE "id"='demo-012';
