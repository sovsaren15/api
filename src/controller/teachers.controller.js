const db = require('../config/db');
const { logError } = require("../config/service");
const { createUser, updateUser, ROLES } = require('./user.service');
const { sendSuccess, sendError } = require('./response.helper');

const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = `
            SELECT SQL_CALC_FOUND_ROWS
                u.id, u.first_name, u.last_name, u.email, u.phone_number, u.address,
                t.school_id, t.place_of_birth, t.sex, t.date_of_birth, t.experience, t.status, t.image_profile,
                s.name as school_name
            FROM users u
            JOIN teachers t ON u.id = t.user_id
            LEFT JOIN schools s ON t.school_id = s.id
        `;

        const searchFields = ['u.first_name', 'u.last_name', 'u.email'];
        const allowedFilters = { 't.status': 'status' };

        const userRole = req.user.role_name || req.user.role;
        const role = userRole ? userRole.toLowerCase() : '';

        // Security: If the user is a principal or teacher, force filter by their school
        if (role === 'principal' || role === 'teacher') {
            const table = role === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            if (userRows.length === 0 || !userRows[0].school_id) {
                return sendSuccess(res, { data: [], total: 0 }); // Not assigned to a school
            }
            // Add a WHERE clause to the query builder to enforce school_id
            req.query.school_id = userRows[0].school_id;
            allowedFilters['t.school_id'] = 'school_id';
        } else if (role === 'admin') {
            // Admin can filter by any school_id
            allowedFilters['t.school_id'] = 'school_id';
        }

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            req.query,
            allowedFilters,
            searchFields,
            'u.last_name ASC, u.first_name ASC' // Default sort order
        );

        const [rows] = await db.query(query, params);
        const [countResult] = await db.query('SELECT FOUND_ROWS() as total');
        sendSuccess(res, { data: rows, total: countResult[0].total });
    } catch (error) {
        logError("Get All Teachers", error);
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        let { id } = req.params;
        if (id === 'me') {
            id = req.user.id;
        }
        const [rows] = await db.query(`
            SELECT 
                u.id, u.first_name, u.last_name, u.email, u.phone_number, u.address,
                t.school_id, t.place_of_birth, t.sex, t.date_of_birth, t.experience, t.status, t.image_profile,
                s.name as school_name
            FROM users u
            JOIN teachers t ON u.id = t.user_id
            LEFT JOIN schools s ON t.school_id = s.id
            WHERE u.id = ? -- Corrected to use the user's ID from the users table
        `, [id]);

        if (rows.length > 0) {
            const teacher = rows[0];
            const userRole = req.user.role_name || req.user.role;
            const role = userRole ? userRole.toLowerCase() : '';
            // Security Check: Ensure principal can only view teachers in their own school.
            if ((role === 'principal' || role === 'teacher') && id != req.user.id) {
                const table = role === 'principal' ? 'principals' : 'teachers';
                const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
                if (userRows.length === 0 || !userRows[0].school_id) {
                    return sendError(res, 'You are not assigned to a school.', 403);
                }
                if (teacher.school_id !== userRows[0].school_id) {
                    return sendError(res, 'Access denied. You can only view teachers from your assigned school.', 403);
                }
            }
            sendSuccess(res, rows[0]);
        } else {
            sendError(res, 'Teacher not found', 404);
        }
    } catch (error) {
        logError("Get Teacher By ID", error);
        next(error);
    }
};
const getBySchoolId = async (req, res, next) => {
    try {
        const school_id = req.params.school_id || req.params.id;

        // Handle route conflict: if /teachers/me hits this endpoint instead of getById
        if (school_id === 'me') {
            req.params.id = 'me';
            return getById(req, res, next);
        }

        const userRole = req.user.role_name || req.user.role;
        const role = userRole ? userRole.toLowerCase() : '';
        
        // Security check based on user role
        if (role === 'principal' || role === 'teacher') {
            const table = role === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            if (userRows.length === 0 || !userRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            const assignedSchoolId = userRows[0].school_id;

            // A principal/teacher can only view teachers from their own assigned school
            if (parseInt(school_id, 10) !== assignedSchoolId) {
                return sendError(res, 'Access denied. You can only view teachers from your assigned school.', 403);
            }
            // If it matches, school_id remains as is.
        } else if (role !== 'admin') {
            // For any other role (e.g., teacher, student, parent), deny access to this endpoint
            return sendError(res, 'Access denied. You do not have permission to view these records.', 403);
        }
        // If the user is an 'admin', or a 'principal' and the school_id matches their assigned school, proceed.

        // Refactor to use QueryBuilder for consistency and to enable pagination/filtering.
        const baseQuery = `
            SELECT SQL_CALC_FOUND_ROWS
                u.id, u.first_name, u.last_name, u.email, u.phone_number, u.address,
                t.school_id, t.place_of_birth, t.sex, t.date_of_birth, t.experience, t.status, t.image_profile,
                s.name as school_name
            FROM users u
            JOIN teachers t ON u.id = t.user_id
            LEFT JOIN schools s ON t.school_id = s.id
        `;

        const searchFields = ['u.first_name', 'u.last_name', 'u.email'];
        const allowedFilters = { 't.status': 'status' };

        // Create a clean queryParams object to avoid conflicts with global req.query
        const queryParams = {
            ...req.query, // Inherit pagination (page, limit) and sorting (sort_by, order)
            school_id: school_id, // Force school_id from URL (overrides any school_id in query)
        };
        allowedFilters['t.school_id'] = 'school_id';

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            queryParams,
            allowedFilters,
            searchFields,
            'u.last_name ASC, u.first_name ASC'
        );

        // The QueryBuilder correctly handles all necessary WHERE clauses, including the school_id.
        const [rows] = await db.query(query, params);
        const [countResult] = await db.query('SELECT FOUND_ROWS() as total');
        sendSuccess(res, { data: rows, total: countResult[0].total });
    } catch (error) {
        logError("Get Teachers By School ID", error);
        next(error);
    }
};

