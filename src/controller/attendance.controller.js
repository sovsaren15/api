const db = require('../config/db');
const { logError } = require("../config/service");
const { getTeacherIdFromUserId, bulkUpsert } = require('../route/record.service');
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = `
            SELECT 
                a.id, a.date, a.status, a.remarks,
                s.id as student_id,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                c.name as class_name
            FROM attendance a
            JOIN students s ON a.student_id = s.id
            JOIN users u ON s.user_id = u.id
            JOIN classes c ON a.class_id = c.id
        `;

        // Use a local copy of query params to ensure filters are applied correctly
        const queryParams = { ...req.query };

        // Security: Restrict data based on role
        const userRole = (req.user.role_name || req.user.role || '').toLowerCase();
        
        if (userRole === 'student') {
            const [studentRows] = await db.query('SELECT id FROM students WHERE user_id = ?', [req.user.id]);
            if (studentRows.length === 0) {
                return sendSuccess(res, []);
            }
            queryParams.student_id = studentRows[0].id;
        } else if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            if (userRows.length === 0 || !userRows[0].school_id) {
                return sendSuccess(res, []);
            }
            queryParams.school_id = userRows[0].school_id;
        }

        const builder = new QueryBuilder(baseQuery);

        builder.applyFilters(queryParams, {
            'a.class_id': 'class_id',
            'a.student_id': 'student_id',
            'a.date': 'date',
            'c.school_id': 'school_id'
        });

        // Build the filtered query first (WHERE clause)
        const { query: filteredQuery, params: filteredParams } = builder.build();

        // Apply sorting and optional pagination
        const finalBuilder = new QueryBuilder(filteredQuery);
        finalBuilder.params = filteredParams;

        finalBuilder.applySorting(queryParams, 'a.date DESC, u.first_name ASC');

        if (queryParams.limit) {
            finalBuilder.applyPagination(queryParams);
        }

        const { query, params } = finalBuilder.build();

        const [rows] = await db.query(query, params);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get All Attendance", error);
        next(error);
    }
};

const createOrUpdate = async (req, res, next) => {
    try {
        const { class_id, date, records } = req.body;

        if (!class_id || !date || !Array.isArray(records) || records.length === 0) { 
            return sendError(res, 'class_id, date, and a non-empty records array are required.', 400);
        } 

        // Filter out invalid records
        const validRecords = records.filter(r => r.student_id && r.status);
        if (validRecords.length === 0) {
            return sendError(res, 'No valid records found. Each record must contain student_id and status.', 400);
        }

        const recorded_by_teacher_id = await getTeacherIdFromUserId(req.user.id);

        // Security Check: Ensure the class belongs to the teacher's school
        const [teacherRows] = await db.query('SELECT school_id FROM teachers WHERE id = ?', [recorded_by_teacher_id]);
        const [classRows] = await db.query('SELECT school_id FROM classes WHERE id = ?', [class_id]);

        if (classRows.length === 0) return sendError(res, 'Class not found.', 404);
        if (teacherRows.length === 0 || teacherRows[0].school_id !== classRows[0].school_id) {
            return sendError(res, 'Access denied. You can only record attendance for classes in your school.', 403);
        }

        // Validate that students belong to the class to prevent FK errors
        const studentIds = validRecords.map(r => r.student_id);
        const [enrolledStudents] = await db.query(
            'SELECT student_id FROM student_class_map WHERE class_id = ? AND student_id IN (?)',
            [class_id, studentIds]
        );

        const enrolledSet = new Set(enrolledStudents.map(s => s.student_id));
        const invalidStudents = studentIds.filter(id => !enrolledSet.has(id));

        if (invalidStudents.length > 0) {
            return sendError(res, `The following student IDs are not enrolled in class ${class_id}: ${[...new Set(invalidStudents)].join(', ')}`, 400);
        }

        const values = validRecords.map(record => [
            record.student_id,
            class_id,
            date,
            record.status,
            record.remarks || null,
            recorded_by_teacher_id,
        ]);

        const insertCols = ['student_id', 'class_id', 'date', 'status', 'remarks', 'recorded_by_teacher_id'];
        const updateCols = ['status', 'remarks', 'recorded_by_teacher_id'];
        await bulkUpsert('attendance', insertCols, values, updateCols);

        // Send notifications to students
        if (studentIds.length > 0) {
            const [students] = await db.query('SELECT id, user_id FROM students WHERE id IN (?)', [studentIds]);
            const studentUserMap = {};
            students.forEach(s => studentUserMap[s.id] = s.user_id);

            const notificationValues = [];
            let displayDate = date;
            if (typeof date === 'string' && date.includes('-')) {
                const [y, m, d] = date.split('-');
                displayDate = `${d}/${m}/${y}`;
            }

            const statusMap = {
                'absent': 'អវត្តមាន',
                'late': 'មកយឺត',
                'permission': 'ច្បាប់'
            };

            for (const record of validRecords) {
                const userId = studentUserMap[record.student_id];
                if (userId && statusMap[record.status]) {
                    const message = `អ្នកត្រូវបានកត់ត្រាថា ${statusMap[record.status]} នៅថ្ងៃទី ${displayDate}`;
                    notificationValues.push([userId, message]);
                }
            }

            if (notificationValues.length > 0) {
                await db.query('INSERT INTO notifications (user_id, message) VALUES ?', [notificationValues]);
            }
        }

        sendSuccess(res, { message: 'Attendance recorded successfully.' }, 201);
    } catch (error) {
        logError("Create/Update Attendance", error);
        next(error);
    }
};

const getMyAttendance = async (req, res, next) => {
    const userRole = (req.user.role_name || req.user.role || '').toLowerCase();
    if (userRole !== 'student') {
        return sendError(res, 'Access denied. This endpoint is for students only.', 403);
    }
    await getAll(req, res, next);
};

module.exports = { getAll, createOrUpdate, getMyAttendance };