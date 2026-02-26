const db = require('../config/db');
const { sendSuccess, sendError } = require('./response.helper');
const { logError } = require('../config/service');

const getUserNotifications = async (req, res, next) => {
    try {
        const userId = req.user.id;
        // Fetch latest 10 notifications
        const [notifications] = await db.query(
            `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`,
            [userId]
        );
        
        // Get total unread count
        const [countResult] = await db.query(
            `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
            [userId]
        );

        sendSuccess(res, { 
            notifications, 
            unreadCount: countResult[0].count 
        });
    } catch (error) {
        logError("Get User Notifications", error);
        next(error);
    }
};

const markAsRead = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        await db.query(
            `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
            [id, userId]
        );

        sendSuccess(res, { message: 'Notification marked as read' });
    } catch (error) {
        logError("Mark Notification Read", error);
        next(error);
    }
};

module.exports = {
    getUserNotifications,
    markAsRead
};