const create = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        let { 
            first_name, last_name, email, password, phone_number, address,
            place_of_birth, sex, date_of_birth, experience, status, image_profile
        } = req.body;

        const userRole = req.user.role_name || req.user.role;
        const role = userRole ? userRole.toLowerCase() : '';
        // Determine who is creating the teacher
        const principalUserId = req.user.id;
        let schoolIdForNewTeacher;

        if (role === 'principal') {
            // A principal can only add a teacher to their own school.
            const [principalRows] = await connection.query('SELECT school_id FROM principals WHERE user_id = ?', [principalUserId]);

            if (principalRows.length === 0 || !principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school and cannot add teachers.', 403);
            }
            schoolIdForNewTeacher = principalRows[0].school_id;
        } else if (role === 'admin') {
            // An admin must provide the school_id in the request body
            if (!req.body.school_id) {
                await connection.rollback();
                return sendError(res, 'school_id is required for an admin to create a teacher.', 400);
            }
            schoolIdForNewTeacher = req.body.school_id;
        }

        // Handle image upload
        if (req.file) {
            image_profile = `uploads/${req.file.filename}`;
        }
 
        // Step 1: Create the generic user record
        const userId = await createUser(connection, { first_name, last_name, email, password, phone_number, address }, ROLES.TEACHER);
 
        // Step 2: Create the teacher-specific record
        await connection.query(
            `INSERT INTO teachers 
                (user_id, school_id, place_of_birth, sex, date_of_birth, experience, status, image_profile) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, schoolIdForNewTeacher, place_of_birth, sex, date_of_birth, experience, status || 'active', image_profile]
        );

        await connection.commit();
        sendSuccess(res, { id: userId, message: 'Teacher created successfully' }, 201);
    } catch (error) {
        await connection.rollback();
        logError("Create Teacher", error);
        next(error);
    } finally {
        connection.release();
    }
};

const update = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        let { id } = req.params;
        if (id === 'me') {
            id = req.user.id;
        }
        let { 
            first_name, last_name, phone_number, address, 
            school_id, place_of_birth, sex, date_of_birth, experience, status, image_profile
        } = req.body;

        // Handle image upload
        if (req.file) {
            image_profile = `uploads/${req.file.filename}`;
        }

        const userRole = req.user.role_name || req.user.role;
        const role = userRole ? userRole.toLowerCase() : '';
        // Security Check: Ensure a principal can only update teachers in their own school.
        if (role === 'principal') {
            const [principalRows] = await connection.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school and cannot update teachers.', 403);
            }
            const principalSchoolId = principalRows[0].school_id;

            // Verify the teacher being updated belongs to the principal's school.
            const [teacherRows] = await connection.query('SELECT school_id FROM teachers WHERE user_id = ?', [id]);
            if (teacherRows.length === 0) {
                await connection.rollback();
                return sendError(res, 'Teacher not found.', 404);
            }
            if (teacherRows[0].school_id !== principalSchoolId) {
                await connection.rollback();
                return sendError(res, 'Access denied. You can only update teachers in your own school.', 403);
            }
            // Also, prevent a principal from moving a teacher to another school.
            if (school_id && school_id !== principalSchoolId) {
                return sendError(res, 'Access denied. You cannot move a teacher to a different school.', 403);
            }
        }

        // Step 1: Update the generic user details
        await updateUser(connection, id, { first_name, last_name, phone_number, address });

        // Step 2: Update the teacher-specific details
        const teacherFieldsToUpdate = {};
        if (school_id !== undefined) teacherFieldsToUpdate.school_id = school_id;
        if (place_of_birth !== undefined) teacherFieldsToUpdate.place_of_birth = place_of_birth;
        if (sex !== undefined) teacherFieldsToUpdate.sex = sex;
        if (date_of_birth !== undefined) teacherFieldsToUpdate.date_of_birth = date_of_birth;
        if (experience !== undefined) teacherFieldsToUpdate.experience = experience;
        if (status !== undefined) teacherFieldsToUpdate.status = status;
        if (image_profile !== undefined) teacherFieldsToUpdate.image_profile = image_profile;

        if (Object.keys(teacherFieldsToUpdate).length > 0) {
            await connection.query(
                'UPDATE teachers SET ? WHERE user_id = ?',
                [teacherFieldsToUpdate, id]
            );
        }

        await connection.commit();
        sendSuccess(res, { message: 'Teacher updated successfully' });
    } catch (error) {
        await connection.rollback();
        logError("Update Teacher", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;

        const userRole = req.user.role_name || req.user.role;
        const role = userRole ? userRole.toLowerCase() : '';
        // Security Check: Ensure a principal can only delete teachers in their own school.
        if (role === 'principal') {
            const [principalRows] = await db.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school and cannot delete teachers.', 403);
            }
            const principalSchoolId = principalRows[0].school_id;

            // Verify the teacher being deleted belongs to the principal's school.
            const [teacherRows] = await db.query('SELECT school_id FROM teachers WHERE user_id = ?', [id]);
            if (teacherRows.length === 0) {
                return sendError(res, 'Teacher not found.', 404);
            }
            if (teacherRows[0].school_id !== principalSchoolId) {
                return sendError(res, 'Access denied. You can only delete teachers in your own school.', 403);
            }
        }

        // Deleting the user will trigger ON DELETE CASCADE for the corresponding teachers record.
        const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            sendError(res, 'Teacher not found', 404);
        }
    } catch (error) {
        logError("Delete Teacher", error);
        next(error);
    }
};

const getTeacherDashboard = async (req, res, next) => {
    try {
        const teacherUserId = req.user.id; // From auth middleware

        // 1. Get the teacher's details, including their primary ID and school
        const [teacherDetails] = await db.query(
            `SELECT 
                t.id as teacher_id, -- This is the PK for the teachers table
                t.school_id,
                t.image_profile,
                s.name as school_name,
                s.logo as school_logo
             FROM teachers t
             LEFT JOIN schools s ON t.school_id = s.id
             WHERE t.user_id = ?`,
            [teacherUserId]
        );

        if (teacherDetails.length === 0) {
            return sendError(res, 'Teacher profile not found.', 404);
        }

        const { teacher_id, school_id, school_name, school_logo } = teacherDetails[0];

        if (!school_id) {
            // Teacher exists but is not assigned to a school
            return sendSuccess(res, { school: null, stats: {}, todays_classes: [], recent_events: [] });
        }

        // 2. Get statistics in parallel for performance
        const [
            [totalClassesResult],
            [totalStudentsResult],
            [todaysClasses],
            [recentEvents]
        ] = await Promise.all([
            // Count distinct classes the teacher teaches in
            db.query('SELECT COUNT(DISTINCT class_id) as count FROM teacher_class_map WHERE teacher_id = ?', [teacher_id]),
            // Count distinct students in the classes the teacher teaches
            db.query('SELECT COUNT(DISTINCT student_id) as count FROM student_class_map WHERE class_id IN (SELECT class_id FROM teacher_class_map WHERE teacher_id = ?)', [teacher_id]),
            // Get today's classes for the teacher
            db.query(`
                SELECT ss.start_time, ss.end_time, c.name as class_name, s.name as subject_name
                FROM study_schedules ss
                JOIN classes c ON ss.class_id = c.id
                JOIN subjects s ON ss.subject_id = s.id
                WHERE ss.teacher_id = ? AND ss.day_of_week = DAYNAME(CURDATE())
                ORDER BY ss.start_time ASC
            `, [teacher_id]),
            // Get recent school events (upcoming or very recent)
            db.query('SELECT id, title, start_date, end_date FROM events WHERE school_id = ? AND end_date >= CURDATE() - INTERVAL 7 DAY ORDER BY start_date ASC LIMIT 5', [school_id])
        ]);

        const dashboardData = {
            school: { id: school_id, name: school_name, logo: school_logo },
            stats: { total_classes: totalClassesResult[0].count, total_students: totalStudentsResult[0].count },
            todays_classes: todaysClasses,
            recent_events: recentEvents
        };

        sendSuccess(res, dashboardData);
    } catch (error) {
        logError("Get Teacher Dashboard", error);
        next(error);
    }
};

module.exports = { getAll, getById, getBySchoolId, create, update, remove, getTeacherDashboard };