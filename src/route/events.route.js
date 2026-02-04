const express = require('express');
const router = express.Router();
const eventsController = require('../controller/events.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');

router.get('', authenticate, eventsController.getAll);
router.get('/:id', authenticate, eventsController.getById);
router.post('', authenticate, authorize('MANAGE_EVENTS'), eventsController.create);
router.put('/:id', authenticate, authorize('MANAGE_EVENTS'), eventsController.update);
router.delete('/:id', authenticate, authorize('MANAGE_EVENTS'), eventsController.remove);

module.exports = router;