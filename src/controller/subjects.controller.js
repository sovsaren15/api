const db = require('../config/db');
const { logError } = require("../config/service");
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = 'SELECT SQL_CALC_FOUND_ROWS id, school_id, name, description FROM subjects';
        const allowedFilters = { 'school_id': 'school_id' }; // Initialize with school_id allowed
        const searchFields = ['name', 'description'];

        // Role-based security: Principals/Teachers see only their school's subjects.
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';

        if (userRole === 'principal' || userRole === 'teacher' || userRole === 'student') {
            let table = '';
            if (userRole === 'principal') table = 'principals';
            else if (userRole === 'teacher') table = 'teachers';
            else if (userRole === 'student') table = 'students';

            const [userSchool] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);

            if (userSchool.length > 0 && userSchool[0].school_id) {
                // Force filter by the user's school_id
                req.query.school_id = userSchool[0].school_id;
            } else {
                // If user has no school, they see no subjects.
                return sendSuccess(res, { data: [], total: 0 });
            }
        }

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            req.query,
            allowedFilters,
            searchFields,
            'name ASC' // Default sort
        );

        const [rows] = await db.query(query, params);
        const [countResult] = await db.query('SELECT FOUND_ROWS() as total');
        sendSuccess(res, { data: rows, total: countResult[0].total });
    } catch (error) {
        logError("Get All Subjects", error);
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query('SELECT * FROM subjects WHERE id = ?', [id]);
        if (rows.length > 0) {
            sendSuccess(res, rows[0]);
        } else {
            sendError(res, 'Subject not found', 404);
        }
    } catch (error) {
        logError("Get Subject By ID", error);
        next(error);
    }
};

const getBySchoolId = async (req, res, next) => {
    try {
        let school_id = req.params.school_id || req.params.schoolId;
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';

        // Security check: Ensure principal/teacher can only access their own school's subjects
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            
            if (userRows.length === 0 || !userRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            
            const userSchoolId = userRows[0].school_id;
            
            if (school_id === 'me') {
                school_id = userSchoolId;
            } else if (parseInt(school_id, 10) !== userSchoolId) {
                return sendError(res, 'Access denied. You can only view subjects from your assigned school.', 403);
            }
        } else if (userRole !== 'admin') {
            return sendError(res, 'Access denied.', 403);
        }

        const baseQuery = 'SELECT SQL_CALC_FOUND_ROWS id, school_id, name, description FROM subjects';
        const queryParams = { ...req.query, school_id };
        const allowedFilters = { 'school_id': 'school_id' };
        const searchFields = ['name', 'description'];

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            queryParams,
            allowedFilters,
            searchFields,
            'name ASC'
        );

        const [rows] = await db.query(query, params);
        const [countResult] = await db.query('SELECT FOUND_ROWS() as total');
        
        // Returns data and total count for frontend pagination
        sendSuccess(res, { data: rows, total: countResult[0].total });
    } catch (error) {
        logError("Get Subjects By School ID", error);
        next(error);
    }
};

const create = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        let { school_id, name, description } = req.body;

        // Security: Principals can only create subjects for their own school
        if (req.user.role_name === 'principal') {
            const [principalRows] = await connection.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            // If school_id is provided, it must match
            if (school_id && parseInt(school_id) !== principalRows[0].school_id) {
                 await connection.rollback();
                 return sendError(res, 'Access denied. You can only create subjects for your own school.', 403);
            }
            school_id = principalRows[0].school_id;
        }

        if (!school_id || !name) {
            await connection.rollback();
            return sendError(res, 'school_id and name are required.', 400);
        }
        const [result] = await connection.query(
            'INSERT INTO subjects (school_id, name, description) VALUES (?, ?, ?)',
            [school_id, name, description]
        );

        // Notifications
        const [principals] = await connection.query('SELECT user_id FROM principals WHERE school_id = ?', [school_id]);
        for (const p of principals) {
            if (p.user_id !== req.user.id) {
                await connection.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [p.user_id, `មុខវិជ្ជាថ្មី "${name}" ត្រូវបានបង្កើត។`]
                );
            }
        }

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.id, `អ្នកបានបង្កើតមុខវិជ្ជា "${name}" ដោយជោគជ័យ។`]
        );

        await connection.commit();
        sendSuccess(res, { id: result.insertId, name, description, school_id }, 201);
    } catch (error) {
        if (connection) await connection.rollback();
        logError("Create Subject", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const update = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { name, description } = req.body;

        // Fetch existing subject
        const [subjectRows] = await connection.query('SELECT school_id, name FROM subjects WHERE id = ?', [id]);
        if (subjectRows.length === 0) {
            await connection.rollback();
            return sendError(res, 'Subject not found', 404);
        }
        const existingSubject = subjectRows[0];
        const schoolId = existingSubject.school_id;

        // Security check for principals
        if (req.user.role_name === 'principal') {
            const [principalRows] = await connection.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            
            if (schoolId !== principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'Access denied. You can only update subjects in your own school.', 403);
            }
        }

        await connection.query('UPDATE subjects SET name = ?, description = ? WHERE id = ?', [name, description, id]);
        
        // Notifications
        const subjectName = name || existingSubject.name;
        const [principals] = await connection.query('SELECT user_id FROM principals WHERE school_id = ?', [schoolId]);
        for (const p of principals) {
            if (p.user_id !== req.user.id) {
                await connection.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [p.user_id, `ព័ត៌មានមុខវិជ្ជា "${subjectName}" ត្រូវបានកែប្រែ។`]
                );
            }
        }

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.id, `អ្នកបានកែប្រែមុខវិជ្ជា "${subjectName}" ដោយជោគជ័យ។`]
        );

        await connection.commit();
        sendSuccess(res, { message: 'Subject updated successfully' });
    } catch (error) {
        if (connection) await connection.rollback();
        logError("Update Subject", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const remove = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        // Fetch existing subject
        const [subjectRows] = await connection.query('SELECT school_id, name FROM subjects WHERE id = ?', [id]);
        if (subjectRows.length === 0) {
            await connection.rollback();
            return sendError(res, 'Subject not found', 404);
        }
        const { school_id, name } = subjectRows[0];

        // Security check for principals
        if (req.user.role_name === 'principal') {
            const [principalRows] = await connection.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            
            if (school_id !== principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'Access denied. You can only delete subjects in your own school.', 403);
            }
        }

        await connection.query('DELETE FROM subjects WHERE id = ?', [id]);
        
        // Notifications
        const [principals] = await connection.query('SELECT user_id FROM principals WHERE school_id = ?', [school_id]);
        for (const p of principals) {
            if (p.user_id !== req.user.id) {
                await connection.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [p.user_id, `មុខវិជ្ជា "${name}" ត្រូវបានលុបចេញពីប្រព័ន្ធ។`]
                );
            }
        }

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.id, `អ្នកបានលុបមុខវិជ្ជា "${name}" ដោយជោគជ័យ។`]
        );

        await connection.commit();
        res.status(204).send();
    } catch (error) {
        if (connection) await connection.rollback();
        logError("Delete Subject", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

module.exports = { getAll, getById, getBySchoolId, create, update, remove };