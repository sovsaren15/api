// routes/schoolRoutes.js
const express = require('express');
const router = express.Router();
const schoolController = require('../controller/schools.controller.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');

// ==> CREATE a new school (Admin only)
router.post('', authenticate, authorize('MANAGE_SCHOOLS'), schoolController.create);

// ==> READ all schools (Any authenticated user)
router.get('', authenticate, schoolController.getAll);

// ==> READ a single school by ID (Any authenticated user)
router.get('/:id', authenticate, schoolController.getById);

// ==> UPDATE a school by ID (Admin only)
router.put('/:id', authenticate, authorize('MANAGE_SCHOOLS'), schoolController.update);

// ==> DELETE a school by ID (Admin only)
router.delete('/:id', authenticate, authorize('MANAGE_SCHOOLS'), schoolController.remove);

module.exports = router;