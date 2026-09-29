-- Persist the last generated period so maintenance does not rescan collection history.
ALTER TABLE "Team" ADD COLUMN "collectionsGeneratedThrough" DATE;
