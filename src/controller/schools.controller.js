const db = require('../config/db');
const {logError} = require("../config/service");
const { sendSuccess, sendError } = require('./response.helper');

const getAll = async (req, res, next) => {
    try {
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';
        let query = `
            SELECT 
                s.*,
                CONCAT(u.first_name, ' ', u.last_name) as director_name,
                (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id) as total_teachers,
                (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) as total_students
            FROM schools s
            LEFT JOIN principals p ON p.school_id = s.id
            LEFT JOIN users u ON u.id = p.user_id
        `;

        const params = [];
        if (userRole === 'principal') {
            query += ` WHERE p.user_id = ?`;
            params.push(req.user.id);
        }

        query += ` ORDER BY s.name`;

        const [rows] = await db.query(query, params);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get All Schools", error);
        // Pass error to the centralized error handler
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(`
            SELECT 
                s.*, 
                p.user_id as principal_id,
                CONCAT(u.last_name, ' ', u.first_name) as director_name,
                (SELECT COUNT(*) FROM teachers WHERE school_id = s.id) as total_teachers,
                (SELECT COUNT(*) FROM students WHERE school_id = s.id) as total_students,
                (SELECT COUNT(*) FROM classes WHERE school_id = s.id) as total_classes
            FROM schools s
            LEFT JOIN principals p ON s.id = p.school_id
            LEFT JOIN users u ON p.user_id = u.id
            LEFT JOIN roles r ON u.role_id = r.id AND r.name = 'principal'
            WHERE s.id = ?
        `, [id]);

        if (rows.length > 0) {
            sendSuccess(res, rows[0]);
        } else {
            sendError(res, 'School not found', 404);
        }
    } catch (error) {
        logError("Get School By ID", error);
        next(error);
    }
};

