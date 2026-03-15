const db = require('../config/db');
const { logError } = require("../config/service");
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');
const { sendNotificationToUser } = require('../config/notification.service');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = `
            SELECT 
                ss.id,
                ss.class_id,
                ss.subject_id,
                t.user_id as teacher_id,
                ss.day_of_week,
                ss.start_time,
                ss.end_time,
                c.name as class_name,
                CONCAT(u.first_name, ' ', u.last_name) as teacher_name,
                s.name as subject_name
            FROM study_schedules ss
            JOIN classes c ON ss.class_id = c.id
            JOIN teachers t ON ss.teacher_id = t.id
            JOIN users u ON t.user_id = u.id
            JOIN subjects s ON ss.subject_id = s.id
        `;

        const builder = new QueryBuilder(baseQuery);

        builder.applyFilters(req.query, { 
            'ss.class_id': 'class_id', 
            't.user_id': 'teacher_id', 
            'ss.day_of_week': 'day_of_week' 
        });

        const { query: filteredQuery, params: filteredParams } = builder.build();

        const finalBuilder = new QueryBuilder(filteredQuery);
        finalBuilder.params = filteredParams;

        finalBuilder.applySorting(req.query, 'ss.day_of_week, ss.start_time');

        if (req.query.limit) {
            finalBuilder.applyPagination(req.query);
        }

        const { query, params } = finalBuilder.build();
        const [rows] = await db.query(query, params);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get All Study Schedules", error);
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT 
                ss.id,
                ss.class_id,
                t.user_id as teacher_id,
                ss.subject_id,
                ss.day_of_week,
                ss.start_time,
                ss.end_time,
                c.name as class_name,
                CONCAT(u.first_name, ' ', u.last_name) as teacher_name,
                s.name as subject_name
            FROM study_schedules ss
            JOIN classes c ON ss.class_id = c.id
            JOIN teachers t ON ss.teacher_id = t.id
            JOIN users u ON t.user_id = u.id
            JOIN subjects s ON ss.subject_id = s.id
            WHERE ss.id = ?
        `;
        const [rows] = await db.query(query, [id]);
        if (rows.length > 0) {
            sendSuccess(res, rows[0]);
        } else {
            sendError(res, 'Study schedule not found', 404);
        }
    } catch (error) {
        logError("Get Study Schedule By ID", error);
        next(error);
    }
};

const create = async (req, res, next) => {
    try {
        const { class_id, teacher_id, subject_id, day_of_week, start_time, end_time } = req.body;
        if (!class_id || !teacher_id || !subject_id || !day_of_week || !start_time || !end_time) {
            return sendError(res, 'class_id, teacher_id, subject_id, day_of_week, start_time, and end_time are required.', 400);
        }

        if (start_time >= end_time) {
            return sendError(res, 'Start time must be before end time.', 400);
        }

        // Fetch class info to check completion and security
        const [classRows] = await db.query('SELECT school_id, end_date, start_time, end_time FROM classes WHERE id = ?', [class_id]);
        if (classRows.length === 0) {
            return sendError(res, 'Class not found.', 404);
        }
        const targetClass = classRows[0];

        // Check if class is completed
        if (targetClass.end_date) {
            const endDate = new Date(targetClass.end_date);
            endDate.setHours(23, 59, 59, 999); // Allow changes until the end of the end_date
            if (new Date() > endDate) {
                return sendError(res, 'Cannot add schedule to a completed class.', 400);
            }
        }

        if (targetClass.start_time && start_time < targetClass.start_time) {
            return sendError(res, 'Schedule start time cannot be earlier than class start time.', 400);
        }
        if (targetClass.end_time && end_time > targetClass.end_time) {
            return sendError(res, 'Schedule end time cannot be later than class end time.', 400);
        }

        // Security Check: Ensure user can only add schedules to classes in their school
        const userRole = req.user.role_name;
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            
            if (userRows.length === 0 || !userRows[0].school_id || userRows[0].school_id !== targetClass.school_id) {
                return sendError(res, 'Access denied. You can only create schedules for your own school.', 403);
            }
        }

        // Resolve teacher_id (User ID) to internal Teacher ID
        const [teacherRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [teacher_id]);
        if (teacherRows.length === 0) {
            return sendError(res, 'Invalid teacher_id. Teacher record not found.', 400);
        }
        const internalTeacherId = teacherRows[0].id;

        // Check for conflicts
        const [conflicts] = await db.query(`
            SELECT id FROM study_schedules 
            WHERE teacher_id = ? 
            AND day_of_week = ? 
            AND start_time < ? 
            AND end_time > ?
        `, [internalTeacherId, day_of_week, end_time, start_time]);

        if (conflicts.length > 0) {
            return sendError(res, 'Teacher already has a class scheduled during this time.', 409);
        }

        // Check for class conflicts
        const [classConflicts] = await db.query(`
            SELECT id FROM study_schedules 
            WHERE class_id = ? 
            AND day_of_week = ? 
            AND start_time < ? 
            AND end_time > ?
        `, [class_id, day_of_week, end_time, start_time]);

        if (classConflicts.length > 0) {
            return sendError(res, 'Class already has a schedule during this time.', 409);
        }

        const [result] = await db.query(
            'INSERT INTO study_schedules (class_id, teacher_id, subject_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
            [class_id, internalTeacherId, subject_id, day_of_week, start_time, end_time]
        );

        const newScheduleId = result.insertId;

        // Fetch the newly created record with all the details to return it in the response
        const [newSchedule] = await db.query(`
            SELECT 
                ss.id, ss.day_of_week, ss.start_time, ss.end_time,
                c.name as class_name,
                CONCAT(u.first_name, ' ', u.last_name) as teacher_name,
                s.name as subject_name
            FROM study_schedules ss
            JOIN classes c ON ss.class_id = c.id
            JOIN teachers t ON ss.teacher_id = t.id
            JOIN users u ON t.user_id = u.id
            JOIN subjects s ON ss.subject_id = s.id
            WHERE ss.id = ?`, [newScheduleId]);

        // Send notification to students in the class
        try {
            // 1. Get all students in this class
            const [students] = await db.query(`
                SELECT s.user_id 
                FROM student_class_map scm
                JOIN students s ON scm.student_id = s.id
                WHERE scm.class_id = ?
            `, [class_id]);

            if (students.length > 0) {
                const subjectName = newSchedule[0].subject_name;
                const day = newSchedule[0].day_of_week;
                const message = `កាលវិភាគសិក្សាថ្មី៖ ${subjectName} នៅថ្ងៃ ${day}`;

                for (const student of students) {
                    if (student.user_id) {
                        sendNotificationToUser(student.user_id, 'កាលវិភាគសិក្សាថ្មី', message, { type: 'schedule' });
                    }
                }
            }
        } catch (notifyError) {
            console.error("Failed to send schedule notifications:", notifyError);
            // Don't fail the request if notification fails
        }

        sendSuccess(res, newSchedule[0], 201);
    } catch (error) {
        logError("Create Study Schedule", error);
        next(error);
    }
};

const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { class_id, teacher_id, subject_id, day_of_week, start_time, end_time } = req.body;

        // Fetch current schedule and its class info
        const [scheduleRows] = await db.query('SELECT ss.*, c.school_id, c.end_date, c.start_time as class_start_time, c.end_time as class_end_time FROM study_schedules ss JOIN classes c ON ss.class_id = c.id WHERE ss.id = ?', [id]);
        if (scheduleRows.length === 0) {
             return sendError(res, 'Study schedule not found', 404);
        }
        const currentSchedule = scheduleRows[0];

        // Check if current class is completed
        if (currentSchedule.end_date) {
            const endDate = new Date(currentSchedule.end_date);
            endDate.setHours(23, 59, 59, 999);
            if (new Date() > endDate) {
                return sendError(res, 'Cannot update schedule of a completed class.', 400);
            }
        }

        // Security Check: Ensure user can only update schedules in their school
        const userRole = req.user.role_name;
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            
            if (userRows.length === 0 || !userRows[0].school_id || userRows[0].school_id !== currentSchedule.school_id) {
                 return sendError(res, 'Access denied. You can only update schedules for your own school.', 403);
            }

            // If changing class_id, check new class ownership
            if (class_id) {
                 const [newClassRows] = await db.query('SELECT school_id, end_date, start_time, end_time FROM classes WHERE id = ?', [class_id]);
                 if (newClassRows.length === 0) {
                     return sendError(res, 'Target class not found.', 404);
                 }
                 const newClass = newClassRows[0];

                 if (userRows[0].school_id !== newClass.school_id) {
                     return sendError(res, 'Access denied. Target class is not in your school.', 403);
                 }

                 if (newClass.end_date) {
                    const newEndDate = new Date(newClass.end_date);
                    newEndDate.setHours(23, 59, 59, 999);
                    if (new Date() > newEndDate) {
                        return sendError(res, 'Cannot move schedule to a completed class.', 400);
                    }
                 }

                 if (newClass.start_time && (start_time || currentSchedule.start_time) < newClass.start_time) {
                    return sendError(res, 'Schedule start time cannot be earlier than class start time.', 400);
                 }
                 if (newClass.end_time && (end_time || currentSchedule.end_time) > newClass.end_time) {
                    return sendError(res, 'Schedule end time cannot be later than class end time.', 400);
                 }
            }
        }

        let internalTeacherId = currentSchedule.teacher_id;
        if (teacher_id) {
             const [teacherRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [teacher_id]);
             if (teacherRows.length === 0) {
                 return sendError(res, 'Invalid teacher_id. Teacher record not found.', 400);
             }
             internalTeacherId = teacherRows[0].id;
        }

        const checkDay = day_of_week || currentSchedule.day_of_week;
        const checkStart = start_time || currentSchedule.start_time;
        const checkEnd = end_time || currentSchedule.end_time;

        if (!class_id && currentSchedule.class_start_time && checkStart < currentSchedule.class_start_time) {
            return sendError(res, 'Schedule start time cannot be earlier than class start time.', 400);
        }
        if (!class_id && currentSchedule.class_end_time && checkEnd > currentSchedule.class_end_time) {
            return sendError(res, 'Schedule end time cannot be later than class end time.', 400);
        }

        if (checkStart >= checkEnd) {
            return sendError(res, 'Start time must be before end time.', 400);
        }

        const [conflicts] = await db.query(`
            SELECT id FROM study_schedules 
            WHERE teacher_id = ? 
            AND day_of_week = ? 
            AND start_time < ? 
            AND end_time > ? 
            AND id != ?
        `, [internalTeacherId, checkDay, checkEnd, checkStart, id]);

        if (conflicts.length > 0) {
            return sendError(res, 'Teacher already has a class scheduled during this time.', 409);
        }

        // Check for class conflicts
        const checkClassId = class_id || currentSchedule.class_id;
        const [classConflicts] = await db.query(`
            SELECT id FROM study_schedules 
            WHERE class_id = ? 
            AND day_of_week = ? 
            AND start_time < ? 
            AND end_time > ? 
            AND id != ?
        `, [checkClassId, checkDay, checkEnd, checkStart, id]);

        if (classConflicts.length > 0) {
            return sendError(res, 'Class already has a schedule during this time.', 409);
        }

        const fields = [];
        const values = [];

        if (class_id) {
            fields.push('class_id = ?');
            values.push(class_id);
        }

        if (teacher_id) {
            fields.push('teacher_id = ?');
            values.push(internalTeacherId);
        }

        if (subject_id) {
            fields.push('subject_id = ?');
            values.push(subject_id);
        }

        if (day_of_week) {
            fields.push('day_of_week = ?');
            values.push(day_of_week);
        }

        if (start_time) {
            fields.push('start_time = ?');
            values.push(start_time);
        }

        if (end_time) {
            fields.push('end_time = ?');
            values.push(end_time);
        }

        if (fields.length === 0) {
            return sendError(res, 'No fields provided for update.', 400);
        }

        values.push(id);

        const [result] = await db.query(
            `UPDATE study_schedules SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        if (result.affectedRows > 0) {
            sendSuccess(res, { message: 'Study schedule updated successfully' });
        } else {
            sendError(res, 'Study schedule not found', 404);
        }
    } catch (error) {
        logError("Update Study Schedule", error);
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Security Check: Ensure user can only delete schedules in their school
        const userRole = req.user.role_name;
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            const [scheduleRows] = await db.query('SELECT c.school_id FROM study_schedules ss JOIN classes c ON ss.class_id = c.id WHERE ss.id = ?', [id]);
            
            if (userRows.length === 0 || !userRows[0].school_id || scheduleRows.length === 0 || userRows[0].school_id !== scheduleRows[0].school_id) {
                 return sendError(res, 'Access denied. You can only delete schedules for your own school.', 403);
            }
        }

        const [result] = await db.query('DELETE FROM study_schedules WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            sendError(res, 'Study schedule not found', 404);
        }
    } catch (error) {
        logError("Delete Study Schedule", error);
        next(error);
    }
};

