const db = require('../config/db');
const { logError } = require("../config/service");
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = 'SELECT * FROM events';
        if (!req.query) req.query = {}; // Ensure req.query exists
        const userRole = (req.user.role_name || req.user.role || '').toLowerCase();

        // Security: If not Admin, enforce school_id filter based on user's assigned school
        if (userRole !== 'admin') {
            let schoolId = null;
            let table = '';

            if (userRole === 'student') table = 'students';
            else if (userRole === 'teacher') table = 'teachers';
            else if (userRole === 'principal') table = 'principals';

            if (table) {
                // Optimization: If school_id is already set (e.g. by getBySchoolId) and we trust the flow, we could skip.
                // However, for safety, we usually re-verify. To optimize, we only query if req.query.school_id isn't already set/verified.
                // Since getAll is public, we MUST overwrite req.query.school_id to ensure the user can't spoof it.
                
                const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
                if (userRows.length > 0 && userRows[0].school_id) {
                    // Force the filter to the user's assigned school, ignoring whatever they sent
                    req.query.school_id = userRows[0].school_id;
                } else {
                    return sendSuccess(res, []); // User not assigned to a school
                }
            } else {
                // Security Fix: Deny access if role is not recognized (otherwise they see all events)
                return sendError(res, 'Access denied.', 403);
            }
        }

        const { query, params } = QueryBuilder.buildQuery(
            baseQuery,
            req.query,
            { school_id: 'school_id' },
            ['title', 'description', 'location'], // Added search fields
            'start_date DESC' // Pass sort config correctly
        );

        const [rows] = await db.query(query, params);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get All Events", error);
        next(error);
    }
};

const getBySchoolId = async (req, res, next) => {
    try {
        let schoolId = req.params.schoolId || req.params.school_id;
        if (!schoolId) return sendError(res, 'School ID is required', 400);

        const userRole = (req.user.role_name || req.user.role || '').toLowerCase();
        
        // 1. Determine the user's assigned school (if any)
        let assignedSchoolId = null;
        let table = '';
        if (userRole === 'student') table = 'students';
        else if (userRole === 'teacher') table = 'teachers';
        else if (userRole === 'principal') table = 'principals';

        if (table) {
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            if (userRows.length > 0) assignedSchoolId = userRows[0].school_id;
        }

        // 2. Resolve 'me' keyword to the actual ID
        if (schoolId === 'me') {
            if (assignedSchoolId) {
                schoolId = assignedSchoolId;
            } else {
                return sendError(res, 'Current user is not assigned to a school. Please specify a School ID.', 400);
            }
        }

        // Security: Ensure non-admins can only access their own school
        if (userRole !== 'admin') {
            if (!assignedSchoolId) return sendError(res, 'You are not assigned to a school.', 403);
            
            if (parseInt(schoolId) !== assignedSchoolId) {
                return sendError(res, 'Access denied. You can only view events for your own school.', 403);
            }
        }

        // --- THE FIX IS HERE ---
        // Instead of forcing req.query and calling getAll, we query the DB directly.
        // This guarantees we ONLY get events for this specific school.
        const [events] = await db.query(
            'SELECT * FROM events WHERE school_id = ? ORDER BY start_date DESC', 
            [schoolId]
        );
        
        sendSuccess(res, events);
    } catch (error) {
        logError("Get Events By School ID", error);
        next(error);
    }
};

const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) return sendError(res, 'Event ID is required', 400);

        const [rows] = await db.query('SELECT * FROM events WHERE id = ?', [id]);
        if (rows && rows.length > 0) {
            const event = rows[0];
            const userRole = (req.user.role_name || req.user.role || '').toLowerCase();

            // Security: If not Admin, check if event belongs to user's school
            if (userRole !== 'admin') {
                let table = '';
                if (userRole === 'student') table = 'students';
                else if (userRole === 'teacher') table = 'teachers';
                else if (userRole === 'principal') table = 'principals';

                if (table) {
                    const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
                    
                    if (userRows.length === 0 || !userRows[0].school_id) {
                         return sendError(res, 'You are not assigned to a school.', 403);
                    }

                    if (event.school_id !== userRows[0].school_id) {
                        return sendError(res, 'Access denied. You can only view events for your own school.', 403);
                    }
                } else {
                    return sendError(res, 'Access denied.', 403);
                }
            }
            sendSuccess(res, event);
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
        let { school_id, title, description, location, map_link, start_date, end_date } = req.body;
        const created_by_user_id = req.user.id; // From auth middleware
        
        let imagesJson = null;
        if (req.files && req.files.length > 0) {
            const imagePaths = req.files.map(file => `uploads/${file.filename}`);
            imagesJson = JSON.stringify(imagePaths);
        }

        // Security: Restrict school_id for non-admins
        const userRole = (req.user.role_name || req.user.role || '').toLowerCase();
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            
            if (userRows.length === 0 || !userRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            school_id = userRows[0].school_id; // Force use of assigned school
        } else if (userRole !== 'admin') {
             return sendError(res, 'Access denied.', 403);
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

        // Security Check: Ensure user owns the event's school
        const userRole = (req.user.role_name || req.user.role || '').toLowerCase();
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            
            if (userRows.length === 0 || !userRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }

            const [eventRows] = await db.query('SELECT school_id FROM events WHERE id = ?', [id]);
            if (eventRows.length === 0) return sendError(res, 'Event not found', 404);

            if (eventRows[0].school_id !== userRows[0].school_id) {
                return sendError(res, 'Access denied. You can only update events for your own school.', 403);
            }
        }
        
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

        // Security Check: Ensure user owns the event's school
        const userRole = (req.user.role_name || req.user.role || '').toLowerCase();
        if (userRole === 'principal' || userRole === 'teacher') {
            const table = userRole === 'principal' ? 'principals' : 'teachers';
            const [userRows] = await db.query(`SELECT school_id FROM ${table} WHERE user_id = ?`, [req.user.id]);
            
            if (userRows.length === 0 || !userRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }

            const [eventRows] = await db.query('SELECT school_id FROM events WHERE id = ?', [id]);
            if (eventRows.length > 0 && eventRows[0].school_id !== userRows[0].school_id) {
                return sendError(res, 'Access denied. You can only delete events for your own school.', 403);
            }
        }

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

module.exports = { getAll, getById, getBySchoolId, create, update, remove };