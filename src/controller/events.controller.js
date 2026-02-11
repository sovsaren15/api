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
        if (!id) return sendError(res, 'Event ID is required', 400);

        const [rows] = await db.query('SELECT * FROM events WHERE id = ?', [id]);
        if (rows && rows.length > 0) {
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
        const { school_id, title, description, location, map_link, start_date, end_date } = req.body;
        const created_by_user_id = req.user.id; // From auth middleware
        
        let imagesJson = null;
        if (req.files && req.files.length > 0) {
            const imagePaths = req.files.map(file => `uploads/${file.filename}`);
            imagesJson = JSON.stringify(imagePaths);
        }

        if (!school_id || !title || !start_date || !end_date) {
            return sendError(res, 'school_id, title, start_date, and end_date are required.', 400);
        }

        const [result] = await db.query(
            'INSERT INTO events (school_id, title, description, location, map_link, start_date, end_date, created_by_user_id, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [school_id, title, description, location, map_link, start_date, end_date, created_by_user_id, imagesJson]
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
        // Ensure req.body is handled safely
        const body = req.body || {};
        
        // Helper to handle potential array values from multipart forms
        const getValue = (val) => Array.isArray(val) ? val[0] : val;

        const title = getValue(body.title);
        const description = getValue(body.description);
        const location = getValue(body.location);
        const map_link = getValue(body.map_link);
        const start_date = getValue(body.start_date);
        const end_date = getValue(body.end_date);
        const existing_images_str = getValue(body.existing_images);

        if (!title || !start_date || !end_date) {
            return sendError(res, 'title, start_date, and end_date are required.', 400);
        }
        
        let imageUpdate = "";
        const params = [
            title, 
            description || null, 
            location || null, 
            map_link || null, 
            start_date, 
            end_date
        ];

        let finalImages = [];
        let shouldUpdateImage = false;

        if (existing_images_str !== undefined) {
            try {
                const existing = JSON.parse(existing_images_str);
                if (Array.isArray(existing)) {
                    finalImages = [...finalImages, ...existing];
                }
            } catch (e) {
                console.error("Error parsing existing_images:", e);
            }
            shouldUpdateImage = true;
        }

        if (req.files && req.files.length > 0) {
            const imagePaths = req.files.map(file => `uploads/${file.filename || file.originalname}`);
            finalImages = [...finalImages, ...imagePaths];
            shouldUpdateImage = true;
        }

        if (shouldUpdateImage) {
            imageUpdate = ", image = ?";
            params.push(JSON.stringify(finalImages));
        }
        params.push(id);

        const [result] = await db.query(
            `UPDATE events SET title = ?, description = ?, location = ?, map_link = ?, start_date = ?, end_date = ?${imageUpdate} WHERE id = ?`,
            params
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