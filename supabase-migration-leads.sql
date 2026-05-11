-- Migration: Add lead pipeline columns to contacts
-- Run this in your Supabase SQL editor at: supabase.com → your project → SQL Editor

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS lead_stage text
    CHECK (lead_stage IN ('inquiry','showing_scheduled','showed','applied','approved','placed','lost')),
  ADD COLUMN IF NOT EXISTS interested_room_id text REFERENCES rooms_v2(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget numeric,
  ADD COLUMN IF NOT EXISTS move_in_date date,
  ADD COLUMN IF NOT EXISTS fb_id text;

-- Optional: index for vacancy page query (contacts linked to a specific room)
CREATE INDEX IF NOT EXISTS idx_contacts_interested_room ON contacts(interested_room_id)
  WHERE interested_room_id IS NOT NULL;
