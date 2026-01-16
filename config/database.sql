-- Create database
CREATE DATABASE IF NOT EXISTS csam_school;
USE csam_school;

-- Create admins table
CREATE TABLE IF NOT EXISTS admins (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role ENUM('super_admin', 'admin') DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  trade VARCHAR(100) NOT NULL,
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_students_username ON students(username);
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_students_trade ON students(trade);

-- Create news_articles table
CREATE TABLE IF NOT EXISTS news_articles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  excerpt TEXT NOT NULL,
  content TEXT,
  category VARCHAR(50) NOT NULL,
  image_url VARCHAR(500),
  author_id INT,
  published_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (author_id) REFERENCES admins(id) ON DELETE SET NULL
);

-- Create indexes for better performance
CREATE INDEX idx_admins_email ON admins(email);
CREATE INDEX idx_admins_username ON admins(username);
CREATE INDEX idx_news_category ON news_articles(category);
CREATE INDEX idx_news_published_date ON news_articles(published_date);

-- Create student_applications table
CREATE TABLE IF NOT EXISTS student_applications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  date_of_birth DATE NOT NULL,
  gender ENUM('Male', 'Female', 'Other') NOT NULL,
  address TEXT NOT NULL,
  program VARCHAR(100) NOT NULL,
  previous_school VARCHAR(200),
  previous_qualification VARCHAR(100),
  guardian_name VARCHAR(100),
  guardian_phone VARCHAR(20),
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  admin_notes TEXT,
  approved_by INT,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (approved_by) REFERENCES admins(id) ON DELETE SET NULL
);

-- Create indexes for student applications
CREATE INDEX idx_applications_status ON student_applications(status);
CREATE INDEX idx_applications_program ON student_applications(program);
CREATE INDEX idx_applications_created_at ON student_applications(created_at);
CREATE INDEX idx_applications_phone ON student_applications(phone_number);

-- Create testimonials table
CREATE TABLE IF NOT EXISTS testimonials (
  id INT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),
  program VARCHAR(100) NOT NULL,
  graduation_year VARCHAR(4),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  testimonial_text TEXT NOT NULL,
  profile_image VARCHAR(500),
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  admin_notes TEXT,
  approved_by INT,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (approved_by) REFERENCES admins(id) ON DELETE SET NULL
);

-- Create indexes for testimonials
CREATE INDEX idx_testimonials_status ON testimonials(status);
CREATE INDEX idx_testimonials_program ON testimonials(program);
CREATE INDEX idx_testimonials_rating ON testimonials(rating);
CREATE INDEX idx_testimonials_created_at ON testimonials(created_at);

CREATE TABLE IF NOT EXISTS admin_notification_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admin_id INT NOT NULL,
  email_notifications TINYINT(1) DEFAULT 1,
  sms_notifications TINYINT(1) DEFAULT 0,
  in_app_notifications TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_admin_notification (admin_id),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  site_name VARCHAR(150) NOT NULL,
  site_tagline VARCHAR(255),
  contact_email VARCHAR(150),
  contact_phone VARCHAR(50),
  contact_address VARCHAR(255),
  facebook_url VARCHAR(255),
  twitter_url VARCHAR(255),
  instagram_url VARCHAR(255),
  updated_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sms_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  provider ENUM('console', 'africastalking', 'twilio', 'pindo') DEFAULT 'console',
  enabled TINYINT(1) DEFAULT 0,
  sender_id VARCHAR(50),
  api_key TEXT,
  username VARCHAR(100),
  additional_config JSON,
  updated_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_password_resets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admin_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_admin_password_resets_admin (admin_id),
  INDEX idx_admin_password_resets_token (token_hash),
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holiday_assessments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  instructions TEXT,
  trade VARCHAR(100),
  start_at DATETIME,
  end_at DATETIME,
  duration_minutes INT,
  status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
  allow_multiple_attempts TINYINT(1) DEFAULT 0,
  max_attempts INT DEFAULT 1,
  created_by INT,
  updated_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES admins(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES admins(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS holiday_assessment_questions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  assessment_id INT NOT NULL,
  question_text TEXT NOT NULL,
  explanation TEXT,
  points DECIMAL(6,2) DEFAULT 1.00,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assessment_id) REFERENCES holiday_assessments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holiday_assessment_choices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  question_id INT NOT NULL,
  choice_text TEXT NOT NULL,
  is_correct TINYINT(1) DEFAULT 0,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (question_id) REFERENCES holiday_assessment_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holiday_assessment_attempts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  assessment_id INT NOT NULL,
  student_identifier VARCHAR(150) NOT NULL,
  student_name VARCHAR(150),
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME,
  score DECIMAL(8,2),
  status ENUM('in_progress', 'submitted', 'graded') DEFAULT 'in_progress',
  attempt_number INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_assessment_attempt (assessment_id, student_identifier, attempt_number),
  FOREIGN KEY (assessment_id) REFERENCES holiday_assessments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS holiday_assessment_answers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  attempt_id INT NOT NULL,
  question_id INT NOT NULL,
  choice_id INT,
  is_correct TINYINT(1) DEFAULT 0,
  points_awarded DECIMAL(6,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attempt_id) REFERENCES holiday_assessment_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES holiday_assessment_questions(id) ON DELETE CASCADE,
  FOREIGN KEY (choice_id) REFERENCES holiday_assessment_choices(id) ON DELETE SET NULL
);

INSERT INTO site_settings (id, site_name, site_tagline, contact_email, contact_phone, contact_address)
VALUES (1, 'CSAM Zaccaria TVET', 'Excellence in Technical Education', 'info@csam.edu', '+250 000 000 000', 'Gicumbi, Rwanda')
ON DUPLICATE KEY UPDATE site_name=VALUES(site_name);

INSERT INTO sms_settings (id, provider, enabled)
VALUES (1, 'console', 0)
ON DUPLICATE KEY UPDATE provider=VALUES(provider);

-- Insert a default admin (password: admin123)
-- Note: This is a bcrypt hash of 'admin123'
INSERT INTO admins (username, email, password, full_name, role) 
VALUES (
  'admin',
  'admin@csam.edu',
  '$2a$10$rZ5qKvXxGxJKGJKGJKGJKOqKvXxGxJKGJKGJKGJKGJKGJKGJKGJKGe',
  'System Administrator',
  'super_admin'
) ON DUPLICATE KEY UPDATE id=id;
