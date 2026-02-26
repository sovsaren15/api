const db = require('../config/db');
const { logError } = require("../config/service");
const { createUser, updateUser, ROLES } = require('./user.service');
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

// Helper to sanitize inputs (handle empty strings from FormData)
const sanitize = (val) => (val === '' || val === 'null' || val === 'undefined' ? null : val);

const getAll = async (req, res, next) => {
    try {
        const baseQuery = `
            SELECT SQL_CALC_FOUND_ROWS
                u.id, u.first_name, u.last_name, u.email, u.phone_number, 
                p.school_id, p.place_of_birth, p.experience, p.status, p.image_profile,
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
        if (id === 'unassigned') {
            return getUnassigned(req, res, next);
        }

        const [rows] = await db.query(`
            SELECT 
                u.id, u.first_name, u.last_name, u.email, u.phone_number, u.address, 
                p.school_id, p.place_of_birth, p.experience, p.status, p.image_profile,
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
        if (!req.user || !req.user.id) {
            return sendError(res, 'User not authenticated', 401);
        }
        const principalUserId = req.user.id;

        const [principalDetails] = await db.query(
            `SELECT 
                p.school_id,
                p.place_of_birth,
                p.experience,
                p.status,
                s.name as school_name,
                u.first_name,
                u.last_name,
                u.email,
                u.phone_number,
                u.address,
                p.image_profile,
                p.sex,
                p.date_of_birth
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
        console.error("Error in getMe:", error);
        logError("Get Principal's Own Profile (getMe)", error);
        next(error);
    }
};

const create = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { first_name, last_name, email, password, phone_number, address, school_id, place_of_birth, experience, status, sex, date_of_birth } = req.body;

        let image_profile = null;
        if (req.file) {
            image_profile = `uploads/${req.file.filename}`;
        }
 
        // Step 1: Create the generic user record
        const userId = await createUser(connection, { first_name, last_name, email, password, phone_number: sanitize(phone_number), address: sanitize(address) }, ROLES.PRINCIPAL);
 
        // Step 2: Create the principal-specific record
        await connection.query(
            'INSERT INTO principals (user_id, school_id, place_of_birth, experience, status, image_profile, sex, date_of_birth) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, sanitize(school_id), sanitize(place_of_birth), experience || 0, status || 'active', image_profile, sanitize(sex), sanitize(date_of_birth)]
        );

        // Create Welcome Notification
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [userId, `សូមស្វាគមន៍! គណនីនាយកសាលារបស់អ្នកត្រូវបានបង្កើត។`]
        );

        // Notify the admin
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.id, `អ្នកបានបង្កើតគណនីនាយកសាលាឈ្មោះ ${first_name} ${last_name} ដោយជោគជ័យ។`]
        );

        await connection.commit();
        sendSuccess(res, { id: userId, message: 'Principal created successfully' }, 201);
    } catch (error) {
        await connection.rollback();
        // Handle Duplicate Entry (Email already exists)
        if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
            return sendError(res, 'អ៊ីមែលនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
        }
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
        let { id } = req.params;
        if (id === 'me') {
            id = req.user.id;
        }
        
        const userRole = (req.user.role_name || req.user.role || '').toLowerCase();
        
        // Fetch existing name if admin is updating another user
        let existingName = '';
        if (userRole === 'admin' && parseInt(id) !== req.user.id) {
             const [u] = await connection.query('SELECT first_name, last_name FROM users WHERE id = ?', [id]);
             if (u.length > 0) existingName = `${u[0].first_name} ${u[0].last_name}`;
        }

        const { first_name, last_name, phone_number, address, school_id, place_of_birth, experience, status, sex, date_of_birth } = req.body;

        let image_profile;
        if (req.file) {
            image_profile = `uploads/${req.file.filename}`;
        }

        // Step 1: Update the generic user details
        // We construct the object manually for user table fields
        const userFields = { first_name, last_name, phone_number: sanitize(phone_number), address: sanitize(address) };

        // Filter out undefined values
        const finalUserFields = {};
        for (const key in userFields) {
            if (userFields[key] !== undefined) finalUserFields[key] = userFields[key];
        }

        if (Object.keys(finalUserFields).length > 0) {
            await connection.query('UPDATE users SET ? WHERE id = ?', [finalUserFields, id]);
        }

        // Step 2: Update the principal-specific details
        const principalFieldsToUpdate = {};
        // Only allow updating school_id and status if not updating 'me' (Admin action)
        if (req.params.id !== 'me') {
            if (school_id !== undefined) principalFieldsToUpdate.school_id = sanitize(school_id);
            if (status !== undefined) principalFieldsToUpdate.status = status;
        }
        
        if (place_of_birth !== undefined) principalFieldsToUpdate.place_of_birth = sanitize(place_of_birth);
        if (experience !== undefined) principalFieldsToUpdate.experience = experience;
        if (sex !== undefined) principalFieldsToUpdate.sex = sex;
        if (date_of_birth !== undefined) principalFieldsToUpdate.date_of_birth = sanitize(date_of_birth);
        if (image_profile) principalFieldsToUpdate.image_profile = image_profile;

        if (Object.keys(principalFieldsToUpdate).length > 0) {
            await connection.query(
                'UPDATE principals SET ? WHERE user_id = ?',
                [principalFieldsToUpdate, id]
            );
        }

        // Notification: If Admin updates another principal's profile
        if (userRole === 'admin' && parseInt(id) !== req.user.id) {
            let message = `ព័ត៌មានគណនីរបស់អ្នកត្រូវបានកែប្រែដោយអ្នកគ្រប់គ្រង។`;
            if (status === 'inactive') message = `គណនីរបស់អ្នកត្រូវបានផ្អាកដោយអ្នកគ្រប់គ្រង។`;
            else if (status === 'active') message = `គណនីរបស់អ្នកត្រូវបានដាក់ឱ្យដំណើរការឡើងវិញ។`;

            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [id, message]
            );

            // Notify the admin
            const nameToUse = (first_name && last_name) ? `${first_name} ${last_name}` : existingName;
            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [req.user.id, `អ្នកបានកែប្រែព័ត៌មាននាយកសាលាឈ្មោះ ${nameToUse} ដោយជោគជ័យ។`]
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
        
        // Fetch name before delete
        const [userRows] = await db.query('SELECT first_name, last_name FROM users WHERE id = ?', [id]);

        // Deleting the user will trigger ON DELETE CASCADE for the corresponding principals record.
        const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            if (userRows.length > 0) {
                const name = `${userRows[0].first_name} ${userRows[0].last_name}`;
                await db.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [req.user.id, `អ្នកបានលុបគណនីនាយកសាលាឈ្មោះ ${name} ដោយជោគជ័យ។`]
                );
            }
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