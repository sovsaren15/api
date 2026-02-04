const db = require('../config/db');
const { logError } = require("../config/service");
const { getTeacherIdFromUserId, bulkUpsert } = require('../route/record.service');
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = `
            SELECT 
                sc.id, sc.score, sc.assessment_type, sc.date_recorded,
                st.id as student_id,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                st.date_of_birth,
                c.name as class_name,
                sub.name as subject_name
            FROM scores sc
            JOIN students st ON sc.student_id = st.id
            JOIN users u ON st.user_id = u.id
            JOIN classes c ON sc.class_id = c.id
            JOIN subjects sub ON sc.subject_id = sub.id
        `;

        const builder = new QueryBuilder(baseQuery);

        builder.applyFilters(req.query, {
            class_id: 'sc.class_id',
            student_id: 'sc.student_id',
            subject_id: 'sc.subject_id',
            assessment_type: 'sc.assessment_type',
            date_recorded: 'sc.date_recorded'
        });

        if (req.query.date_from) {
            builder.whereClauses.push('sc.date_recorded >= ?');
            builder.params.push(req.query.date_from);
        }

        if (req.query.date_to) {
            builder.whereClauses.push('sc.date_recorded <= ?');
            builder.params.push(req.query.date_to);
        }

        // Build the filtered query first (WHERE clause)
        const { query: filteredQuery, params: filteredParams } = builder.build();

        // Apply sorting and optional pagination
        const finalBuilder = new QueryBuilder(filteredQuery);
        finalBuilder.params = filteredParams;

        finalBuilder.applySorting(req.query, 'sc.date_recorded DESC, u.first_name ASC');

        if (req.query.limit) {
            finalBuilder.applyPagination(req.query);
        }

        const { query, params } = finalBuilder.build();

        const [rows] = await db.query(query, params);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get All Scores", error);
        next(error);
    }
};

const createOrUpdate = async (req, res, next) => {
    try {
        const records = Array.isArray(req.body) ? req.body : req.body?.records;

        if (!Array.isArray(records) || records.length === 0) { 
            return sendError(res, 'A non-empty records array is required.', 400);
        } 

        const recorded_by_teacher_id = await getTeacherIdFromUserId(req.user.id);

        // Map values for bulk insertion
        const values = records.map(record => [
            record.student_id,
            record.class_id,
            record.subject_id,
            record.assessment_type,
            record.score,
            record.date_recorded, // Format: YYYY-MM-DD
            recorded_by_teacher_id,
        ]);

        const insertCols = [
            'student_id', 
            'class_id', 
            'subject_id', 
            'assessment_type', 
            'score', 
            'date_recorded', 
            'recorded_by_teacher_id'
        ];

        // This defines which columns to update if the Unique Key (student+subject+type+date) matches
        const updateCols = ['score', 'recorded_by_teacher_id'];

        await bulkUpsert('scores', insertCols, values, updateCols);

        sendSuccess(res, { message: 'Scores saved/updated successfully.' }, 201);
    } catch (error) {
        logError("Create/Update Scores", error);
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [result] = await db.query('DELETE FROM scores WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            sendError(res, 'Score not found', 404);
        }
    } catch (error) {
        logError("Delete Score", error);
        next(error);
    }
};

module.exports = { getAll, createOrUpdate, remove };