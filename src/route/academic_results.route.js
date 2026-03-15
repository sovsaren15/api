const express = require('express');
const router = express.Router();
const academicResultsController = require('../controller/academic_results.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { validateAcademicResult } = require('../middleware/validation.middleware.js');

// Any authenticated user can view results
router.get('', authenticate, academicResultsController.getAll);
// Only teachers can manage (create, updatew, delete) results
// teachers published the results
router.post('', authenticate, authorize('MANAGE_ACADEMIC_RESULTS'), validateAcademicResult, academicResultsController.createOrUpdate);
router.delete('/:id', authenticate, authorize('MANAGE_ACADEMIC_RESULTS'), academicResultsController.remove);

module.exports = router;