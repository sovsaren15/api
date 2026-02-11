// routes/schoolRoutes.js
const express = require('express');
const router = express.Router();
const schoolController = require('../controller/schools.controller.js');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const upload = require('../middleware/upload.middleware');

// ==> CREATE a new school (Admin only)
router.post('', authenticate, authorize('MANAGE_SCHOOLS'), upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), schoolController.create);

// ==> READ all schools (Any authenticated user)
router.get('', authenticate, schoolController.getAll);

// ==> READ a single school by ID (Any authenticated user)
router.get('/:id', authenticate, schoolController.getById);

// ==> UPDATE a school by ID (Admin or Principal for own school)
router.put('/:id', authenticate, upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), schoolController.update);

// ==> DELETE a school by ID (Admin only)
router.delete('/:id', authenticate, authorize('MANAGE_SCHOOLS'), schoolController.remove);

module.exports = router;