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
        
        const values = records.map(rec => [
            rec.student_id, rec.class_id, rec.subject_id, rec.academic_period, rec.final_grade, rec.comments, published_by_teacher_id
        ]);

        const insertCols = ['student_id', 'class_id', 'subject_id', 'academic_period', 'final_grade', 'comments', 'published_by_teacher_id'];
        const updateCols = ['final_grade', 'comments', 'published_by_teacher_id'];

        await bulkUpsert('academic_results', insertCols, values, updateCols);

        sendSuccess(res, { message: 'Academic results published successfully.' }, 201);
    } catch (error) {
        logError("Create Academic Result", error);
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