-- AlterTable
ALTER TABLE "work_items" ADD COLUMN "baseline_duration_days" INTEGER;
ALTER TABLE "work_items" ADD COLUMN "baseline_set_at" DATETIME;
ALTER TABLE "work_items" ADD COLUMN "baseline_start_date" DATETIME;
ALTER TABLE "work_items" ADD COLUMN "duration_days" INTEGER;
ALTER TABLE "work_items" ADD COLUMN "schedule_updated_at" DATETIME;
ALTER TABLE "work_items" ADD COLUMN "start_date" DATETIME;
ALTER TABLE "work_items" ADD COLUMN "started_at" DATETIME;

-- CreateTable
CREATE TABLE "work_item_dependencies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "predecessor_id" INTEGER NOT NULL,
    "successor_id" INTEGER NOT NULL,
    "lag_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" INTEGER,
    CONSTRAINT "work_item_dependencies_predecessor_id_fkey" FOREIGN KEY ("predecessor_id") REFERENCES "work_items" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "work_item_dependencies_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "work_items" ("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "work_item_dependencies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "volunteers" ("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

-- CreateIndex
CREATE INDEX "idx_work_item_dependencies_successor" ON "work_item_dependencies"("successor_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_work_item_dependencies_pair" ON "work_item_dependencies"("predecessor_id", "successor_id");

