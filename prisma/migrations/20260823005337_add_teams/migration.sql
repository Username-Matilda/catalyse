-- CreateTable
CREATE TABLE "teams" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "luma_url" TEXT,
    "doc_url" TEXT,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "volunteer_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "team_memberships_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "team_suggestions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "suggested_by_id" INTEGER NOT NULL,
    "reviewed_by_id" INTEGER,
    "reviewed_at" DATETIME,
    "admin_notes" TEXT,
    "merged_into_id" INTEGER,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_suggestions_suggested_by_id_fkey" FOREIGN KEY ("suggested_by_id") REFERENCES "volunteers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "team_suggestions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "team_suggestions_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_team_memberships_volunteer" ON "team_memberships"("volunteer_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_team_memberships_team_volunteer" ON "team_memberships"("team_id", "volunteer_id");

-- CreateIndex
CREATE INDEX "idx_team_suggestions_status" ON "team_suggestions"("status");

-- CreateIndex
CREATE INDEX "idx_team_suggestions_suggested_by" ON "team_suggestions"("suggested_by_id");

