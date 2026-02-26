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
                s.date_of_birth, s.enrollment_date, s.school_id, s.image_profile, s.status,
                sch.name as school_name
            FROM users u
            JOIN students s ON u.id = s.user_id
            LEFT JOIN schools sch ON s.school_id = sch.id
            LEFT JOIN student_class_map scm ON s.id = scm.student_id
        `;

        const searchFields = ['u.first_name', 'u.last_name', 'u.email'];
        const allowedFilters = {
            'scm.class_id': 'class_id',
            's.status': 'status'
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
            SELECT 
                u.id, s.id as student_id, u.first_name, u.last_name, u.email, u.phone_number, u.address, 
                s.date_of_birth, s.enrollment_date, s.school_id, s.image_profile, s.status,
                GROUP_CONCAT(c.name SEPARATOR ', ') as class_names,
                GROUP_CONCAT(DISTINCT CONCAT(c.id, ':', c.name) SEPARATOR ',') as classes_info
            FROM users u
            JOIN students s ON u.id = s.user_id
            LEFT JOIN student_class_map scm ON s.id = scm.student_id
            LEFT JOIN classes c ON scm.class_id = c.id
            WHERE u.id = ?
            GROUP BY u.id
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
        const { first_name, last_name, email, password, phone_number, address, date_of_birth, enrollment_date, status } = req.body;
        
        // Fix: Convert empty strings to null for date fields (FormData sends empty strings for empty inputs)
        const dob = date_of_birth === '' ? null : date_of_birth;
        const enrollment = enrollment_date === '' ? null : enrollment_date;

        let schoolIdForNewStudent = req.body.school_id; // Allow admin to specify

        // Handle image upload
        let image_profile = req.body.image_profile; // Fallback to URL if provided
        if (req.file) {
            image_profile = `uploads/${req.file.filename}`;
        }

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
            'INSERT INTO students (user_id, school_id, date_of_birth, enrollment_date, image_profile, status) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, schoolIdForNewStudent, dob, enrollment, image_profile, status || 'active']
        );

        // Notify the creator
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.id, `អ្នកបានបង្កើតគណនីសិស្សឈ្មោះ ${first_name} ${last_name} ដោយជោគជ័យ។`]
        );

        await connection.commit();
        sendSuccess(res, { id: userId, message: 'Student created successfully' }, 201);
    } catch (error) {
        await connection.rollback();
        // Handle Duplicate Entry (Email already exists)
        if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
            return sendError(res, 'អ៊ីមែលនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ', 409);
        }
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
        const { first_name, last_name, phone_number, address, date_of_birth, enrollment_date, status } = req.body;

        // Handle image upload
        let image_profile = req.body.image_profile;
        if (req.file) {
            image_profile = `uploads/${req.file.filename}`;
        }

        // Step 1: Update the generic user details
        await updateUser(connection, id, { first_name, last_name, phone_number, address });

        // Step 2: Update the student-specific details
        const studentUpdates = {};
        if (date_of_birth !== undefined) studentUpdates.date_of_birth = date_of_birth;
        if (enrollment_date !== undefined) studentUpdates.enrollment_date = enrollment_date;
        if (image_profile !== undefined) studentUpdates.image_profile = image_profile;
        if (status !== undefined) studentUpdates.status = status;

        if (Object.keys(studentUpdates).length > 0) {
            await connection.query(
                'UPDATE students SET ? WHERE user_id = ?',
                [studentUpdates, id]
            );
        }

        const [studentRows] = await connection.query('SELECT s.school_id, u.first_name, u.last_name FROM students s JOIN users u ON s.user_id = u.id WHERE s.user_id = ?', [id]);

        // Notify the actor
        if (studentRows.length > 0) {
             const { first_name: oldFirst, last_name: oldLast } = studentRows[0];
             const nameToUse = (first_name && last_name) ? `${first_name} ${last_name}` : `${oldFirst} ${oldLast}`;
             
             const role = req.user.role_name ? req.user.role_name.toLowerCase() : '';
             let message = `អ្នកបានកែប្រែព័ត៌មានសិស្សឈ្មោះ ${nameToUse} ដោយជោគជ័យ។`;
             
             if (role === 'teacher') {
                 message = JSON.stringify({
                     text: message,
                     link: `/teacher/students/${id}`
                 });
             }

             await connection.query(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [req.user.id, message]
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

        const [studentRows] = await db.query('SELECT s.school_id, u.first_name, u.last_name FROM students s JOIN users u ON s.user_id = u.id WHERE s.user_id = ?', [id]);

        // Deleting from users will cascade to students table
        const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            // Notify the actor
            if (studentRows.length > 0) {
                const { first_name, last_name } = studentRows[0];
                await db.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [req.user.id, `អ្នកបានលុបគណនីសិស្សឈ្មោះ ${first_name} ${last_name} ដោយជោគជ័យ។`]
                );
            }
            res.status(204).send();
        } else {
            sendError(res, 'Student not found', 404);
        }
    } catch (error) {
        logError("Delete Student", error);
        next(error);
    }
};

const getByTeacherId = async (req, res, next) => {
    try {
        const { teacherId } = req.params; // Treated as User ID

        // Resolve User ID to Teacher ID and School ID
        const [teacherRows] = await db.query('SELECT id, school_id FROM teachers WHERE user_id = ?', [teacherId]);
        
        if (teacherRows.length === 0) {
            return sendError(res, 'Teacher not found', 404);
        }
        
        const internalTeacherId = teacherRows[0].id;
        const teacherSchoolId = teacherRows[0].school_id;

        // Security Check
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';
        
        if (userRole === 'principal') {
             const [principalRows] = await db.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
             if (!principalRows.length || principalRows[0].school_id !== teacherSchoolId) {
                 return sendError(res, 'Access denied. Teacher belongs to a different school.', 403);
             }
        } else if (userRole === 'teacher') {
             if (req.user.id !== parseInt(teacherId)) {
                 return sendError(res, 'Access denied. You can only view your own students.', 403);
             }
        } else if (userRole !== 'admin') {
            return sendError(res, 'Access denied.', 403);
        }

        const query = `
            SELECT DISTINCT
                u.id, s.id as student_id, u.first_name, u.last_name, u.email, u.phone_number, u.address,
                s.date_of_birth, s.enrollment_date, s.school_id, s.image_profile, s.status,
                sch.name as school_name
            FROM users u
            JOIN students s ON u.id = s.user_id
            LEFT JOIN schools sch ON s.school_id = sch.id
            JOIN student_class_map scm ON s.id = scm.student_id
            JOIN teacher_class_map tcm ON scm.class_id = tcm.class_id
            WHERE tcm.teacher_id = ?
            ORDER BY u.last_name, u.first_name
        `;
        
        const [rows] = await db.query(query, [internalTeacherId]);
        sendSuccess(res, rows);

    } catch (error) {
        logError("Get Students By Teacher ID", error);
        next(error);
    }
};

const getByPrincipalId = async (req, res, next) => {
    try {
        const { principalId } = req.params; // Treated as User ID

        const [principalRows] = await db.query('SELECT school_id FROM principals WHERE user_id = ?', [principalId]);
        if (principalRows.length === 0) {
            return sendError(res, 'Principal not found', 404);
        }
        const schoolId = principalRows[0].school_id;

        if (!schoolId) {
             return sendSuccess(res, []); 
        }

        // Security Check
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';
        if (userRole === 'principal') {
             if (req.user.id !== parseInt(principalId)) {
                 return sendError(res, 'Access denied. You can only view your own school\'s students.', 403);
             }
        } else if (userRole === 'teacher') {
             const [teacherRows] = await db.query('SELECT school_id FROM teachers WHERE user_id = ?', [req.user.id]);
             if (!teacherRows.length || teacherRows[0].school_id !== schoolId) {
                 return sendError(res, 'Access denied. You can only view students in your own school.', 403);
             }
        } else if (userRole !== 'admin') {
             return sendError(res, 'Access denied.', 403);
        }

        const query = `
            SELECT 
                u.id, s.id as student_id, u.first_name, u.last_name, u.email, u.phone_number, u.address,
                s.date_of_birth, s.enrollment_date, s.school_id, s.image_profile, s.status,
                sch.name as school_name
            FROM users u
            JOIN students s ON u.id = s.user_id
            LEFT JOIN schools sch ON s.school_id = sch.id
            WHERE s.school_id = ?
            ORDER BY u.last_name, u.first_name
        `;

        const [rows] = await db.query(query, [schoolId]);
        sendSuccess(res, rows);

    } catch (error) {
        logError("Get Students By Principal ID", error);
        next(error);
    }
};

const getMe = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const [rows] = await db.query(`
            SELECT 
                u.id, s.id as student_id, u.first_name, u.last_name, u.email, u.phone_number, u.address, 
                s.date_of_birth, s.enrollment_date, s.school_id, s.image_profile, s.status,
                sch.name as school_name, sch.logo as school_logo,
                GROUP_CONCAT(c.name SEPARATOR ', ') as class_names,
                GROUP_CONCAT(DISTINCT CONCAT(c.id, ':', c.name) SEPARATOR ',') as classes_info
            FROM users u
            JOIN students s ON u.id = s.user_id
            LEFT JOIN schools sch ON s.school_id = sch.id
            LEFT JOIN student_class_map scm ON s.id = scm.student_id
            LEFT JOIN classes c ON scm.class_id = c.id
            WHERE u.id = ?
            GROUP BY u.id
        `, [userId]);

        if (rows.length > 0) {
            sendSuccess(res, rows[0]);
        } else {
            sendError(res, 'Student profile not found', 404);
        }
    } catch (error) {
        logError("Get Student Profile (Me)", error);
        next(error);
    }
};

module.exports = {
    getAll,
    getById,
    create,
    update,
    remove,
    getByTeacherId,
    getByPrincipalId,
    getMe
};