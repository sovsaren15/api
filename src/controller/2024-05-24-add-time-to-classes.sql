-- SQL script for adding start and end time to the classes table
-- Run this script on your database to apply the changes.

ALTER TABLE `classes`
ADD COLUMN `start_time` TIME NULL AFTER `academic_year`,
ADD COLUMN `end_time` TIME NULL AFTER `start_time`;