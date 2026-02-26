const express = require('express');
const router = express.Router();
const attendanceController = require('../controller/attendance.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');

router.get('/student/me', authenticate, attendanceController.getMyAttendance);
router.get('', authenticate, authorize('VIEW_ATTENDANCE'), attendanceController.getAll);
router.post('', authenticate, authorize('RECORD_ATTENDANCE'), attendanceController.createOrUpdate);

module.exports = router;