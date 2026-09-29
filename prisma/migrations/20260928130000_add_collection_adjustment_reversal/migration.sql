ALTER TABLE "CollectionAdjustment"
ADD COLUMN "reversedAt" TIMESTAMP(3),
ADD COLUMN "reversedByUserId" TEXT,
ADD COLUMN "reversalReason" TEXT;
