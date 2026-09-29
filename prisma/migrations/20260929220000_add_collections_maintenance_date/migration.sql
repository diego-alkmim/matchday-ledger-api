-- Avoid repeating collection maintenance after application cold starts on the same day.
ALTER TABLE "Team" ADD COLUMN "collectionsMaintainedOn" DATE;
