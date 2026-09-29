-- Keep the available credit materialized so routine operations do not scan all allocations.
ALTER TABLE "CollectionPayment"
ADD COLUMN "availableAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0;

UPDATE "CollectionPayment" AS payment
SET "availableAmount" = CASE
  WHEN payment."status" = 'POSTED' THEN GREATEST(
    payment."amount" - COALESCE((
      SELECT SUM(allocation."amount")
      FROM "CollectionAllocation" AS allocation
      WHERE allocation."paymentId" = payment."id"
        AND allocation."releasedAt" IS NULL
    ), 0),
    0
  )
  ELSE 0
END;

ALTER TABLE "CollectionPayment"
ADD CONSTRAINT "CollectionPayment_availableAmount_bounds_check"
CHECK ("availableAmount" >= 0 AND "availableAmount" <= "amount");

CREATE INDEX "CollectionPayment_teamId_status_availableAmount_createdAt_idx"
ON "CollectionPayment"("teamId", "status", "availableAmount", "createdAt");

CREATE INDEX "Transaction_teamId_date_idx"
ON "Transaction"("teamId", "date");
