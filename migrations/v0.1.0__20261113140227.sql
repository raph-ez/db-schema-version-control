-- Migration Script (Up)
ALTER TABLE "public"."students" ADD COLUMN IF NOT EXISTS "email" VARCHAR(255) NOT NULL;