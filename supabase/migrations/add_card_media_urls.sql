-- Add image URL columns for card front and back
-- Run in Supabase SQL Editor if columns don't exist

ALTER TABLE cards ADD COLUMN IF NOT EXISTS front_media_url text;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS back_media_url text;
