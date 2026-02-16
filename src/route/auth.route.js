const express = require('express');
const router = express.Router();
const authController = require('../controller/auth.controller');
const { authenticate } = require('../middleware/auth.middleware.js');

// POST /api/auth/login
router.post('/login', authController.login);

// GET /api/auth/validate-token
router.get('/validate-token', authenticate, authController.validateToken);

// POST /api/auth/change-password
router.post('/change-password', authenticate, authController.changePassword);

// PUT /api/auth/profile
router.put('/profile', authenticate, authController.updateProfile);

module.exports = router;