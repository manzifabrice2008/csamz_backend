-- Add level to exams table
ALTER TABLE exams 
ADD COLUMN level ENUM('L1', 'L2', 'L3', 'L4', 'L5') NULL AFTER trade;

-- Add level to students table
ALTER TABLE students
ADD COLUMN level ENUM('L1', 'L2', 'L3', 'L4', 'L5') NULL AFTER trade;

-- Update existing records to have a default level of L3
UPDATE exams SET level = 'L3' WHERE level IS NULL;
UPDATE students SET level = 'L3' WHERE level IS NULL;

-- Make the level column NOT NULL after setting defaults
ALTER TABLE exams 
MODIFY COLUMN level ENUM('L1', 'L2', 'L3', 'L4', 'L5') NOT NULL;

ALTER TABLE students
MODIFY COLUMN level ENUM('L1', 'L2', 'L3', 'L4', 'L5') NOT NULL;
