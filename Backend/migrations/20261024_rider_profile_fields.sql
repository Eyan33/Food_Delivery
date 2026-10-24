-- Rider profile fields missing from the original schema.
-- Safe to run more than once on the production PostgreSQL database.
ALTER TABLE public.rider_profiles
    ADD COLUMN IF NOT EXISTS address varchar(250),
    ADD COLUMN IF NOT EXISTS city varchar(120),
    ADD COLUMN IF NOT EXISTS postal_code varchar(20),
    ADD COLUMN IF NOT EXISTS emergency_contact_name varchar(120),
    ADD COLUMN IF NOT EXISTS emergency_contact_phone varchar(40),
    ADD COLUMN IF NOT EXISTS emergency_contact_relationship varchar(30);

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- Existing accounts have no reliable password-change timestamp, so leave it NULL
-- rather than inventing a date. New password changes populate it.
