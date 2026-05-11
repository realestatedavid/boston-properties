-- Migration: Add property owners support
-- Run this in your Supabase SQL editor at: supabase.com → your project → SQL Editor

-- 1. Add property_id to contacts so owners can be linked to a property
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS property_id text REFERENCES properties_v2(id) ON DELETE SET NULL;

-- 2. Allow 'owner' as a contact type (if your table has a CHECK constraint on type)
-- Only run this if you get a constraint error when saving an owner contact.
-- ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_type_check;
-- ALTER TABLE contacts ADD CONSTRAINT contacts_type_check
--   CHECK (type IN ('tenant','ff_lead','owner','investor','past_client','buyer','seller'));

-- 3. Index for fast owner lookups by property
CREATE INDEX IF NOT EXISTS idx_contacts_property_id ON contacts(property_id)
  WHERE property_id IS NOT NULL;
