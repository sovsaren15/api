const express = require('express');
const router = express.Router();
const classesController = require('../controller/classes.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');

// Define routes for classes

// ==> GET all classes (with filtering/pagination)
router.get('', authenticate, authorize('VIEW_CLASSES'), classesController.getAll);

// ==> GET classes by school ID
// Principals can only access their own school's classes, enforced in controller
router.get('/school/:school_id', authenticate, authorize('VIEW_CLASSES'), classesController.getClassBySchoolId);

// ==> GET classes assigned to the logged-in teacher
router.get('/teacher/me', authenticate, authorize('VIEW_CLASSES'), classesController.getTeacherClasses);

// ==> GET a single class by ID (with schedules and students)
router.get('/:id', authenticate, authorize('VIEW_CLASSES'), classesController.getById);

// ==> CREATE a new class
router.post('', authenticate, authorize('MANAGE_CLASSES'), classesController.create);

// ==> UPDATE a class by ID
router.put('/:id', authenticate, authorize('MANAGE_CLASSES'), classesController.update);

// ==> DELETE a class by ID
router.delete('/:id', authenticate, authorize('MANAGE_CLASSES'), classesController.remove);

// ==> ASSIGN a student to a class
router.post('/:classId/students', authenticate, authorize('MANAGE_CLASSES'), classesController.assignStudent);

// ==> REMOVE a student from a class
router.delete('/:classId/students/:studentId', authenticate, authorize('MANAGE_CLASSES'), classesController.removeStudent);


module.exports = router;    