const db = require('../config/db');
const {logError} = require("../config/service");
const { sendSuccess, sendError } = require('./response.helper');

const getAll = async (req, res, next) => {
    try {
        let query = `
            SELECT SQL_CALC_FOUND_ROWS
                c.id, c.name, c.school_id, c.academic_year, c.start_time, c.end_time, c.start_date, c.end_date,
                TeacherNames.teacher_names,
                SubjectNames.subject_names
            FROM classes c
            LEFT JOIN (
                SELECT 
                    ss_teacher.class_id, 
                    GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name) SEPARATOR ', ') as teacher_names
                FROM study_schedules ss_teacher
                JOIN teachers t ON ss_teacher.teacher_id = t.id
                JOIN users u ON t.user_id = u.id
                GROUP BY ss_teacher.class_id
            ) AS TeacherNames ON c.id = TeacherNames.class_id
            LEFT JOIN (
                SELECT 
                    ss.class_id, 
                    GROUP_CONCAT(DISTINCT s.name SEPARATOR ', ') as subject_names
                FROM study_schedules ss
                JOIN subjects s ON ss.subject_id = s.id
                GROUP BY ss.class_id
            ) AS SubjectNames ON c.id = SubjectNames.class_id
        `;

        const allowedFilters = {};
        const searchFields = ['c.name', 'TeacherNames.teacher_names', 'SubjectNames.subject_names'];

        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';

        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userSchool] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            if (userSchool.length > 0 && userSchool[0].school_id) {
                req.query.school_id = userSchool[0].school_id;
                allowedFilters['c.school_id'] = 'school_id';
            } else {
                return sendSuccess(res, { data: [], total: 0 });
            }
        } else {
            allowedFilters['c.school_id'] = 'school_id';
        }

        const { query: finalQuery, params } = require('./query.helper').buildQuery(query, req.query, allowedFilters, searchFields, 'c.name ASC');

        const [rows] = await db.query(finalQuery, params);
        const [countResult] = await db.query('SELECT FOUND_ROWS() as total');
        sendSuccess(res, { data: rows, total: countResult[0].total });
    } catch (error) {
        logError("Get All Classes", error);
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Fetch class details
        const [classRows] = await db.query('SELECT * FROM classes WHERE id = ?', [id]);
        if (classRows.length === 0) {
            return sendError(res, 'Class not found', 404);
        }
        const classDetails = classRows[0];

        // Security check: Ensure principal can only access classes in their own school.
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';

        if (userRole === 'principal' || userRole === 'teacher') {
            const userTable = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${userTable} WHERE user_id = ?`, [req.user.id]);
            if (userRows.length === 0 || !userRows[0].school_id || classDetails.school_id !== userRows[0].school_id) {
                return sendError(res, 'Access denied. You can only view classes from your assigned school.', 403);
            }
        } else if (userRole !== 'admin') {
            // Any other role that is not admin, principal, or teacher is denied.
            return sendError(res, 'Access denied.', 403);
        }

        // Fetch associated study schedules
        const [scheduleRows] = await db.query(`
            SELECT 
                ss.id, ss.subject_id, ss.teacher_id, ss.day_of_week, ss.start_time, ss.end_time,
                s.name as subject_name,
                CONCAT(u.first_name, ' ', u.last_name) as teacher_name
            FROM study_schedules ss
            LEFT JOIN subjects s ON ss.subject_id = s.id
            LEFT JOIN teachers t ON ss.teacher_id = t.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE ss.class_id = ?
            ORDER BY FIELD(ss.day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), ss.start_time
        `, [id]);

        // Fetch associated students
        const [studentRows] = await db.query(`
            SELECT s.id, u.first_name, u.last_name, u.email, s.date_of_birth
            FROM student_class_map scm
            JOIN students s ON scm.student_id = s.id
            JOIN users u ON s.user_id = u.id
            WHERE scm.class_id = ?
            ORDER BY u.last_name, u.first_name
        `, [id]);

        sendSuccess(res, { 
            ...classDetails, 
            schedules: scheduleRows,
            students: studentRows 
        });
    } catch (error) {
        logError("Get Class By ID", error);
        next(error);
    }
};

const create = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        let { name, school_id, academic_year, start_time, end_time, start_date, end_date, schedules } = req.body;
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';
        const userId = req.user.id;

        // Security Check: Ensure only authorized roles can create classes and only for their own school.
        if (userRole === 'principal') {
            // If the user is a principal, they can only create a class for their own school.
            const [principalRows] = await connection.query('SELECT school_id FROM principals WHERE user_id = ?', [userId]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school and cannot create classes.', 403);
            }
            // Override any provided school_id with the principal's assigned school_id.
            school_id = principalRows[0].school_id;
        } else if (userRole === 'teacher') {
            // If the user is a teacher, they can only create a class for their own school.
            const [teacherRows] = await connection.query('SELECT school_id FROM teachers WHERE user_id = ?', [userId]);
            if (teacherRows.length === 0 || !teacherRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school and cannot create classes.', 403);
            }
            // Override any provided school_id with the teacher's assigned school_id.
            school_id = teacherRows[0].school_id;
        } else if (userRole !== 'admin') {
            // If the user is not a principal, teacher, or admin, deny access.
            return sendError(res, 'You do not have permission to create classes.', 403);
        }

        // Add validation for required fields
        if (!name || !school_id || !academic_year) {
            return sendError(res, 'Missing required fields: name, school_id, academic_year', 400);
        }

        const [result] = await connection.query(
            'INSERT INTO classes (name, school_id, academic_year, start_time, end_time, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)', 
            [name, school_id, academic_year, start_time || null, end_time || null, start_date || null, end_date || null]
        );
        const classId = result.insertId;

        // If schedules are provided, insert them into the study_schedules table
        if (schedules && Array.isArray(schedules) && schedules.length > 0) {
            const scheduleValues = [];
            const teacherIds = new Set();
            for (const schedule of schedules) {
                const { subject_id, teacher_id, day_of_week, start_time, end_time } = schedule;
                if (!subject_id || !teacher_id || !day_of_week || !start_time || !end_time) {
                    await connection.rollback();
                    return sendError(res, 'Each schedule must include subject_id, teacher_id, day_of_week, start_time, and end_time.', 400);
                }

                // Resolve teacher_id (User ID) to internal Teacher ID
                const [teacherRows] = await connection.query('SELECT id, school_id FROM teachers WHERE user_id = ?', [teacher_id]);
                if (teacherRows.length === 0) {
                    await connection.rollback();
                    return sendError(res, `Teacher with User ID ${teacher_id} not found.`, 400);
                }
                const internalTeacherId = teacherRows[0].id;
                const targetSchoolId = parseInt(school_id, 10);

                if (teacherRows[0].school_id !== targetSchoolId) {
                    await connection.rollback();
                    return sendError(res, `Teacher (User ID ${teacher_id}) belongs to school ${teacherRows[0].school_id}, but class is in school ${targetSchoolId}.`, 400);
                }

                const [subjectRows] = await connection.query('SELECT school_id FROM subjects WHERE id = ?', [subject_id]);
                if (subjectRows.length === 0) {
                    await connection.rollback();
                    return sendError(res, `Subject ID ${subject_id} not found.`, 400);
                }
                if (subjectRows[0].school_id !== targetSchoolId) {
                    await connection.rollback();
                    return sendError(res, `Subject ID ${subject_id} belongs to school ${subjectRows[0].school_id}, but class is in school ${targetSchoolId}.`, 400);
                }

                scheduleValues.push([classId, internalTeacherId, subject_id, day_of_week, start_time, end_time]);
                teacherIds.add(internalTeacherId);
            }

            if (scheduleValues.length > 0) {
                await connection.query(
                    'INSERT INTO study_schedules (class_id, teacher_id, subject_id, day_of_week, start_time, end_time) VALUES ?',
                    [scheduleValues]
                );
            }

            if (teacherIds.size > 0) {
                const teacherClassMapValues = Array.from(teacherIds).map(tid => [tid, classId]);
                await connection.query(
                    'INSERT IGNORE INTO teacher_class_map (teacher_id, class_id) VALUES ?',
                    [teacherClassMapValues]
                );
            }
        }

        // Notifications
        const [principals] = await connection.query('SELECT user_id FROM principals WHERE school_id = ?', [school_id]);
        for (const p of principals) {
            if (p.user_id !== req.user.id) {
                await connection.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [p.user_id, `ថ្នាក់រៀនថ្មី "${name}" ត្រូវបានបង្កើត។`]
                );
            }
        }

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.id, `អ្នកបានបង្កើតថ្នាក់រៀន "${name}" ដោយជោគជ័យ។`]
        );

        await connection.commit();
        sendSuccess(res, { id: classId, name, school_id, academic_year, start_time, end_time, start_date, end_date, schedules_count: schedules ? schedules.length : 0 }, 201);
    } catch (error) {
        if (connection) await connection.rollback();
        logError("Create Class", error);
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
        const {
            name,
            school_id,
            academic_year,
            start_time,
            end_time,
            start_date,
            end_date,
            schedules
        } = req.body;

        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';
        const userId = req.user.id;
        let schoolId = null;

        // 1. Determine user's school
        if (userRole === 'principal') {
            const [principalRows] = await connection.query(
                'SELECT school_id FROM principals WHERE user_id = ?',
                [userId]
            );
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to any school.', 403);
            }
            schoolId = principalRows[0].school_id;
        } else if (userRole === 'teacher') {
            const [teacherRows] = await connection.query(
                'SELECT school_id FROM teachers WHERE user_id = ?',
                [userId]
            );
            if (teacherRows.length === 0 || !teacherRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to any school.', 403);
            }
            schoolId = teacherRows[0].school_id;
        } else if (userRole !== 'admin') {
            await connection.rollback();
            return sendError(res, 'Unauthorized: Only principals, teachers, and admins can update classes.', 403);
        }

        // 2. Verify class exists and belongs to the correct school
        const [classRows] = await connection.query(
            'SELECT school_id, name FROM classes WHERE id = ?',
            [id]
        );

        if (classRows.length === 0) {
            await connection.rollback();
            return sendError(res, 'Class not found', 404);
        }

        const classSchoolId = classRows[0].school_id;
        const existingName = classRows[0].name;
        let targetSchoolId = classSchoolId;

        // Non-admin users can only update classes in their own school
        if (schoolId && classSchoolId !== schoolId) {
            await connection.rollback();
            return sendError(res, 'Access denied: You can only update classes in your own school.', 403);
        }

        // Allow Admin to change the school_id
        if (!schoolId && school_id) {
            targetSchoolId = parseInt(school_id, 10);
        }

        // 3. Build update query for class (only update provided fields)
        const classUpdateFields = [];
        const classUpdateValues = [];

        if (school_id !== undefined && !schoolId) {
            classUpdateFields.push('school_id = ?');
            classUpdateValues.push(school_id);
        }

        if (name !== undefined) {
            classUpdateFields.push('name = ?');
            classUpdateValues.push(name.trim());
        }
        if (academic_year !== undefined) {
            classUpdateFields.push('academic_year = ?');
            classUpdateValues.push(academic_year.trim());
        }
        if (start_time !== undefined) {
            classUpdateFields.push('start_time = ?');
            classUpdateValues.push(start_time || null);
        }
        if (end_time !== undefined) {
            classUpdateFields.push('end_time = ?');
            classUpdateValues.push(end_time || null);
        }
        if (start_date !== undefined) {
            classUpdateFields.push('start_date = ?');
            classUpdateValues.push(start_date || null);
        }
        if (end_date !== undefined) {
            classUpdateFields.push('end_date = ?');
            classUpdateValues.push(end_date || null);
        }

        // If no fields to update for class itself, skip class update
        if (classUpdateFields.length > 0) {
            classUpdateValues.push(id);
            await connection.query(
                `UPDATE classes SET ${classUpdateFields.join(', ')} WHERE id = ?`,
                classUpdateValues
            );
        }

        // 4. Handle schedules (only if provided in request)
        if (schedules !== undefined) {
            // Delete existing schedules and teacher-class mapping
            await connection.query('DELETE FROM study_schedules WHERE class_id = ?', [id]);
            await connection.query('DELETE FROM teacher_class_map WHERE class_id = ?', [id]);

            if (Array.isArray(schedules) && schedules.length > 0) {
                const scheduleValues = [];
                const teacherIds = new Set();

                for (const sch of schedules) {
                    const { subject_id, teacher_id, day_of_week, start_time, end_time } = sch;

                    if (!subject_id || !teacher_id || !day_of_week || !start_time || !end_time) {
                        await connection.rollback();
                        return sendError(res, 'Each schedule entry must include: subject_id, teacher_id, day_of_week, start_time, end_time', 400);
                    }

                    // Convert user_id → internal teacher_id
                    const [teacherRows] = await connection.query(
                        'SELECT id, school_id FROM teachers WHERE user_id = ?',
                        [teacher_id]
                    );

                    if (teacherRows.length === 0) {
                        await connection.rollback();
                        return sendError(res, `Teacher with user_id ${teacher_id} not found`, 400);
                    }

                    const internalTeacherId = teacherRows[0].id;
                    const teacherSchoolId = teacherRows[0].school_id;

                    // Security: teacher must belong to the same school as the class
                    if (teacherSchoolId !== targetSchoolId) {
                        await connection.rollback();
                        return sendError(res, `Teacher (user_id: ${teacher_id}) belongs to school ${teacherSchoolId}, but class is in school ${targetSchoolId}`, 403);
                    }

                    // Security: subject must belong to the same school
                    const [subjectRows] = await connection.query(
                        'SELECT school_id FROM subjects WHERE id = ?',
                        [subject_id]
                    );

                    if (subjectRows.length === 0) {
                        await connection.rollback();
                        return sendError(res, `Subject ${subject_id} not found`, 404);
                    }

                    if (subjectRows[0].school_id !== targetSchoolId) {
                        await connection.rollback();
                        return sendError(res, `Subject ${subject_id} belongs to school ${subjectRows[0].school_id}, but class is in school ${targetSchoolId}`, 403);
                    }

                    scheduleValues.push([
                        id,
                        internalTeacherId,
                        subject_id,
                        day_of_week,
                        start_time,
                        end_time
                    ]);

                    teacherIds.add(internalTeacherId);
                }

                // Insert new schedules
                if (scheduleValues.length > 0) {
                    await connection.query(
                        'INSERT INTO study_schedules (class_id, teacher_id, subject_id, day_of_week, start_time, end_time) VALUES ?',
                        [scheduleValues]
                    );
                }

                // Update teacher_class_map
                if (teacherIds.size > 0) {
                    const mapValues = Array.from(teacherIds).map(tid => [tid, id]);
                    await connection.query(
                        'INSERT IGNORE INTO teacher_class_map (teacher_id, class_id) VALUES ?',
                        [mapValues]
                    );
                }
            }
            // If schedules = [] → we already deleted everything → class has no schedules now
        }

        // Notifications
        const className = name || existingName;
        const [principals] = await connection.query('SELECT user_id FROM principals WHERE school_id = ?', [targetSchoolId]);
        for (const p of principals) {
            if (p.user_id !== req.user.id) {
                await connection.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [p.user_id, `ព័ត៌មានថ្នាក់រៀន "${className}" ត្រូវបានកែប្រែ។`]
                );
            }
        }

        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.id, `អ្នកបានកែប្រែថ្នាក់រៀន "${className}" ដោយជោគជ័យ។`]
        );

        await connection.commit();

        // Return updated class info (you can fetch fresh data if needed)
        sendSuccess(res, {
            message: 'Class updated successfully',
            class_id: parseInt(id),
            updated_fields: {
                name: name !== undefined ? name : undefined,
                academic_year: academic_year !== undefined ? academic_year : undefined,
                // ... other fields
            },
            schedules_updated: schedules !== undefined,
            schedules_count: schedules?.length || 0
        });

    } catch (error) {
        if (connection) await connection.rollback();
        logError("Update Class", error);
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

        // Fetch class info for notification and validation
        const [classRows] = await connection.query('SELECT name, school_id FROM classes WHERE id = ?', [id]);
        if (classRows.length === 0) {
             await connection.rollback();
             return sendError(res, 'Class not found', 404);
        }
        const { name, school_id } = classRows[0];

        // Security Check: Ensure principal can only delete classes in their own school.
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';

        if (userRole === 'principal') {
            const [principalRows] = await connection.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school and cannot delete classes.', 403);
            }
            const principalSchoolId = principalRows[0].school_id;

            if (school_id !== principalSchoolId) {
                await connection.rollback();
                return sendError(res, 'Access denied. You can only delete classes in your own school.', 403);
            }
        } else if (userRole !== 'admin') {
            await connection.rollback();
            return sendError(res, 'You do not have permission to delete classes.', 403);
        }

        // Delete associated study schedules first
        await connection.query('DELETE FROM study_schedules WHERE class_id = ?', [id]);

        // Delete associated teacher mappings
        await connection.query('DELETE FROM teacher_class_map WHERE class_id = ?', [id]);

        // Then delete the class
        const [result] = await connection.query('DELETE FROM classes WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            sendError(res, 'Class not found', 404);
        }

        // Notifications
        const [principals] = await connection.query('SELECT user_id FROM principals WHERE school_id = ?', [school_id]);
        for (const p of principals) {
            if (p.user_id !== req.user.id) {
                await connection.query(
                    'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                    [p.user_id, `ថ្នាក់រៀន "${name}" ត្រូវបានលុបចេញពីប្រព័ន្ធ។`]
                );
            }
        }
        await connection.query(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [req.user.id, `អ្នកបានលុបថ្នាក់រៀន "${name}" ដោយជោគជ័យ។`]
        );

        await connection.commit();
        res.status(204).send();
    } catch (error) {
        if (connection) await connection.rollback();
        logError("Delete Class", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};
const getClassBySchoolId = async (req, res, next) => {
    try {
        const { school_id } = req.params;

        // Security Check: Ensure user can only access classes in their own school.
        const userRole = req.user.role_name ? req.user.role_name.toLowerCase() : '';

        if (userRole === 'principal') {
            const [principalRows] = await db.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school and cannot access classes.', 403);
            }
            const principalSchoolId = principalRows[0].school_id;

            if (principalSchoolId !== parseInt(school_id, 10)) {
                return sendError(res, 'Access denied. You can only access classes in your own school.', 403);
            }
        } else if (userRole !== 'admin') {
            return sendError(res, 'You do not have permission to access classes.', 403);
        }

        const [classRows] = await db.query('SELECT * FROM classes WHERE school_id = ?', [school_id]);
        sendSuccess(res, { data: classRows, total: classRows.length }); // Ensure consistency with getAll
    } catch (error) {
        logError("Get Classes by School ID", error);
        next(error);
    }
};

const assignStudent = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { classId } = req.params;
        const { student_id } = req.body;
        const { id: userId, role_name: userRole } = req.user;

        if (!student_id) {
            await connection.rollback();
            return sendError(res, 'student_id is required.', 400);
        }

        // Check if student exists
        const [studentRows] = await connection.query('SELECT id, school_id FROM students WHERE user_id = ?', [student_id]);
        if (studentRows.length === 0) {
            await connection.rollback();
            return sendError(res, 'Student not found.', 404);
        }
        const internalStudentId = studentRows[0].id;
        const studentSchoolId = studentRows[0].school_id;

        // Security Check: Principal and Teacher can only assign students within their own school.
        if (userRole === 'principal' || userRole === 'teacher') {
            const userTable = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await connection.query(`SELECT school_id FROM ${userTable} WHERE user_id = ?`, [userId]);
            if (userRows.length === 0 || !userRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            const schoolId = userRows[0].school_id;

            // Verify the class belongs to the user's school
            const [classCheck] = await connection.query('SELECT school_id FROM classes WHERE id = ?', [classId]);
            if (classCheck.length === 0) {
                await connection.rollback();
                return sendError(res, 'Class not found.', 404);
            } else if (classCheck[0].school_id !== schoolId) {
                await connection.rollback();
                return sendError(res, 'Access denied. Class not in your school.', 403);
            }

            // Verify the student belongs to the user's school
            if (studentSchoolId !== schoolId) {
                await connection.rollback();
                return sendError(res, 'Access denied. Student not in your school.', 403);
            }
        } // Admins are not restricted by school

        // Insert into the mapping table
        await connection.query('INSERT INTO student_class_map (student_id, class_id) VALUES (?, ?)', [internalStudentId, classId]);

        await connection.commit();
        sendSuccess(res, { message: 'Student successfully added to the class.' }, 201);

    } catch (error) {
        await connection.rollback();
        // Handle specific error for duplicate entry
        if (error.code === 'ER_DUP_ENTRY') {
            return sendError(res, 'This student is already in the class.', 409); // 409 Conflict
        }
        logError("Assign Student to Class", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getTeacherClasses = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT DISTINCT
                c.id, c.name, c.school_id, c.academic_year, c.start_time, c.end_time, c.start_date, c.end_date
            FROM classes c
            JOIN teacher_class_map tcm ON c.id = tcm.class_id
            JOIN teachers t ON tcm.teacher_id = t.id
            WHERE t.user_id = ?
            ORDER BY c.name ASC
        `;

        const [rows] = await db.query(query, [userId]);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get Teacher Classes", error);
        next(error);
    }
};

