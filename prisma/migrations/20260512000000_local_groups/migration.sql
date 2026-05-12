-- Create local_groups table
CREATE TABLE "local_groups" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL
);

CREATE INDEX "idx_local_groups_country" ON "local_groups"("country");

-- Seed UK local groups
INSERT INTO "local_groups" ("name", "country") VALUES
    ('Oxfordshire', 'UK'),
    ('London', 'UK'),
    ('Scotland', 'UK'),
    ('West of England', 'UK'),
    ('Leicester', 'UK'),
    ('Manchester', 'UK');
