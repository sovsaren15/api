const express = require('express');
const router = express.Router();
const notificationController = require('../controller/notification.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/', authenticate, notificationController.getUserNotifications);
router.put('/:id/read', authenticate, notificationController.markAsRead);

module.exports = router;