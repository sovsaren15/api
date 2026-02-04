-- SQL script for adding start and end date to the classes table
-- Run this script on your database to apply the changes.

ALTER TABLE `classes`
ADD COLUMN `start_date` DATE NULL AFTER `end_time`,
ADD COLUMN `end_date` DATE NULL AFTER `start_date`;