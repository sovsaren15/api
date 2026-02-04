const express = require('express');
const router = express.Router();
const studySchedulesController = require('../controller/study_schedules.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');

router.get('', authenticate, studySchedulesController.getAll);
router.get('/:id', authenticate, studySchedulesController.getById);
router.post('', authenticate, authorize('MANAGE_SCHEDULES'), studySchedulesController.create);
router.put('/:id', authenticate, authorize('MANAGE_SCHEDULES'), studySchedulesController.update);
router.delete('/:id', authenticate, authorize('MANAGE_SCHEDULES'), studySchedulesController.remove);

module.exports = router;