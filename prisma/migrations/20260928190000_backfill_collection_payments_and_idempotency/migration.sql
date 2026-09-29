ALTER TABLE "CollectionPayment" ADD COLUMN "idempotencyKey" TEXT;

-- Preserve legacy entries identified by the observation when directorId was not filled.
INSERT INTO "CollectionPayment" (
    "id", "teamId", "memberId", "planId", "transactionId", "amount",
    "idempotencyKey", "status", "createdAt"
)
SELECT
    tr."id", tr."teamId", d."memberId", cp."id", tr."id", tr."amount",
    'legacy-' || tr."id", 'POSTED'::"CollectionPaymentStatus", tr."createdAt"
FROM "Transaction" tr
JOIN "Director" d
  ON d."teamId" = tr."teamId"
 AND (
   tr."directorId" = d."id"
   OR (
     tr."directorId" IS NULL
     AND translate(lower(trim(tr."notes")), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') =
         translate(lower(trim(d."name")), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
   )
 )
JOIN "CollectionPlan" cp
  ON cp."teamId" = tr."teamId"
 AND cp."categoryId" = tr."categoryId"
 AND cp."audienceRole" = 'DIRECTOR'::"MemberRole"
 AND tr."date" >= cp."effectiveFrom"
 AND (cp."inactiveAt" IS NULL OR tr."date" <= cp."inactiveAt")
WHERE tr."type" = 'ENTRADA'::"TransactionType"
  AND tr."reversedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CollectionPayment" existing
    WHERE existing."transactionId" = tr."id"
  )
ON CONFLICT DO NOTHING;

WITH inferred_start AS (
    SELECT
        d."memberId",
        CASE
          WHEN team."contributionMode" = 'MONTHLY'::"ContributionMode"
            THEN date_trunc('month', MIN(tr."date"))::date
          ELSE MIN(tr."date")::date
        END AS "startsAt"
    FROM "Director" d
    JOIN "Team" team ON team."id" = d."teamId"
    JOIN "Transaction" tr
      ON tr."teamId" = d."teamId"
     AND (
       tr."directorId" = d."id"
       OR (
         tr."directorId" IS NULL
         AND translate(lower(trim(tr."notes")), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') =
             translate(lower(trim(d."name")), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
       )
     )
     AND tr."type" = 'ENTRADA'::"TransactionType"
     AND tr."reversedAt" IS NULL
    JOIN "Category" c
      ON c."id" = tr."categoryId"
     AND c."teamId" = d."teamId"
     AND lower(c."name") = lower('Diretoria')
    WHERE d."memberId" IS NOT NULL
    GROUP BY d."memberId", team."contributionMode"
)
UPDATE "Member" m
SET "activeFrom" = LEAST(m."activeFrom", inferred_start."startsAt")
FROM inferred_start
WHERE m."id" = inferred_start."memberId";

WITH inferred_start AS (
    SELECT
        d."memberId",
        CASE
          WHEN team."contributionMode" = 'MONTHLY'::"ContributionMode"
            THEN date_trunc('month', MIN(tr."date"))::date
          ELSE MIN(tr."date")::date
        END AS "startsAt"
    FROM "Director" d
    JOIN "Team" team ON team."id" = d."teamId"
    JOIN "Transaction" tr
      ON tr."teamId" = d."teamId"
     AND (
       tr."directorId" = d."id"
       OR (
         tr."directorId" IS NULL
         AND translate(lower(trim(tr."notes")), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') =
             translate(lower(trim(d."name")), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
       )
     )
     AND tr."type" = 'ENTRADA'::"TransactionType"
     AND tr."reversedAt" IS NULL
    JOIN "Category" c
      ON c."id" = tr."categoryId"
     AND c."teamId" = d."teamId"
     AND lower(c."name") = lower('Diretoria')
    WHERE d."memberId" IS NOT NULL
    GROUP BY d."memberId", team."contributionMode"
)
UPDATE "MemberRoleAssignment" r
SET "startsAt" = LEAST(r."startsAt", inferred_start."startsAt")
FROM inferred_start
WHERE r."memberId" = inferred_start."memberId"
  AND r."role" = 'DIRECTOR'::"MemberRole";

UPDATE "CollectionPayment"
SET "idempotencyKey" = 'legacy-' || "transactionId"
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "CollectionPayment" ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "CollectionPayment_teamId_idempotencyKey_key"
ON "CollectionPayment"("teamId", "idempotencyKey");
