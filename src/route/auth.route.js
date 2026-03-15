const express = require('express');
const router = express.Router();
const authController = require('../controller/auth.controller');
const { authenticate } = require('../middleware/auth.middleware.js');
const { validateLogin, validateChangePassword, validateProfileUpdate } = require('../middleware/validation.middleware.js');

// POST /api/auth/login
router.post('/login', validateLogin, authController.login);

// GET /api/auth/validate-token
router.get('/validate-token', authenticate, authController.validateToken);

// POST /api/auth/change-password
router.post('/change-password', authenticate, validateChangePassword, authController.changePassword);

// PUT /api/auth/profile
router.put('/profile', authenticate, validateProfileUpdate, authController.updateProfile);

module.exports = router;