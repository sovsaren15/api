const db = require('../config/db');
const { logError } = require("../config/service");
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

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

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            req.query,
            { 'ss.class_id': 'class_id', 't.user_id': 'teacher_id', 'ss.day_of_week': 'day_of_week' },
            [],
            'ss.day_of_week, ss.start_time'
        );

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

        // Security Check: Ensure user can only add schedules to classes in their school
        const userRole = req.user.role_name;
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            const [classRows] = await db.query('SELECT school_id FROM classes WHERE id = ?', [class_id]);
            
            if (userRows.length === 0 || !userRows[0].school_id || classRows.length === 0 || userRows[0].school_id !== classRows[0].school_id) {
                return sendError(res, 'Access denied. You can only create schedules for your own school.', 403);
            }
        }

        // Resolve teacher_id (User ID) to internal Teacher ID
        const [teacherRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [teacher_id]);
        if (teacherRows.length === 0) {
            return sendError(res, 'Invalid teacher_id. Teacher record not found.', 400);
        }
        const internalTeacherId = teacherRows[0].id;

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

        // Security Check: Ensure user can only update schedules in their school
        const userRole = req.user.role_name;
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            
            // Check existing schedule ownership
            const [scheduleRows] = await db.query('SELECT c.school_id FROM study_schedules ss JOIN classes c ON ss.class_id = c.id WHERE ss.id = ?', [id]);
            
            if (userRows.length === 0 || !userRows[0].school_id || scheduleRows.length === 0 || userRows[0].school_id !== scheduleRows[0].school_id) {
                 return sendError(res, 'Access denied. You can only update schedules for your own school.', 403);
            }

            // If changing class_id, check new class ownership
            if (class_id) {
                 const [newClassRows] = await db.query('SELECT school_id FROM classes WHERE id = ?', [class_id]);
                 if (newClassRows.length === 0 || userRows[0].school_id !== newClassRows[0].school_id) {
                     return sendError(res, 'Access denied. Target class is not in your school.', 403);
                 }
            }
        }

        const fields = [];
        const values = [];

        if (class_id) {
            fields.push('class_id = ?');
            values.push(class_id);
        }

        if (teacher_id) {
            // Resolve teacher_id (User ID) to internal Teacher ID
            const [teacherRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [teacher_id]);
            if (teacherRows.length === 0) {
                return sendError(res, 'Invalid teacher_id. Teacher record not found.', 400);
            }
            fields.push('teacher_id = ?');
            values.push(teacherRows[0].id);
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

module.exports = { getAll, getById, create, update, remove };