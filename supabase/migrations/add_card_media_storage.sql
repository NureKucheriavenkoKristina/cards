-- Cardly storage bucket for card audio + images (deck covers, card photos).
-- Run in Supabase SQL Editor if uploads fail with "bucket not found".

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'card-media',
  'card-media',
  true,
  20971520,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
    'audio/flac',
    'audio/opus'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "card_media_public_read" ON storage.objects;
CREATE POLICY "card_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'card-media');

DROP POLICY IF EXISTS "card_media_auth_insert" ON storage.objects;
CREATE POLICY "card_media_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "card_media_auth_update" ON storage.objects;
CREATE POLICY "card_media_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS "card_media_auth_delete" ON storage.objects;
CREATE POLICY "card_media_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'card-media'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
