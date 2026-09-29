-- Infer the start of migrated directors from their earliest legacy contribution.
-- Without a payment history, keep the migration date as a conservative fallback
-- instead of creating debt for periods in which membership cannot be proven.
WITH inferred_start AS (
    SELECT
        d."id" AS "directorId",
        CASE
          WHEN team."contributionMode" = 'MONTHLY'::"ContributionMode"
            THEN date_trunc('month', MIN(t."date"))::date
          ELSE MIN(t."date")::date
        END AS "startsAt"
    FROM "Director" d
    JOIN "Team" team ON team."id" = d."teamId"
    JOIN "Transaction" t
      ON t."teamId" = d."teamId"
     AND (
       t."directorId" = d."id"
       OR (t."directorId" IS NULL AND lower(trim(t."notes")) = lower(trim(d."name")))
     )
     AND t."type" = 'ENTRADA'::"TransactionType"
     AND t."reversedAt" IS NULL
    JOIN "Category" c
      ON c."id" = t."categoryId"
     AND c."teamId" = d."teamId"
     AND lower(c."name") = lower('Diretoria')
    WHERE d."memberId" = d."id"
    GROUP BY d."id", team."contributionMode"
)
UPDATE "Member" m
SET "activeFrom" = LEAST(m."activeFrom", inferred_start."startsAt")
FROM inferred_start
WHERE m."id" = inferred_start."directorId";

WITH inferred_start AS (
    SELECT
        d."id" AS "directorId",
        CASE
          WHEN team."contributionMode" = 'MONTHLY'::"ContributionMode"
            THEN date_trunc('month', MIN(t."date"))::date
          ELSE MIN(t."date")::date
        END AS "startsAt"
    FROM "Director" d
    JOIN "Team" team ON team."id" = d."teamId"
    JOIN "Transaction" t
      ON t."teamId" = d."teamId"
     AND (
       t."directorId" = d."id"
       OR (t."directorId" IS NULL AND lower(trim(t."notes")) = lower(trim(d."name")))
     )
     AND t."type" = 'ENTRADA'::"TransactionType"
     AND t."reversedAt" IS NULL
    JOIN "Category" c
      ON c."id" = t."categoryId"
     AND c."teamId" = d."teamId"
     AND lower(c."name") = lower('Diretoria')
    WHERE d."memberId" = d."id"
    GROUP BY d."id", team."contributionMode"
)
UPDATE "MemberRoleAssignment" r
SET "startsAt" = LEAST(r."startsAt", inferred_start."startsAt")
FROM inferred_start
WHERE r."memberId" = inferred_start."directorId"
  AND r."role" = 'DIRECTOR'::"MemberRole";
