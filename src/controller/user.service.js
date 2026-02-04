const bcrypt = require('bcryptjs');

const ROLES = {
    ADMIN: 1,
    PRINCIPAL: 2,
    TEACHER: 3,
    STUDENT: 4,
    PARENT: 5
};

/**
 * Creates a new user within a database transaction.
 * @param {object} connection - The database connection object from a transaction.
 * @param {object} userData - The user's data.
 * @param {string} userData.first_name
 * @param {string} userData.last_name
 * @param {string} userData.email
 * @param {string} userData.password
 * @param {string} userData.phone_number
 * @param {string} userData.address
 * @param {number} roleId - The ID of the user's role.
 * @returns {Promise<number>} The ID of the newly created user.
 */
const createUser = async (connection, { first_name, last_name, email, password, phone_number, address }, roleId) => {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [userResult] = await connection.query(
        'INSERT INTO users (first_name, last_name, email, password, role_id, phone_number, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [first_name, last_name, email, hashedPassword, roleId, phone_number, address]
    );

    return userResult.insertId;
};

/**
 * Updates an existing user's common details within a database transaction.
 * @param {object} connection - The database connection object.
 * @param {number} userId - The ID of the user to update.
 * @param {object} userData - The user data to update. Can contain first_name, last_name, phone_number, address.
 * @returns {Promise<void>}
 */
const updateUser = async (connection, userId, userData) => {
    const updatableUserFields = ['first_name', 'last_name', 'phone_number', 'address'];
    const fieldsToUpdate = {};

    // Filter userData to only include fields that exist and are updatable
    for (const field of updatableUserFields) {
        if (userData[field] !== undefined) {
            fieldsToUpdate[field] = userData[field];
        }
    }

    // If there are no common user fields to update, do nothing.
    if (Object.keys(fieldsToUpdate).length === 0) {
        return;
    }

    // Dynamically build the SET part of the query
    await connection.query(
        'UPDATE users SET ? WHERE id = ?',
        [fieldsToUpdate, userId]
    );
};


module.exports = { createUser, updateUser, ROLES };