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
            `SELECT u.*, r.name as role_name 
             FROM users u 
             JOIN roles r ON u.role_id = r.id 
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

module.exports = { login, validateToken };