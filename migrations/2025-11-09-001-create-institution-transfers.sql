-- Create institution_transfers table
CREATE TABLE IF NOT EXISTS institution_transfers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  student_id INT NOT NULL,
  current_institution VARCHAR(255) NOT NULL,
  target_institution VARCHAR(255) NOT NULL,
  reason TEXT NOT NULL,
  witness_document_path VARCHAR(500) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  admin_notes TEXT,
  processed_by INT,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_by) REFERENCES admins(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX idx_institution_transfers_student ON institution_transfers(student_id);
CREATE INDEX idx_institution_transfers_status ON institution_transfers(status);
CREATE INDEX idx_institution_transfers_created ON institution_transfers(created_at);
