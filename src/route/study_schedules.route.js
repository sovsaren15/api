const express = require('express');
const router = express.Router();
const studySchedulesController = require('../controller/study_schedules.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { validateSchedule, validateScheduleUpdate } = require('../middleware/validation.middleware.js');

router.get('/student/me', authenticate, studySchedulesController.getMySchedules);
router.get('', authenticate, studySchedulesController.getAll);
router.get('/:id', authenticate, studySchedulesController.getById);
router.post('', authenticate, authorize('MANAGE_SCHEDULES'), validateSchedule, studySchedulesController.create);
router.put('/:id', authenticate, authorize('MANAGE_SCHEDULES'), validateScheduleUpdate, studySchedulesController.update);
router.delete('/:id', authenticate, authorize('MANAGE_SCHEDULES'), studySchedulesController.remove);

module.exports = router;