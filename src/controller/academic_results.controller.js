const db = require('../config/db');
const { logError } = require("../config/service");
const { getTeacherIdFromUserId, bulkUpsert } = require('../route/record.service');
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = `
            SELECT 
                ar.id, ar.academic_period, ar.final_grade, ar.comments, ar.published_at,
                st.id as student_id,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                c.name as class_name,
                sub.name as subject_name,
                CONCAT(pub_u.first_name, ' ', pub_u.last_name) as published_by
            FROM academic_results ar
            JOIN students st ON ar.student_id = st.id
            JOIN users u ON st.user_id = u.id
            JOIN classes c ON ar.class_id = c.id
            JOIN subjects sub ON ar.subject_id = sub.id
            JOIN teachers t ON ar.published_by_teacher_id = t.id
            JOIN users pub_u ON t.user_id = pub_u.id
        `;

        const builder = new QueryBuilder(baseQuery);

        // Standard filters for IDs and Semester
        builder.applyFilters(req.query, {
            'ar.student_id': 'student_id',
            'ar.class_id': 'class_id',
            'ar.subject_id': 'subject_id',
            'ar.academic_period': 'academic_period'
        });

        // Custom Date Filtering
        if (req.query.month) {
            builder.whereClauses.push('MONTH(ar.published_at) = ?');
            builder.params.push(req.query.month);
        }

        if (req.query.year) {
            builder.whereClauses.push('YEAR(ar.published_at) = ?');
            builder.params.push(req.query.year);
        }

        const { query: filteredQuery, params: filteredParams } = builder.build();

        // Apply Sorting and Pagination
        const finalBuilder = new QueryBuilder(filteredQuery);
        finalBuilder.params = filteredParams;

        const { query, params } = finalBuilder
            .applySorting(req.query, 'ar.published_at DESC, u.first_name ASC')
            .applyPagination(req.query)
            .build();

        const [rows] = await db.query(query, params);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get All Academic Results", error);
        next(error);
    }
};

const createOrUpdate = async (req, res, next) => {
    try {
        const records = Array.isArray(req.body) ? req.body : req.body?.records;

        if (!Array.isArray(records) || records.length === 0) { 
            return sendError(res, 'A non-empty records array is required.', 400);
        } 

        const published_by_teacher_id = await getTeacherIdFromUserId(req.user.id);
        
        // --- Security & Validation Checks ---
        const [teacherRows] = await db.query('SELECT school_id FROM teachers WHERE id = ?', [published_by_teacher_id]);
        if (teacherRows.length === 0 || !teacherRows[0].school_id) {
            return sendError(res, 'Access denied. You are not assigned to a school.', 403);
        }
        const teacherSchoolId = teacherRows[0].school_id;

        // Based on UI, all records in a batch share the same class and subject.
        const { class_id, subject_id } = records[0];

        if (!class_id || !subject_id) {
            return sendError(res, 'Each record must contain a class_id and subject_id.', 400);
        }

        // Verify class and subject belong to the teacher's school
        const [classRows] = await db.query('SELECT school_id FROM classes WHERE id = ?', [class_id]);
        if (classRows.length === 0 || classRows[0].school_id !== teacherSchoolId) {
            return sendError(res, 'Access denied. The specified class does not belong to your school.', 403);
        }

        const [subjectRows] = await db.query('SELECT school_id FROM subjects WHERE id = ?', [subject_id]);
        if (subjectRows.length === 0 || subjectRows[0].school_id !== teacherSchoolId) {
            return sendError(res, 'Access denied. The specified subject does not belong to your school.', 403);
        }

        // Validate all students belong to the same school and are enrolled in the class
        const studentIds = records.map(r => r.student_id);
        const [studentSchoolRows] = await db.query('SELECT id, school_id FROM students WHERE id IN (?)', [studentIds]);
        
        const studentSchoolMap = new Map(studentSchoolRows.map(s => [s.id, s.school_id]));
        const studentsInWrongSchool = studentIds.filter(id => studentSchoolMap.get(id) !== teacherSchoolId);

        if (studentsInWrongSchool.length > 0) {
            return sendError(res, `Access denied. The following students are not in your school: ${studentsInWrongSchool.join(', ')}`, 403);
        }

        const [enrolledStudents] = await db.query('SELECT student_id FROM student_class_map WHERE class_id = ? AND student_id IN (?)', [class_id, studentIds]);
        const enrolledSet = new Set(enrolledStudents.map(s => s.student_id));
        const notEnrolledStudents = studentIds.filter(id => !enrolledSet.has(id));

        if (notEnrolledStudents.length > 0) {
            return sendError(res, `The following students are not enrolled in class ${class_id}: ${[...new Set(notEnrolledStudents)].join(', ')}`, 400);
        }
        // --- End of Checks ---

        const values = records.map(rec => [
            rec.student_id, rec.class_id, rec.subject_id, rec.academic_period, rec.final_grade, rec.comments, published_by_teacher_id
        ]);

        const insertCols = ['student_id', 'class_id', 'subject_id', 'academic_period', 'final_grade', 'comments', 'published_by_teacher_id'];
        const updateCols = ['final_grade', 'comments', 'published_by_teacher_id'];

        await bulkUpsert('academic_results', insertCols, values, updateCols);

        sendSuccess(res, { message: 'Academic results published successfully.' }, 201);
    } catch (error) {
        logError("Create/Update Academic Result", error);
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [result] = await db.query('DELETE FROM academic_results WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            sendError(res, 'Academic result not found', 404);
        }
    } catch (error) {
        logError("Delete Academic Result", error);
        next(error);
    }
};

module.exports = { getAll, createOrUpdate, remove };