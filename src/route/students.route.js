const express = require('express');
const router = express.Router();
const studentController = require('../controller/student.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const upload = require('../middleware/upload.middleware');

// Routes for students
router.get('', authenticate, authorize('VIEW_STUDENTS'), studentController.getAll);
router.get('/:id', authenticate, authorize('VIEW_STUDENTS'), studentController.getById);
router.get('/teacher/:teacherId', authenticate, authorize('VIEW_STUDENTS'), studentController.getByTeacherId);
router.get('/principal/:principalId', authenticate, authorize('VIEW_STUDENTS'), studentController.getByPrincipalId);
router.post('', authenticate, authorize('MANAGE_STUDENTS'), upload.single('image_profile'), studentController.create);
router.put('/:id', authenticate, authorize('MANAGE_STUDENTS'), upload.single('image_profile'), studentController.update);
router.delete('/:id', authenticate, authorize('MANAGE_STUDENTS'), studentController.remove);

module.exports = router;