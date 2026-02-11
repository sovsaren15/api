const express = require('express');
const router = express.Router();
const teachersController = require('../controller/teachers.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const upload = require('../middleware/upload.middleware');

// Define routes for teachers
router.get('/dashboard', authenticate, authorize('VIEW_TEACHERS'), teachersController.getTeacherDashboard);
router.get('', authenticate, authorize('VIEW_TEACHERS'), teachersController.getAll);

// Specific routes for 'me' to allow teachers to view/update their own profile
router.get('/me', authenticate, (req, res, next) => {
    req.params.id = 'me';
    next();
}, teachersController.getById);

router.put('/me', authenticate, upload.single('image_profile'), (req, res, next) => {
    req.params.id = 'me';
    next();
}, teachersController.update);

router.get('/:id', authenticate, authorize('VIEW_TEACHERS'), teachersController.getById);

// This route handles fetching teachers by their assigned school.
// Principals can only access their own school, which is enforced in the controller.
router.get('/school/:school_id', authenticate, authorize('VIEW_TEACHERS'), teachersController.getBySchoolId);

router.post('', authenticate, authorize('MANAGE_TEACHERS'), upload.single('image_profile'), teachersController.create);
router.put('/:id', authenticate, authorize('MANAGE_TEACHERS'), upload.single('image_profile'), teachersController.update);
router.delete('/:id', authenticate, authorize('MANAGE_TEACHERS'), teachersController.remove);

module.exports = router;