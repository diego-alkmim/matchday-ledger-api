CREATE TYPE "ContributionMode" AS ENUM ('PER_GAME', 'MONTHLY');

ALTER TABLE "Team"
ADD COLUMN "contributionMode" "ContributionMode" NOT NULL DEFAULT 'PER_GAME',
ADD COLUMN "monthlyContributionPerDirector" DECIMAL(10, 2) NOT NULL DEFAULT 70.00;

ALTER TABLE "Game"
ADD COLUMN "expectedContributionPerDirector" DECIMAL(10, 2);

UPDATE "Game"
SET "expectedContributionPerDirector" = 70.00;

ALTER TABLE "Game"
ALTER COLUMN "expectedContributionPerDirector" SET NOT NULL;

ALTER TABLE "Team"
ADD CONSTRAINT "Team_monthlyContributionPerDirector_positive"
CHECK ("monthlyContributionPerDirector" > 0);

ALTER TABLE "Game"
ADD CONSTRAINT "Game_expectedContributionPerDirector_positive"
CHECK ("expectedContributionPerDirector" > 0);
