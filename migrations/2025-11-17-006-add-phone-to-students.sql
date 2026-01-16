-- Migration: Add phone_number column to students table

ALTER TABLE students
  ADD COLUMN phone_number VARCHAR(20) NULL AFTER email;