const create = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        let { name, address, phone_number, email, status, founded_date, school_level, logo, cover, principal_id, website, description } = req.body;

        // Check for duplicate school name
        if (name && name.trim() !== '') {
            const [existingName] = await connection.query('SELECT id FROM schools WHERE name = ?', [name.trim()]);
            if (existingName.length > 0) {
                await connection.rollback();
                return sendError(res, 'ឈ្មោះសាលានេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
            }
        }

        // Check for duplicate phone number
        if (phone_number && phone_number.trim() !== '') {
            const [existingPhone] = await connection.query('SELECT id FROM schools WHERE phone_number = ?', [phone_number.trim()]);
            if (existingPhone.length > 0) {
                await connection.rollback();
                return sendError(res, 'លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
            }
        }

        // Check for duplicate email
        if (email && email.trim() !== '') {
            const [existingEmail] = await connection.query('SELECT id FROM schools WHERE email = ?', [email.trim()]);
            if (existingEmail.length > 0) {
                await connection.rollback();
                return sendError(res, 'អ៊ីមែលនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
            }
        }

        if (req.files) {
            if (req.files.logo && req.files.logo.length > 0) {
                logo = `uploads/${req.files.logo[0].filename}`;
            }
            if (req.files.cover && req.files.cover.length > 0) {
                cover = `uploads/${req.files.cover[0].filename}`;
            }
        }

        const [result] = await connection.query(
            'INSERT INTO schools (name, address, phone_number, email, status, founded_date, school_level, logo, cover, website, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, address, phone_number, email, status, founded_date, school_level, logo, cover, website, description]
        );
        const schoolId = result.insertId;

        // If a principal_id was provided, assign them to the new school
        if (principal_id) {
            await updatePrincipalAssignment(connection, schoolId, principal_id);
            // Notify the assigned principal
            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [principal_id, `អ្នកត្រូវបានចាត់តាំងជានាយកសាលាសម្រាប់សាលា៖ ${name}`]
            );
        }

        // Notify the admin
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.id, `អ្នកបានបង្កើតសាលា "${name}" ដោយជោគជ័យ។`]
        );

        await connection.commit();
        sendSuccess(res, { id: schoolId, ...req.body }, 201);
    } catch (error) {
        await connection.rollback();
        if (error.message === 'Phone number cannot be duplicated') {
            return sendError(res, 'លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
        }
        logError("Create School", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Helper function to manage principal assignment within a transaction.
 * It handles un-assigning the old principal and assigning the new one.
 * @param {object} connection - The database connection object.
 * @param {number} schoolId - The ID of the school being updated.
 * @param {number|null} newPrincipalId - The user_id of the new principal, or null to un-assign.
 */
const updatePrincipalAssignment = async (connection, schoolId, newPrincipalId) => {
    // Coerce empty strings or falsy values to null for database consistency.
    const newPrincipalUserId = newPrincipalId ? Number(newPrincipalId) : null;

    // 1. Un-assign any principal currently assigned to this school
    // We use UPDATE to set school_id to NULL instead of DELETE to preserve the principal's profile data
    await connection.query('UPDATE principals SET school_id = NULL WHERE school_id = ?', [schoolId]);

    // Assign the new principal if a new one is provided
    if (newPrincipalUserId) {
        // Update the principal's record to assign them to the school
        await connection.query('UPDATE principals SET school_id = ? WHERE user_id = ?', [schoolId, newPrincipalUserId]);
    }
};

const update = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        const userRole = (req.user.role_name || req.user.role || '').toLowerCase();

        // Security Check: Ensure principal can only update their own school.
        if (userRole === 'principal') {
            const [principalRows] = await connection.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            if (principalRows[0].school_id !== parseInt(id, 10)) {
                await connection.rollback();
                return sendError(res, 'Access denied. You can only update your own school.', 403);
            }
        } else if (userRole !== 'admin') {
            await connection.rollback();
            return sendError(res, 'Access denied.', 403);
        }

        // First, verify the school exists. This is more robust.
        const [existingSchool] = await connection.query('SELECT id, name FROM schools WHERE id = ?', [id]);
        if (existingSchool.length === 0) {
            await connection.rollback(); // No need to proceed
            return sendError(res, 'School not found', 404);
        }

        let { name, address, phone_number, email, status, founded_date, school_level, logo, cover, principal_id, website, description } = req.body;

        // Check for duplicate school name, excluding the current school
        if (name && name.trim() !== '') {
            const [existingName] = await connection.query('SELECT id FROM schools WHERE name = ? AND id != ?', [name.trim(), id]);
            if (existingName.length > 0) {
                await connection.rollback();
                return sendError(res, 'ឈ្មោះសាលានេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
            }
        }

        // Check for duplicate phone number, excluding the current school
        if (phone_number && phone_number.trim() !== '') {
            const [existingPhone] = await connection.query('SELECT id FROM schools WHERE phone_number = ? AND id != ?', [phone_number.trim(), id]);
            if (existingPhone.length > 0) {
                await connection.rollback();
                return sendError(res, 'លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
            }
        }

        // Check for duplicate email, excluding the current school
        if (email && email.trim() !== '') {
            const [existingEmail] = await connection.query('SELECT id FROM schools WHERE email = ? AND id != ?', [email.trim(), id]);
            if (existingEmail.length > 0) {
                await connection.rollback();
                return sendError(res, 'អ៊ីមែលនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
            }
        }

        if (req.files) {
            if (req.files.logo && req.files.logo.length > 0) {
                logo = `uploads/${req.files.logo[0].filename}`;
            }
            if (req.files.cover && req.files.cover.length > 0) {
                cover = `uploads/${req.files.cover[0].filename}`;
            }
        }
        
        // Principals cannot change principal_id or status
        if (userRole === 'principal') {
            principal_id = undefined;
            status = undefined;
        }
        
        const updatableFields = { name, address, phone_number, email, status, founded_date, school_level, logo, cover, website, description };
        const fieldsToUpdate = {};

        // Filter out undefined values to only update the fields that were actually provided
        for (const key in updatableFields) {
            if (updatableFields[key] !== undefined) {
                fieldsToUpdate[key] = updatableFields[key];
            }
        }

        if (Object.keys(fieldsToUpdate).length > 0) {
            // Dynamically update only the provided fields
            await connection.query(
                'UPDATE schools SET ? WHERE id = ?',
                [fieldsToUpdate, id]
            );
        }

        // Handle principal assignment if principal_id is part of the request
        if (principal_id !== undefined) {
            // Use the helper function for consistency
            await updatePrincipalAssignment(connection, id, principal_id);
        }

        // Notification: If Admin updates the school, notify the principal(s)
        if (userRole === 'admin') {
            const [principals] = await connection.query('SELECT user_id FROM principals WHERE school_id = ?', [id]);
            for (const p of principals) {
                let message = `ព័ត៌មានសាលារបស់អ្នកត្រូវបានកែប្រែដោយអ្នកគ្រប់គ្រង។`;
                if (status === 'inactive') message = `សាលារបស់អ្នកត្រូវបានផ្អាកដំណើរការដោយអ្នកគ្រប់គ្រង។`;
                else if (status === 'active') message = `សាលារបស់អ្នកត្រូវបានដាក់ឱ្យដំណើរការឡើងវិញ។`;

                await connection.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [p.user_id, message]
                );
            }

            const schoolName = name || existingSchool[0].name;
            // Notify the admin
            await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [req.user.id, `អ្នកបានកែប្រែព័ត៌មានសាលា "${schoolName}" ដោយជោគជ័យ។`]
            );
        }

        await connection.commit();
        sendSuccess(res, { message: 'School updated successfully' });
    } catch (error) {
        await connection.rollback();
        if (error.message === 'Phone number cannot be duplicated') {
            return sendError(res, 'លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
        }
        logError("Update School", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const remove = async (req, res, next) => {
    // WARNING: This is a hard delete. Deleting a school is a high-risk operation
    // that can lead to orphaned records (teachers, students, classes, etc.) if
    // foreign key constraints with ON DELETE CASCADE are not properly configured
    // in the database. Consider implementing a soft delete (e.g., setting status to 'inactive') instead.
    try {
        const { id } = req.params;

        // Notify principal before deletion
        const [schoolRows] = await db.query('SELECT name FROM schools WHERE id = ?', [id]);
        let schoolName = '';
        if (schoolRows.length > 0) {
            schoolName = schoolRows[0].name;
            const [principals] = await db.query('SELECT user_id FROM principals WHERE school_id = ?', [id]);
            for (const p of principals) {
                await db.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [p.user_id, `សាលា "${schoolName}" ត្រូវបានលុបចេញពីប្រព័ន្ធ។`]
                );
            }
        }

        const [result] = await db.query('DELETE FROM schools WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            if (schoolName) {
                // Notify the admin
                await db.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [req.user.id, `អ្នកបានលុបសាលា "${schoolName}" ដោយជោគជ័យ។`]
                );
            }
            res.status(204).send();
        } else {
            sendError(res, 'School not found', 404);
        }
    } catch (error) {
        logError("Delete School", error);
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
