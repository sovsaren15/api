const express = require('express');
const router = express.Router();
const studentController = require('../controller/student.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const upload = require('../middleware/upload.middleware');
const { validateStudent, validateStudentUpdate } = require('../middleware/validation.middleware.js');

// Routes for students
router.get('', authenticate, authorize('VIEW_STUDENTS'), studentController.getAll);

// Allow students to view their own profile using the token
router.get('/me', authenticate, studentController.getMe);

// Allow students to update their own profile (e.g. image)
router.put('/me', authenticate, upload.single('image_profile'), validateStudentUpdate, (req, res, next) => {
    req.params.id = req.user.id;
    next();
}, studentController.update);

router.get('/teacher/:teacherId', authenticate, authorize('VIEW_STUDENTS'), studentController.getByTeacherId);
router.get('/principal/:principalId', authenticate, authorize('VIEW_STUDENTS'), studentController.getByPrincipalId);
router.get('/:id', authenticate, authorize('VIEW_STUDENTS'), studentController.getById);
router.post('', authenticate, authorize('MANAGE_STUDENTS'), upload.single('image_profile'), validateStudent, studentController.create);
router.put('/:id', authenticate, authorize('MANAGE_STUDENTS'), upload.single('image_profile'), validateStudentUpdate, studentController.update);
router.delete('/:id', authenticate, authorize('MANAGE_STUDENTS'), studentController.remove);

module.exports = router;