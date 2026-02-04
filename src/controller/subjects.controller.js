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

        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
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
        const school_id = req.params.school_id || req.params.schoolId;
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';

        // Security check: Ensure principal/teacher can only access their own school's subjects
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            
            if (userRows.length === 0 || !userRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            
            const userSchoolId = userRows[0].school_id;
            if (parseInt(school_id, 10) !== userSchoolId) {
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
    try {
        let { school_id, name, description } = req.body;

        // Security: Principals can only create subjects for their own school
        if (req.user.role_name === 'principal') {
            const [principalRows] = await db.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            // If school_id is provided, it must match
            if (school_id && parseInt(school_id) !== principalRows[0].school_id) {
                 return sendError(res, 'Access denied. You can only create subjects for your own school.', 403);
            }
            school_id = principalRows[0].school_id;
        }

        if (!school_id || !name) {
            return sendError(res, 'school_id and name are required.', 400);
        }
        const [result] = await db.query(
            'INSERT INTO subjects (school_id, name, description) VALUES (?, ?, ?)',
            [school_id, name, description]
        );
        sendSuccess(res, { id: result.insertId, name, description, school_id }, 201);
    } catch (error) {
        logError("Create Subject", error);
        next(error);
    }
};

const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        // Security check for principals
        if (req.user.role_name === 'principal') {
            const [principalRows] = await db.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            
            const [subjectRows] = await db.query('SELECT school_id FROM subjects WHERE id = ?', [id]);
            if (subjectRows.length === 0) {
                return sendError(res, 'Subject not found', 404);
            }
            
            if (subjectRows[0].school_id !== principalRows[0].school_id) {
                return sendError(res, 'Access denied. You can only update subjects in your own school.', 403);
            }
        }

        const [result] = await db.query('UPDATE subjects SET name = ?, description = ? WHERE id = ?', [name, description, id]);
        if (result.affectedRows > 0) {
            sendSuccess(res, { message: 'Subject updated successfully' });
        } else {
            sendError(res, 'Subject not found', 404);
        }
    } catch (error) {
        logError("Update Subject", error);
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Security check for principals
        if (req.user.role_name === 'principal') {
            const [principalRows] = await db.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            
            const [subjectRows] = await db.query('SELECT school_id FROM subjects WHERE id = ?', [id]);
            if (subjectRows.length === 0) {
                return sendError(res, 'Subject not found', 404);
            }
            
            if (subjectRows[0].school_id !== principalRows[0].school_id) {
                return sendError(res, 'Access denied. You can only delete subjects in your own school.', 403);
            }
        }

        const [result] = await db.query('DELETE FROM subjects WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            sendError(res, 'Subject not found', 404);
        }
    } catch (error) {
        logError("Delete Subject", error);
        next(error);
    }
};

module.exports = { getAll, getById, getBySchoolId, create, update, remove };