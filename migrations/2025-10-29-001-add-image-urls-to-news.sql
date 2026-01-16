ALTER TABLE `news_articles`
  ADD COLUMN `image_urls` JSON NULL AFTER `image_url`;

-- Optional: migrate existing single image_url values into the new array field
UPDATE `news_articles`
SET `image_urls` = JSON_ARRAY(`image_url`)
WHERE `image_url` IS NOT NULL AND `image_url` <> '' AND `image_urls` IS NULL;
