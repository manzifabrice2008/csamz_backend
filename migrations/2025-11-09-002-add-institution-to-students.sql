-- Add institution column to students table
ALTER TABLE students
ADD COLUMN institution VARCHAR(255) AFTER trade;

-- Update existing students with a default institution (if needed)
-- UPDATE students SET institution = 'Default Institution' WHERE institution IS NULL;
