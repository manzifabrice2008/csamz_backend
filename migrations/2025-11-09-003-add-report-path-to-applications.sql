-- Add report_path column to student_applications table
ALTER TABLE student_applications 
ADD COLUMN report_path VARCHAR(500) NULL COMMENT 'Path to the uploaded report file' AFTER guardian_phone;
