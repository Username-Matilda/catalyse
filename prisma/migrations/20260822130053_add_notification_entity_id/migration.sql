-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "entity_id" INTEGER;

-- CreateIndex
CREATE INDEX "idx_notifications_type_entity" ON "notifications"("type", "entity_id");

