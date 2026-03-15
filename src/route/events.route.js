const express = require('express');
const router = express.Router();
const eventsController = require('../controller/events.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const upload = require('../middleware/upload.middleware');
const { validateEvent, validateEventUpdate } = require('../middleware/validation.middleware.js');

router.get('', authenticate, eventsController.getAll);
router.get('/school/:schoolId', authenticate, eventsController.getBySchoolId);
router.get('/:id', authenticate, eventsController.getById);
router.post('', authenticate, authorize('MANAGE_EVENTS'), upload.array('images', 10), validateEvent, eventsController.create);
router.put('/:id', authenticate, authorize('MANAGE_EVENTS'), upload.array('images', 10), validateEventUpdate, eventsController.update);
router.delete('/:id', authenticate, authorize('MANAGE_EVENTS'), eventsController.remove);

module.exports = router;