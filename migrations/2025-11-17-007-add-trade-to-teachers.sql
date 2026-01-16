-- Migration: add trade column to teachers table

ALTER TABLE teachers
  ADD COLUMN trade VARCHAR(100) NOT NULL DEFAULT 'General' AFTER password;

