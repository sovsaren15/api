const express = require('express');
const router = express.Router();
const subjectsController = require('../controller/subjects.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');
const { validateSubject, validateSubjectUpdate } = require('../middleware/validation.middleware.js');

router.get('/school/:schoolId', authenticate, subjectsController.getBySchoolId);
router.get('', authenticate, subjectsController.getAll);
router.get('/:id', authenticate, subjectsController.getById);
router.post('', authenticate, authorize('MANAGE_SUBJECTS'), validateSubject, subjectsController.create);
router.put('/:id', authenticate, authorize('MANAGE_SUBJECTS'), validateSubjectUpdate, subjectsController.update);
router.delete('/:id', authenticate, authorize('MANAGE_SUBJECTS'), subjectsController.remove);

module.exports = router;