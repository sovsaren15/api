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

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            req.query,
            { class_id: 'a.class_id', student_id: 'a.student_id', date: 'a.date' },
            [],
            'a.date DESC, u.first_name ASC'
        );

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

        const recorded_by_teacher_id = await getTeacherIdFromUserId(req.user.id);

        // Security Check: Ensure the class belongs to the teacher's school
        const [teacherRows] = await db.query('SELECT school_id FROM teachers WHERE id = ?', [recorded_by_teacher_id]);
        const [classRows] = await db.query('SELECT school_id FROM classes WHERE id = ?', [class_id]);

        if (classRows.length === 0) return sendError(res, 'Class not found.', 404);
        if (teacherRows.length === 0 || teacherRows[0].school_id !== classRows[0].school_id) {
            return sendError(res, 'Access denied. You can only record attendance for classes in your school.', 403);
        }

        // Validate that students belong to the class to prevent FK errors
        const studentIds = records.map(r => r.student_id);
        const [enrolledStudents] = await db.query(
            'SELECT student_id FROM student_class_map WHERE class_id = ? AND student_id IN (?)',
            [class_id, studentIds]
        );

        const enrolledSet = new Set(enrolledStudents.map(s => s.student_id));
        const invalidStudents = studentIds.filter(id => !enrolledSet.has(id));

        if (invalidStudents.length > 0) {
            return sendError(res, `The following student IDs are not enrolled in class ${class_id}: ${[...new Set(invalidStudents)].join(', ')}`, 400);
        }

        const values = records.map(record => [
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

        sendSuccess(res, { message: 'Attendance recorded successfully.' }, 201);
    } catch (error) {
        logError("Create/Update Attendance", error);
        next(error);
    }
};

module.exports = { getAll, createOrUpdate };