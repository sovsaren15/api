-- SQL script for adding new fields to the teachers table
-- Run this script on your database to apply the changes.

ALTER TABLE `teachers`
ADD COLUMN `place_of_birth` VARCHAR(255) NULL AFTER `school_id`,
ADD COLUMN `sex` ENUM('Male', 'Female', 'Other') NULL AFTER `place_of_birth`,
ADD COLUMN `date_of_birth` DATE NULL AFTER `sex`,
ADD COLUMN `experience` TEXT NULL AFTER `date_of_birth`,
ADD COLUMN `status` ENUM('active', 'inactive', 'on_leave') NOT NULL DEFAULT 'active' AFTER `experience`,
ADD COLUMN `image_profile` VARCHAR(255) NULL COMMENT 'path to profile image' AFTER `status`;

COMMIT;