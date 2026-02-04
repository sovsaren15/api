const express = require('express');
const router = express.Router();
const teachersController = require('../controller/teachers.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');

// Define routes for teachers
router.get('/dashboard', authenticate, authorize('VIEW_TEACHERS'), teachersController.getTeacherDashboard);
router.get('', authenticate, authorize('VIEW_TEACHERS'), teachersController.getAll);
router.get('/:id', authenticate, authorize('VIEW_TEACHERS'), teachersController.getById);

// This route handles fetching teachers by their assigned school.
// Principals can only access their own school, which is enforced in the controller.
router.get('/school/:school_id', authenticate, authorize('VIEW_TEACHERS'), teachersController.getBySchoolId);

router.post('', authenticate, authorize('MANAGE_TEACHERS'), teachersController.create);
router.put('/:id', authenticate, authorize('MANAGE_TEACHERS'), teachersController.update);
router.delete('/:id', authenticate, authorize('MANAGE_TEACHERS'), teachersController.remove);

module.exports = router;