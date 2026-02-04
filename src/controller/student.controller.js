const db = require('../config/db');
const { logError } = require("../config/service");
const { createUser, updateUser, ROLES } = require('./user.service');
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = `
            SELECT SQL_CALC_FOUND_ROWS DISTINCT
                u.id, s.id as student_id, u.first_name, u.last_name, u.email, u.phone_number, u.address,
                s.date_of_birth, s.enrollment_date, s.school_id,
                sch.name as school_name
            FROM users u
            JOIN students s ON u.id = s.user_id
            LEFT JOIN schools sch ON s.school_id = sch.id
            LEFT JOIN student_class_map scm ON s.id = scm.student_id
        `;

        const searchFields = ['u.first_name', 'u.last_name', 'u.email'];
        const allowedFilters = {
            'scm.class_id': 'class_id'
        };

        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';

        // Security: If the user is a principal or teacher, force filter by their school
        if (userRole === 'principal' || userRole === 'teacher') {
            const userTable = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${userTable} WHERE user_id = ?`, [req.user.id]);
            if (userRows.length === 0 || !userRows[0].school_id) {
                return sendSuccess(res, { data: [], total: 0 }); // Principal not assigned, return empty list
            }
            // Add a WHERE clause to the query builder to enforce school_id
            req.query.school_id = userRows[0].school_id;
            allowedFilters['s.school_id'] = 'school_id';
        } else {
            // Admin can filter by any school_id
            allowedFilters['s.school_id'] = 'school_id';
        }

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            req.query,
            allowedFilters,
            searchFields,
            'u.last_name ASC, u.first_name ASC' // Default sort
        );

        const [rows] = await db.query(query, params);
        const [countResult] = await db.query('SELECT FOUND_ROWS() as total');
        sendSuccess(res, { data: rows, total: countResult[0].total });
    } catch (error) {
        logError("Get All Students", error);
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(`
            SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.address, s.date_of_birth, s.enrollment_date, s.school_id
            FROM users u
            JOIN students s ON u.id = s.user_id
            WHERE u.id = ?
        `, [id]);

        if (rows.length > 0) {
            sendSuccess(res, rows[0]);
        } else {
            sendError(res, 'Student not found', 404);
        }
    } catch (error) {
        logError("Get Student By ID", error);
        next(error);
    }
};

const create = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { first_name, last_name, email, password, phone_number, address, date_of_birth, enrollment_date } = req.body;
        let schoolIdForNewStudent = req.body.school_id; // Allow admin to specify

        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';

        // Security: If the user is a principal or teacher, enforce their own school_id
        if (userRole === 'principal' || userRole === 'teacher') {
            const userTable = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await connection.query(`SELECT school_id FROM ${userTable} WHERE user_id = ?`, [req.user.id]);
            if (userRows.length === 0 || !userRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school and cannot create students.', 403);
            }
            schoolIdForNewStudent = userRows[0].school_id; // Override any provided school_id
        } else if (userRole === 'admin' && !schoolIdForNewStudent) {
            await connection.rollback();
            return sendError(res, 'school_id is required for an admin to create a student.', 400);
        }
 
        // Step 1: Create the generic user record
        const userId = await createUser(connection, { first_name, last_name, email, password, phone_number, address }, ROLES.STUDENT);
 
        // Step 2: Create the student-specific record
        await connection.query(
            'INSERT INTO students (user_id, school_id, date_of_birth, enrollment_date) VALUES (?, ?, ?, ?)',
            [userId, schoolIdForNewStudent, date_of_birth, enrollment_date]
        );

        await connection.commit();
        sendSuccess(res, { id: userId, message: 'Student created successfully' }, 201);
    } catch (error) {
        await connection.rollback();
        logError("Create Student", error);
        next(error);
    } finally {
        connection.release();
    }
};

const update = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { first_name, last_name, phone_number, address, date_of_birth } = req.body;

        // Step 1: Update the generic user details
        await updateUser(connection, id, { first_name, last_name, phone_number, address });

        // Step 2: Update the student-specific details
        if (date_of_birth !== undefined) {
            await connection.query(
                'UPDATE students SET date_of_birth = ? WHERE user_id = ?',
                [date_of_birth, id]
            );
        }

        await connection.commit();
        sendSuccess(res, { message: 'Student updated successfully' });
    } catch (error) {
        await connection.rollback();
        logError("Update Student", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Deleting from users will cascade to students table
        const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            sendError(res, 'Student not found', 404);
        }
    } catch (error) {
        logError("Delete Student", error);
        next(error);
    }
};

module.exports = {
    getAll,
    getById,
    create,
    update,
    remove,
};