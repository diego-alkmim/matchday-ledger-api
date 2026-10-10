-- CreateTable
CREATE TABLE "GameFinancialCorrection" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "previousAmount" DECIMAL(10,2) NOT NULL,
    "newAmount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameFinancialCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameFinancialCorrection_teamId_gameId_createdAt_idx"
ON "GameFinancialCorrection"("teamId", "gameId", "createdAt");

-- AddForeignKey
ALTER TABLE "GameFinancialCorrection"
ADD CONSTRAINT "GameFinancialCorrection_gameId_teamId_fkey"
FOREIGN KEY ("gameId", "teamId") REFERENCES "Game"("id", "teamId")
ON DELETE RESTRICT ON UPDATE CASCADE;
