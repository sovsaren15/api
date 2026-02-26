const express = require('express');
const router = express.Router();
const scoresController = require('../controller/scores.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware.js');

// Any authenticated user can view scores, filtering is done on the frontend/controller
router.get('/report', authenticate, scoresController.getScoreReport);

router.get('/student/attendance-stats', authenticate, scoresController.getAttendanceStats);
router.get('/student/rank', authenticate, scoresController.getStudentRank);
router.get('/student/me', authenticate, scoresController.getMyScores);
router.get('/student/:studentId', authenticate, scoresController.getByStudentId);
router.get('', authenticate, scoresController.getAll);
// Teachers and above can manage scores
router.post('', authenticate, authorize('MANAGE_SCORES'), scoresController.createOrUpdate);
router.delete('/:id', authenticate, authorize('MANAGE_SCORES'), scoresController.remove);

module.exports = router;