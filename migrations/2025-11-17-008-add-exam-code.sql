-- Migration: add exam_code column to exams table

ALTER TABLE exams
  ADD COLUMN exam_code VARCHAR(20) DEFAULT NULL AFTER title,
  ADD CONSTRAINT uq_exams_exam_code UNIQUE (exam_code);

