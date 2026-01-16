-- Migration: add trade field to exams

ALTER TABLE exams
  ADD COLUMN trade VARCHAR(100) NULL AFTER teacher_id;

