-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('DIRECTOR', 'PLAYER');

-- CreateEnum
CREATE TYPE "CollectionFrequency" AS ENUM ('PER_GAME', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ProrationPolicy" AS ENUM ('FULL_AMOUNT', 'DUE_DATE_CUTOFF', 'NEXT_MONTH');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'WAIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('DISCOUNT', 'SURCHARGE', 'WAIVER', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "CollectionPaymentStatus" AS ENUM ('POSTED', 'REVERSED');

-- AlterTable
ALTER TABLE "Director" ADD COLUMN     "memberId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedByUserId" TEXT,
ALTER COLUMN "gameId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "activeFrom" DATE NOT NULL,
    "inactiveAt" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberRoleAssignment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPlan" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audienceRole" "MemberRole" NOT NULL,
    "frequency" "CollectionFrequency" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "exclusiveGroup" TEXT NOT NULL DEFAULT 'membership',
    "dueDay" INTEGER,
    "prorationPolicy" "ProrationPolicy" NOT NULL DEFAULT 'DUE_DATE_CUTOFF',
    "effectiveFrom" DATE NOT NULL,
    "inactiveAt" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPlanRate" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionPlanRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionObligation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "gameId" TEXT,
    "competence" DATE,
    "dueDate" DATE NOT NULL,
    "roleSnapshot" "MemberRole" NOT NULL,
    "originalAmount" DECIMAL(10,2) NOT NULL,
    "adjustmentAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expectedAmount" DECIMAL(10,2) NOT NULL,
    "allocatedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "ObligationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionAdjustment" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPayment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "CollectionPaymentStatus" NOT NULL DEFAULT 'POSTED',
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionAllocation_pkey" PRIMARY KEY ("id")
);

-- Preserve existing directors as financial members. Reusing the director CUID
-- keeps the migration deterministic and valid for all tenant databases.
INSERT INTO "Member" (
    "id", "teamId", "name", "contact", "activeFrom", "inactiveAt", "active", "createdAt", "updatedAt"
)
SELECT
    "id", "teamId", "name", "contact", date_trunc('month', CURRENT_DATE)::date,
    CASE WHEN "active" THEN NULL ELSE (date_trunc('month', CURRENT_DATE)::date - 1) END,
    "active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Director";

UPDATE "Director" SET "memberId" = "id";

INSERT INTO "MemberRoleAssignment" (
    "id", "teamId", "memberId", "role", "startsAt", "endsAt", "createdAt"
)
SELECT
    "id", "teamId", "id", 'DIRECTOR'::"MemberRole", date_trunc('month', CURRENT_DATE)::date,
    CASE WHEN "active" THEN NULL ELSE (date_trunc('month', CURRENT_DATE)::date - 1) END,
    CURRENT_TIMESTAMP
FROM "Director";

