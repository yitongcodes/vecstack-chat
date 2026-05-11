-- Migration: convert room_id foreign keys from UUID to TEXT
-- rooms.id was already changed to TEXT; this completes the migration for dependent tables.

ALTER TABLE room_participants DROP CONSTRAINT IF EXISTS room_participants_room_id_fkey;
ALTER TABLE messages         DROP CONSTRAINT IF EXISTS messages_room_id_fkey;

ALTER TABLE rooms             ALTER COLUMN id      TYPE TEXT USING id::text;
ALTER TABLE rooms             ALTER COLUMN id      DROP DEFAULT;
ALTER TABLE room_participants ALTER COLUMN room_id TYPE TEXT USING room_id::text;
ALTER TABLE messages          ALTER COLUMN room_id TYPE TEXT USING room_id::text;

ALTER TABLE room_participants ADD CONSTRAINT room_participants_room_id_fkey
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
ALTER TABLE messages ADD CONSTRAINT messages_room_id_fkey
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