const removeStudent = async (req, res, next) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { classId, studentId } = req.params;
        const { id: userId, role_name: userRole } = req.user;

        // Security Check: Principal and Teacher can only remove students within their own school.
        if (userRole === 'principal' || userRole === 'teacher') {
            const userTable = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await connection.query(`SELECT school_id FROM ${userTable} WHERE user_id = ?`, [userId]);
            if (userRows.length === 0 || !userRows[0].school_id) {
                await connection.rollback();
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            const schoolId = userRows[0].school_id;

            // Verify the class belongs to the user's school
            const [classCheck] = await connection.query('SELECT school_id FROM classes WHERE id = ?', [classId]);
            if (classCheck.length === 0) {
                await connection.rollback();
                return sendError(res, 'Class not found.', 404);
            } else if (classCheck[0].school_id !== schoolId) {
                await connection.rollback();
                return sendError(res, 'Access denied. Class not in your school.', 403);
            }
        }

        // Delete from the mapping table
        await connection.query('DELETE FROM student_class_map WHERE class_id = ? AND student_id = ?', [classId, studentId]);

        await connection.commit();
        res.status(204).send();

    } catch (error) {
        await connection.rollback();
        logError("Remove Student from Class", error);
        next(error);
    } finally {
        if (connection) connection.release();
    }
};

const getStudentClasses = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT 
                c.id, c.name, c.school_id, c.academic_year, c.start_time, c.end_time, c.start_date, c.end_date
            FROM classes c
            JOIN student_class_map scm ON c.id = scm.class_id
            JOIN students s ON scm.student_id = s.id
            WHERE s.user_id = ?
            ORDER BY c.id DESC
        `;

        const [rows] = await db.query(query, [userId]);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get Student Classes", error);
        next(error);
    }
};

module.exports = { getAll, getById, create, update, remove, getClassBySchoolId, assignStudent, getTeacherClasses, removeStudent, getStudentClasses };