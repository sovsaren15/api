const express = require('express');
const router = express.Router();
const principalsController = require('../controller/principals.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');

// ==> GET principal's dashboard data
// This must come before the /:id route to be matched correctly
router.get('/dashboard', authenticate, authorize('VIEW_DASHBOARD'), principalsController.getPrincipalDashboard);

// ==> GET current principal's own data
// This is used by the principal frontend to get their school_id
router.get('/me', authenticate, authorize('VIEW_OWN_PROFILE_PRINCIPAL'), principalsController.getMe);

// ==> GET all principals (Admin only)
router.get('', authenticate, authorize('MANAGE_PRINCIPALS'), principalsController.getAll);

// ==> GET a single principal by ID (Admin only)
router.get('/:id', authenticate, authorize('MANAGE_PRINCIPALS'), principalsController.getById);

// ==> CREATE a new principal (Admin only)
router.post('', authenticate, authorize('MANAGE_PRINCIPALS'), principalsController.create);

// ==> UPDATE a principal by ID (Admin only)
router.put('/:id', authenticate, authorize('MANAGE_PRINCIPALS'), principalsController.update);

// ==> DELETE a principal by ID (Admin only)
router.delete('/:id', authenticate, authorize('MANAGE_PRINCIPALS'), principalsController.remove);

module.exports = router;