const getMySchedules = async (req, res, next) => {
    try {
        const userRole = (req.user.role_name || req.user.role || '').toLowerCase();
        if (userRole !== 'student') {
            return sendError(res, 'Access denied. This endpoint is for students only.', 403);
        }

        // Find the student's current class ID
        const [studentClassRows] = await db.query(`
            SELECT scm.class_id
            FROM students s
            JOIN student_class_map scm ON s.id = scm.student_id
            JOIN classes c ON scm.class_id = c.id
            WHERE s.user_id = ?
            ORDER BY c.id DESC LIMIT 1
        `, [req.user.id]);

        if (studentClassRows.length === 0) {
            return sendSuccess(res, []); // Student not in any class
        }

        const classId = studentClassRows[0].class_id;

        // Directly query for schedules of that specific class for clarity and reliability
        const query = `
            SELECT 
                ss.id,
                ss.class_id,
                ss.subject_id,
                t.user_id as teacher_id,
                ss.day_of_week,
                ss.start_time,
                ss.end_time,
                c.name as class_name,
                CONCAT(u.first_name, ' ', u.last_name) as teacher_name,
                s.name as subject_name
            FROM study_schedules ss
            JOIN classes c ON ss.class_id = c.id
            JOIN teachers t ON ss.teacher_id = t.id
            JOIN users u ON t.user_id = u.id
            JOIN subjects s ON ss.subject_id = s.id
            WHERE ss.class_id = ?
            ORDER BY FIELD(ss.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), ss.start_time
        `;
        
        const [schedules] = await db.query(query, [classId]);

        sendSuccess(res, schedules);
    } catch (error) {
        logError("Get My Study Schedules", error);
        next(error);
    }
};

module.exports = { getAll, getById, create, update, remove, getMySchedules };