CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(191) PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  profile JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  active_building_id VARCHAR(191) NULL,
  INDEX idx_sessions_user(user_id),
  INDEX idx_sessions_expiry(expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS memberships (
  building_id VARCHAR(191) NOT NULL,
  email VARCHAR(320) NOT NULL,
  role VARCHAR(32) NOT NULL,
  apartment_number VARCHAR(64) NULL,
  PRIMARY KEY(building_id,email),
  INDEX idx_memberships_email(email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS building_records (
  building_id VARCHAR(191) NOT NULL,
  collection VARCHAR(64) NOT NULL,
  id VARCHAR(191) NOT NULL,
  seq BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  data JSON NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY(building_id,collection,id),
  UNIQUE KEY uq_records_seq(seq),
  INDEX idx_records_building_collection(building_id,collection)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
