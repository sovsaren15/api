const db = require('../config/db');

/**
 * Retrieves the teacher ID for a given user ID.
 * Throws an error if the user is not a teacher.
 * @param {number} userId - The ID of the logged-in user.
 * @returns {Promise<number>} The corresponding teacher ID.
 */
const getTeacherIdFromUserId = async (userId) => {
    const [teacherRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [userId]);
    if (teacherRows.length === 0) {
        const error = new Error('Action requires a teacher role.');
        error.status = 403;
        throw error;
    }
    return teacherRows[0].id;
};

/**
 * Performs a bulk insert or update operation.
 * @param {string} tableName - The name of the table to upsert into.
 * @param {string[]} insertCols - An array of column names for the INSERT part.
 * @param {Array<Array<any>>} values - An array of arrays, where each inner array contains the values for a row.
 * @param {string[]} updateCols - An array of column names to update in the ON DUPLICATE KEY UPDATE part.
 * @returns {Promise<any>} The result from the database query.
 */
const bulkUpsert = async (tableName, insertCols, values, updateCols) => {
    if (!tableName || !insertCols.length || !values.length || !updateCols.length) {
        throw new Error('Missing required parameters for bulkUpsert.');
    }

    // `col` = VALUES(`col`)
    const updateSet = updateCols.map(col => `${col} = VALUES(${col})`).join(', ');

    const query = `
        INSERT INTO ${tableName} (${insertCols.join(', ')})
        VALUES ?
        ON DUPLICATE KEY UPDATE
            ${updateSet}
    `;

    return db.query(query, [values]);
};


module.exports = {
    getTeacherIdFromUserId,
    bulkUpsert
};