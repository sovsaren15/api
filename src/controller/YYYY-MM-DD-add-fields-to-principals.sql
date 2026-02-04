-- SQL script for adding new fields to the principals table
-- Run this script on your database to apply the changes.

ALTER TABLE `principals`
ADD COLUMN `place_of_birth` VARCHAR(255) NULL AFTER `school_id`,
ADD COLUMN `experience` TEXT NULL AFTER `place_of_birth`,
ADD COLUMN `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active' AFTER `experience`;

COMMIT;