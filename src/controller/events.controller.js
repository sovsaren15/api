const db = require('../config/db');
const { logError } = require("../config/service");
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = 'SELECT * FROM events';

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            req.query,
            { school_id: 'school_id' },
            [], // Pass an empty array for search fields
            'start_date DESC' // Pass sort config correctly
        );

        const [rows] = await db.query(query, params);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get All Events", error);
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query('SELECT * FROM events WHERE id = ?', [id]);
        if (rows.length > 0) {
            sendSuccess(res, rows[0]);
        } else {
            sendError(res, 'Event not found', 404);
        }
    } catch (error) {
        logError("Get Event By ID", error);
        next(error);
    }
};

const create = async (req, res, next) => {
    try {
        const { school_id, title, description, start_date, end_date } = req.body;
        const created_by_user_id = req.user.id; // From auth middleware

        if (!school_id || !title || !start_date || !end_date) {
            return sendError(res, 'school_id, title, start_date, and end_date are required.', 400);
        }

        const [result] = await db.query(
            'INSERT INTO events (school_id, title, description, start_date, end_date, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
            [school_id, title, description, start_date, end_date, created_by_user_id]
        );
        sendSuccess(res, { id: result.insertId, title, start_date, end_date }, 201);
    } catch (error) {
        logError("Create Event", error);
        next(error);
    }
};

const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, description, start_date, end_date } = req.body;
        const [result] = await db.query(
            'UPDATE events SET title = ?, description = ?, start_date = ?, end_date = ? WHERE id = ?',
            [title, description, start_date, end_date, id]
        );
        if (result.affectedRows > 0) {
            sendSuccess(res, { message: 'Event updated successfully' });
        } else {
            sendError(res, 'Event not found', 404);
        }
    } catch (error) {
        logError("Update Event", error);
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [result] = await db.query('DELETE FROM events WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            sendError(res, 'Event not found', 404);
        }
    } catch (error) {
        logError("Delete Event", error);
        next(error);
    }
};

module.exports = { getAll, getById, create, update, remove };