-- CreateIndex
CREATE INDEX "Member_teamId_active_idx" ON "Member"("teamId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Member_id_teamId_key" ON "Member"("id", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_teamId_name_key" ON "Member"("teamId", "name");

-- CreateIndex
CREATE INDEX "MemberRoleAssignment_teamId_role_startsAt_idx" ON "MemberRoleAssignment"("teamId", "role", "startsAt");

-- CreateIndex
CREATE INDEX "MemberRoleAssignment_memberId_startsAt_idx" ON "MemberRoleAssignment"("memberId", "startsAt");

-- CreateIndex
CREATE INDEX "CollectionPlan_teamId_active_priority_idx" ON "CollectionPlan"("teamId", "active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPlan_id_teamId_key" ON "CollectionPlan"("id", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPlan_teamId_name_key" ON "CollectionPlan"("teamId", "name");

-- CreateIndex
CREATE INDEX "CollectionPlanRate_planId_effectiveFrom_idx" ON "CollectionPlanRate"("planId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPlanRate_planId_effectiveFrom_key" ON "CollectionPlanRate"("planId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CollectionObligation_teamId_status_dueDate_idx" ON "CollectionObligation"("teamId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "CollectionObligation_teamId_memberId_idx" ON "CollectionObligation"("teamId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionObligation_planId_memberId_competence_key" ON "CollectionObligation"("planId", "memberId", "competence");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionObligation_planId_memberId_gameId_key" ON "CollectionObligation"("planId", "memberId", "gameId");

-- CreateIndex
CREATE INDEX "CollectionAdjustment_obligationId_createdAt_idx" ON "CollectionAdjustment"("obligationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPayment_transactionId_key" ON "CollectionPayment"("transactionId");

-- CreateIndex
CREATE INDEX "CollectionPayment_teamId_memberId_status_idx" ON "CollectionPayment"("teamId", "memberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPayment_id_teamId_key" ON "CollectionPayment"("id", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPayment_transactionId_teamId_key" ON "CollectionPayment"("transactionId", "teamId");

-- CreateIndex
CREATE INDEX "CollectionAllocation_obligationId_idx" ON "CollectionAllocation"("obligationId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionAllocation_paymentId_obligationId_key" ON "CollectionAllocation"("paymentId", "obligationId");

-- CreateIndex
CREATE UNIQUE INDEX "Director_memberId_teamId_key" ON "Director"("memberId", "teamId");

-- AddForeignKey
ALTER TABLE "Director" ADD CONSTRAINT "Director_memberId_teamId_fkey" FOREIGN KEY ("memberId", "teamId") REFERENCES "Member"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberRoleAssignment" ADD CONSTRAINT "MemberRoleAssignment_memberId_teamId_fkey" FOREIGN KEY ("memberId", "teamId") REFERENCES "Member"("id", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPlan" ADD CONSTRAINT "CollectionPlan_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPlan" ADD CONSTRAINT "CollectionPlan_categoryId_teamId_fkey" FOREIGN KEY ("categoryId", "teamId") REFERENCES "Category"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPlanRate" ADD CONSTRAINT "CollectionPlanRate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CollectionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionObligation" ADD CONSTRAINT "CollectionObligation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionObligation" ADD CONSTRAINT "CollectionObligation_planId_teamId_fkey" FOREIGN KEY ("planId", "teamId") REFERENCES "CollectionPlan"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionObligation" ADD CONSTRAINT "CollectionObligation_memberId_teamId_fkey" FOREIGN KEY ("memberId", "teamId") REFERENCES "Member"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionObligation" ADD CONSTRAINT "CollectionObligation_gameId_teamId_fkey" FOREIGN KEY ("gameId", "teamId") REFERENCES "Game"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionAdjustment" ADD CONSTRAINT "CollectionAdjustment_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "CollectionObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPayment" ADD CONSTRAINT "CollectionPayment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPayment" ADD CONSTRAINT "CollectionPayment_memberId_teamId_fkey" FOREIGN KEY ("memberId", "teamId") REFERENCES "Member"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPayment" ADD CONSTRAINT "CollectionPayment_planId_teamId_fkey" FOREIGN KEY ("planId", "teamId") REFERENCES "CollectionPlan"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPayment" ADD CONSTRAINT "CollectionPayment_transactionId_teamId_fkey" FOREIGN KEY ("transactionId", "teamId") REFERENCES "Transaction"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionAllocation" ADD CONSTRAINT "CollectionAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CollectionPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionAllocation" ADD CONSTRAINT "CollectionAllocation_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "CollectionObligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CollectionPlan" ADD CONSTRAINT "CollectionPlan_dueDay_range"
CHECK ("dueDay" IS NULL OR ("dueDay" BETWEEN 1 AND 28));
ALTER TABLE "CollectionPlanRate" ADD CONSTRAINT "CollectionPlanRate_amount_positive"
CHECK ("amount" > 0);
ALTER TABLE "CollectionObligation" ADD CONSTRAINT "CollectionObligation_amounts_non_negative"
CHECK ("originalAmount" >= 0 AND "expectedAmount" >= 0 AND "allocatedAmount" >= 0);
ALTER TABLE "CollectionPayment" ADD CONSTRAINT "CollectionPayment_amount_positive"
CHECK ("amount" > 0);
ALTER TABLE "CollectionAllocation" ADD CONSTRAINT "CollectionAllocation_amount_positive"
CHECK ("amount" > 0);

-- Monthly plans start at the beginning of the deployment month. Per-game plans
-- start on deployment day so past games are not converted into false open debts.
INSERT INTO "CollectionPlan" (
    "id", "teamId", "name", "audienceRole", "frequency", "categoryId",
    "priority", "exclusiveGroup", "dueDay", "prorationPolicy",
    "effectiveFrom", "active", "createdAt", "updatedAt"
)
SELECT
    c."id", t."id", 'Contribuição da diretoria', 'DIRECTOR'::"MemberRole",
    CASE WHEN t."contributionMode" = 'MONTHLY' THEN 'MONTHLY'::"CollectionFrequency" ELSE 'PER_GAME'::"CollectionFrequency" END,
    c."id", 100, 'membership',
    CASE WHEN t."contributionMode" = 'MONTHLY' THEN 20 ELSE NULL END,
    'DUE_DATE_CUTOFF'::"ProrationPolicy",
    CASE WHEN t."contributionMode" = 'MONTHLY' THEN date_trunc('month', CURRENT_DATE)::date ELSE CURRENT_DATE END,
    true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Team" t
JOIN "Category" c ON c."teamId" = t."id" AND lower(c."name") = lower('Diretoria');

INSERT INTO "CollectionPlanRate" ("id", "planId", "amount", "effectiveFrom", "createdAt")
SELECT
    c."id", c."id", t."monthlyContributionPerDirector",
    CASE WHEN t."contributionMode" = 'MONTHLY' THEN date_trunc('month', CURRENT_DATE)::date ELSE CURRENT_DATE END,
    CURRENT_TIMESTAMP
FROM "Team" t
JOIN "Category" c ON c."teamId" = t."id" AND lower(c."name") = lower('Diretoria');

-- Existing director contributions inside the new plan's effective period become
-- auditable credits and are allocated when the collections screen is opened.
INSERT INTO "CollectionPayment" (
    "id", "teamId", "memberId", "planId", "transactionId", "amount", "status", "createdAt"
)
SELECT
    tr."id", tr."teamId", d."memberId", cp."id", tr."id", tr."amount",
    'POSTED'::"CollectionPaymentStatus", tr."createdAt"
FROM "Transaction" tr
JOIN "Director" d ON d."id" = tr."directorId" AND d."teamId" = tr."teamId"
JOIN "CollectionPlan" cp ON cp."teamId" = tr."teamId" AND cp."categoryId" = tr."categoryId"
WHERE tr."type" = 'ENTRADA'
  AND tr."reversedAt" IS NULL
  AND tr."date" >= cp."effectiveFrom";

