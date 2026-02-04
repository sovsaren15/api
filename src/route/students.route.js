const express = require('express');
const router = express.Router();
const studentController = require('../controller/student.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');

// Routes for students
router.get('', authenticate, authorize('VIEW_STUDENTS'), studentController.getAll);
router.get('/:id', authenticate, authorize('VIEW_STUDENTS'), studentController.getById);
router.post('', authenticate, authorize('MANAGE_STUDENTS'), studentController.create);
router.put('/:id', authenticate, authorize('MANAGE_STUDENTS'), studentController.update);
router.delete('/:id', authenticate, authorize('MANAGE_STUDENTS'), studentController.remove);

module.exports = router;