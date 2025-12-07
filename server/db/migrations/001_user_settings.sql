-- Migration: Add user_settings table and premium service costs
-- Run this on existing database

-- User settings table (per-user preferences)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id VARCHAR(36) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value VARCHAR(500) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (user_id, setting_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Add premium service cost
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('cloud_vision_cost', '5')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
