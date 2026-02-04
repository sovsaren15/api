-- SQL script for adding performance-optimizing indexes
-- Run this script on your database to apply the changes.

-- ---
-- -- Indexes for `users` table
-- -- ---
-- -- Add a UNIQUE index to the email column for fast login lookups.
ALTER TABLE `users` ADD UNIQUE `idx_email` (`email`);
-- -- Add an index to the foreign key `role_id`.
ALTER TABLE `users` ADD INDEX `idx_role_id` (`role_id`);

-- ---
-- -- Indexes for role tables (`principals`, `teachers`, `students`)
-- -- ---
ALTER TABLE `principals` ADD INDEX `idx_school_id` (`school_id`);
ALTER TABLE `teachers` ADD INDEX `idx_school_id` (`school_id`);
ALTER TABLE `students` ADD INDEX `idx_school_id` (`school_id`);

-- ---
-- -- Indexes for core school structure tables (`classes`, `subjects`, `events`)
-- -- ---
ALTER TABLE `classes` ADD INDEX `idx_school_id` (`school_id`);
ALTER TABLE `subjects` ADD INDEX `idx_school_id` (`school_id`);
ALTER TABLE `events` ADD INDEX `idx_school_id` (`school_id`);
ALTER TABLE `events` ADD INDEX `idx_created_by_user_id` (`created_by_user_id`);

-- ---
-- -- Indexes for mapping and schedule tables
-- -- ---
-- -- A composite primary key is ideal for a mapping table.
ALTER TABLE `student_class_map` ADD PRIMARY KEY `pk_student_class` (`student_id`, `class_id`);

-- -- Add individual indexes for filtering on study_schedules
ALTER TABLE `study_schedules` ADD INDEX `idx_class_id` (`class_id`);
ALTER TABLE `study_schedules` ADD INDEX `idx_teacher_id` (`teacher_id`);
ALTER TABLE `study_schedules` ADD INDEX `idx_subject_id` (`subject_id`);
ALTER TABLE `study_schedules` ADD INDEX `idx_day_of_week` (`day_of_week`);

-- ---
-- -- Indexes for record-keeping tables (`attendance`, `scores`, `academic_results`)
-- -- These tables use ON DUPLICATE KEY UPDATE, so they need UNIQUE keys.
-- -- ---

-- -- A student's attendance is unique for a given class on a given date.
ALTER TABLE `attendance` ADD UNIQUE `uq_student_class_date` (`student_id`, `class_id`, `date`);
ALTER TABLE `attendance` ADD INDEX `idx_recorded_by` (`recorded_by_teacher_id`);

-- -- A student's score is unique for a subject, assessment type, and date.
-- -- This prevents duplicate score entries for the same test.
ALTER TABLE `scores` ADD UNIQUE `uq_student_subject_assessment_date` (`student_id`, `subject_id`, `assessment_type`, `date_recorded`);
ALTER TABLE `scores` ADD INDEX `idx_class_id` (`class_id`);
ALTER TABLE `scores` ADD INDEX `idx_recorded_by` (`recorded_by_teacher_id`);

-- -- A student's final result is unique for a subject and academic period (e.g., 'Semester 1').
ALTER TABLE `academic_results` ADD UNIQUE `uq_student_subject_period` (`student_id`, `subject_id`, `academic_period`);
ALTER TABLE `academic_results` ADD INDEX `idx_class_id` (`class_id`);
ALTER TABLE `academic_results` ADD INDEX `idx_published_by` (`published_by_teacher_id`);

COMMIT;