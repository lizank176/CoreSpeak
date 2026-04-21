CREATE DATABASE IF NOT EXISTS corespeak
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'corespeak'@'%' IDENTIFIED BY 'corespeak';
GRANT ALL PRIVILEGES ON corespeak.* TO 'corespeak'@'%';
FLUSH PRIVILEGES;

