const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logError } = require('../config/service');

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        // Find user by email and include their role name
        const [users] = await db.query(
            `SELECT u.*, r.name as role_name,
             COALESCE(t.image_profile, s.image_profile) as image_profile
             FROM users u 
             JOIN roles r ON u.role_id = r.id 
             LEFT JOIN teachers t ON u.id = t.user_id
             LEFT JOIN students s ON u.id = s.user_id
             WHERE u.email = ?`,
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = users[0];

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Create JWT payload
        const payload = {
            userId: user.id,
            role: user.role_name,
        };

        // Sign the token
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

        // Don't send password back to the client
        delete user.password;

        res.json({ message: 'Login successful', token, user });

    } catch (error) {
        logError("User Login", error);
        next(error); // Pass to central error handler
    }
};

const validateToken = async (req, res) => {
    // If the authenticate middleware passes, req.user will be populated.
    // We just need to send it back.
    const user = req.user;
    delete user.password; // Ensure password is not sent

    res.json({ user });
};

const changePassword = async (req, res, next) => {
    try {
        const { current_password, new_password } = req.body;
        const userId = req.user.id;

        if (!current_password || !new_password) {
            return res.status(400).json({ message: 'សូមបញ្ចូលពាក្យសម្ងាត់បច្ចុប្បន្ន និងពាក្យសម្ងាត់ថ្មី' });
        }

        // Get user to verify current password
        const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'រកមិនឃើញអ្នកប្រើប្រាស់' });
        }
        const user = users[0];

        // Verify current password
        const isMatch = await bcrypt.compare(current_password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវ' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(new_password, 10);

        // Update password
        await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

        res.json({ message: 'ផ្លាស់ប្តូរពាក្យសម្ងាត់ជោគជ័យ' });

    } catch (error) {
        logError("Change Password", error);
        next(error);
    }
};

module.exports = { login, validateToken, changePassword };