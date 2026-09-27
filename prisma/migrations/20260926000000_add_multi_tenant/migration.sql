-- Create the tenant root before assigning existing records to Santa Fe.
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");

INSERT INTO "Team" ("id", "name", "slug", "active", "createdAt", "updatedAt")
VALUES ('cm1santafe0000000000000000', 'Santa Fé', 'santa-fe', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "Director" ADD COLUMN "teamId" TEXT;
ALTER TABLE "Game" ADD COLUMN "teamId" TEXT;
ALTER TABLE "Category" ADD COLUMN "teamId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "teamId" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "teamId" TEXT;

UPDATE "Director" SET "teamId" = 'cm1santafe0000000000000000';
UPDATE "Game" SET "teamId" = 'cm1santafe0000000000000000';
UPDATE "Category" SET "teamId" = 'cm1santafe0000000000000000';
UPDATE "Transaction" SET "teamId" = 'cm1santafe0000000000000000';

-- Existing sessions do not carry a tenant and must not survive the migration.
DELETE FROM "RefreshToken";

ALTER TABLE "Director" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "Game" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "Category" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "teamId" SET NOT NULL;
ALTER TABLE "RefreshToken" ALTER COLUMN "teamId" SET NOT NULL;

ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_gameId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_categoryId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_directorId_fkey";
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_createdByUserId_fkey";
ALTER TABLE "User" DROP CONSTRAINT "User_directorId_fkey";

DROP INDEX "Director_name_key";
DROP INDEX "Category_name_key";
DROP INDEX "User_directorId_key";

CREATE UNIQUE INDEX "Director_teamId_name_key" ON "Director"("teamId", "name");
CREATE UNIQUE INDEX "Director_id_teamId_key" ON "Director"("id", "teamId");
CREATE INDEX "Director_teamId_active_idx" ON "Director"("teamId", "active");
CREATE UNIQUE INDEX "Game_id_teamId_key" ON "Game"("id", "teamId");
CREATE INDEX "Game_teamId_date_idx" ON "Game"("teamId", "date");
CREATE INDEX "Game_teamId_status_idx" ON "Game"("teamId", "status");
CREATE UNIQUE INDEX "Category_teamId_name_key" ON "Category"("teamId", "name");
CREATE UNIQUE INDEX "Category_id_teamId_key" ON "Category"("id", "teamId");
CREATE INDEX "Category_teamId_active_idx" ON "Category"("teamId", "active");
CREATE INDEX "Transaction_teamId_createdAt_idx" ON "Transaction"("teamId", "createdAt");
CREATE UNIQUE INDEX "Transaction_id_teamId_key" ON "Transaction"("id", "teamId");
CREATE INDEX "Transaction_teamId_gameId_idx" ON "Transaction"("teamId", "gameId");
CREATE INDEX "Transaction_teamId_categoryId_idx" ON "Transaction"("teamId", "categoryId");
CREATE INDEX "Transaction_teamId_directorId_idx" ON "Transaction"("teamId", "directorId");
CREATE INDEX "RefreshToken_userId_revokedAt_idx" ON "RefreshToken"("userId", "revokedAt");
CREATE INDEX "RefreshToken_teamId_idx" ON "RefreshToken"("teamId");

CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "directorId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TeamMembership" (
    "id", "userId", "teamId", "role", "directorId", "active", "createdAt", "updatedAt"
)
SELECT
    'membership_' || "id",
    "id",
    'cm1santafe0000000000000000',
    "role",
    "directorId",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";

CREATE UNIQUE INDEX "TeamMembership_userId_teamId_key" ON "TeamMembership"("userId", "teamId");
CREATE UNIQUE INDEX "TeamMembership_teamId_directorId_key" ON "TeamMembership"("teamId", "directorId");
CREATE INDEX "TeamMembership_teamId_role_idx" ON "TeamMembership"("teamId", "role");

ALTER TABLE "User" DROP COLUMN "role";
ALTER TABLE "User" DROP COLUMN "directorId";

ALTER TABLE "Director" ADD CONSTRAINT "Director_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_gameId_teamId_fkey"
FOREIGN KEY ("gameId", "teamId") REFERENCES "Game"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_teamId_fkey"
FOREIGN KEY ("categoryId", "teamId") REFERENCES "Category"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_directorId_teamId_fkey"
FOREIGN KEY ("directorId", "teamId") REFERENCES "Director"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_directorId_teamId_fkey"
FOREIGN KEY ("directorId", "teamId") REFERENCES "Director"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_createdByUserId_teamId_fkey"
FOREIGN KEY ("createdByUserId", "teamId") REFERENCES "TeamMembership"("userId", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_teamId_fkey"
FOREIGN KEY ("userId", "teamId") REFERENCES "TeamMembership"("userId", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;
