const db = require('../config/db');
const { logError } = require("../config/service");
const { createUser, updateUser, ROLES } = require('./user.service');
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = `
            SELECT SQL_CALC_FOUND_ROWS
                u.id, u.first_name, u.last_name, u.email, u.phone_number, 
                p.school_id, p.place_of_birth, p.experience, p.status,
                s.name as school_name
            FROM users u
            JOIN principals p ON u.id = p.user_id
            LEFT JOIN schools s ON p.school_id = s.id
        `;

        const searchFields = ['u.first_name', 'u.last_name', 'u.email', 's.name'];

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            req.query,
            {
                // Allowed filters
                'p.status': 'status',
                'p.school_id': 'school_id'
            },
            searchFields,
            'u.last_name ASC, u.first_name ASC' // Default sort order
        );

        const [rows] = await db.query(query, params);
        const [countResult] = await db.query('SELECT FOUND_ROWS() as total');
        sendSuccess(res, { data: rows, total: countResult[0].total });
    } catch (error) {
        logError("Get All Principals", error);
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(`
            SELECT 
                u.id, u.first_name, u.last_name, u.email, u.phone_number, u.address, 
                p.school_id, p.place_of_birth, p.experience, p.status,
                s.name as school_name
            FROM users u
            JOIN principals p ON u.id = p.user_id
            LEFT JOIN schools s ON p.school_id = s.id
            WHERE u.id = ?
        `, [id]);

        if (rows.length > 0) {
            sendSuccess(res, rows[0]);
        } else {
            sendError(res, 'Principal not found', 404);
        }
    } catch (error) {
        logError("Get Principal By ID", error);
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        const principalUserId = req.user.id;

        const [principalDetails] = await db.query(
            `SELECT 
                p.school_id,
                s.name as school_name,
                u.first_name,
                u.last_name,
                u.email
             FROM principals p
             JOIN users u ON p.user_id = u.id
             LEFT JOIN schools s ON p.school_id = s.id
             WHERE p.user_id = ?`,
            [principalUserId]
        );

        if (principalDetails.length === 0) {
            return sendError(res, 'Principal profile not found.', 404);
        }
        sendSuccess(res, principalDetails[0]);
    } catch (error) {
        logError("Get Principal's Own Profile (getMe)", error);
        next(error);
    }
};

const create = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { first_name, last_name, email, password, phone_number, address, school_id, place_of_birth, experience, status } = req.body;
 
        // Step 1: Create the generic user record
        const userId = await createUser(connection, { first_name, last_name, email, password, phone_number, address }, ROLES.PRINCIPAL);
 
        // Step 2: Create the principal-specific record
        await connection.query(
            'INSERT INTO principals (user_id, school_id, place_of_birth, experience, status) VALUES (?, ?, ?, ?, ?)',
            [userId, school_id, place_of_birth, experience, status || 'active']
        );

        await connection.commit();
        sendSuccess(res, { id: userId, message: 'Principal created successfully' }, 201);
    } catch (error) {
        await connection.rollback();
        logError("Create Principal", error);
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
        const { first_name, last_name, phone_number, address, school_id, place_of_birth, experience, status } = req.body;

        // Step 1: Update the generic user details
        await updateUser(connection, id, { first_name, last_name, phone_number, address });

        // Step 2: Update the principal-specific details
        const principalFieldsToUpdate = {};
        if (school_id !== undefined) principalFieldsToUpdate.school_id = school_id;
        if (place_of_birth !== undefined) principalFieldsToUpdate.place_of_birth = place_of_birth;
        if (experience !== undefined) principalFieldsToUpdate.experience = experience;
        if (status !== undefined) principalFieldsToUpdate.status = status;

        if (Object.keys(principalFieldsToUpdate).length > 0) {
            await connection.query(
                'UPDATE principals SET ? WHERE user_id = ?',
                [principalFieldsToUpdate, id]
            );
        }

        await connection.commit();
        sendSuccess(res, { message: 'Principal updated successfully' });
    } catch (error) {
        await connection.rollback();
        logError("Update Principal", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Deleting the user will trigger ON DELETE CASCADE for the corresponding principals record.
        const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            sendError(res, 'Principal not found', 404);
        }
    } catch (error) {
        logError("Delete Principal", error);
        next(error);
    }
};

const getUnassigned = async (req, res, next) => {
    try {
        const [rows] = await db.query(`
            SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) as name
            FROM users u
            JOIN principals p ON u.id = p.user_id
            WHERE p.school_id IS NULL
        `);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get Unassigned Principals", error);
        next(error);
    }
};

const getPrincipalDashboard = async (req, res, next) => {
    try {
        const principalUserId = req.user.id; // Assumes auth middleware provides req.user.id

        // 1. Get the principal's assigned school
        const [principalDetails] = await db.query(
            `SELECT p.school_id, s.name as school_name, s.address, s.logo 
             FROM principals p
             LEFT JOIN schools s ON p.school_id = s.id
             WHERE p.user_id = ?`,
            [principalUserId]
        );

        if (principalDetails.length === 0 || !principalDetails[0].school_id) {
            // Principal exists but is not assigned to a school
            return sendSuccess(res, { school: null, stats: {}, recent_events: [] });
        }

        const schoolId = principalDetails[0].school_id;
        const school = {
            id: schoolId,
            name: principalDetails[0].school_name,
            address: principalDetails[0].address,
            logo: principalDetails[0].logo
        };

        // 2. Get school statistics in parallel for performance
        const [
            [totalTeachersResult],
            [totalStudentsResult],
            [totalClassesResult],
            [recentEvents]
        ] = await Promise.all([
            db.query('SELECT COUNT(*) as count FROM teachers WHERE school_id = ?', [schoolId]),
            db.query('SELECT COUNT(*) as count FROM students WHERE school_id = ?', [schoolId]),
            db.query('SELECT COUNT(*) as count FROM classes WHERE school_id = ?', [schoolId]),
            db.query('SELECT id, title, start_date as date FROM events WHERE school_id = ? ORDER BY start_date DESC LIMIT 4', [schoolId])
        ]);

        const stats = {
            total_teachers: totalTeachersResult[0].count,
            total_students: totalStudentsResult[0].count,
            total_classes: totalClassesResult[0].count,
        };

        // 3. Send the complete dashboard data object
        sendSuccess(res, { school, stats, recent_events: recentEvents });
    } catch (error) {
        logError("Get Principal Dashboard", error);
        next(error);
    }
};

module.exports = { getAll, getById, getMe, create, update, remove, getUnassigned, getPrincipalDashboard };