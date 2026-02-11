const jwt = require("jsonwebtoken");
const db = require("../config/db");

const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) {
      return res.status(401).json({ message: "Authentication required" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Get user with role information
    const [users] = await db.query(
      `SELECT u.*, r.name as role_name,
       COALESCE(t.image_profile, s.image_profile) as image_profile
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       LEFT JOIN teachers t ON u.id = t.user_id
       LEFT JOIN students s ON u.id = s.user_id
       WHERE u.id = ?`,
      [decoded.userId],
    )

    if (users.length === 0) {
      return res.status(401).json({ message: "User not found" })
    }

    const user = users[0];
    // Standardize the role name to lowercase to match permissions.config.js
    user.role_name = user.role_name.toLowerCase();

    req.user = user;
    next()
  } catch (error) {
    // Pass JWT-related and other errors to the central error handler
    error.status = 401; // Set a default status for auth errors
    next(error);
  }
}

const PERMISSIONS = require('../config/permissions.config');

const authorize = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" })
    }

    const allowedRoles = PERMISSIONS[permission];
    if (!allowedRoles) {
      // This is a developer error, the permission doesn't exist.
      return res.status(500).json({ message: `Permission '${permission}' not found.` });
    }

    if (!allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({
        message: "Access denied. Insufficient permissions.",
      })
    }

    next()
  }
}

const checkPermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const [permissions] = await db.query(
        `SELECT p.name 
         FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         WHERE rp.role_id = ? AND p.name = ?`,
        [req.user.role_id, permissionName],
      )

      if (permissions.length === 0) {
        return res.status(403).json({
          message: "Access denied. You do not have the required permission.",
        })
      }

      next()
    } catch (error) {
      next(error);
    }
  }
}

const checkRoleHierarchy = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" })
    }

    if (!allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({
        message: `Access denied. Only ${allowedRoles.join(" and ")} can perform this action.`,
      })
    }

    next()
  }
}

module.exports = {
  authenticate,
  authorize,
  checkPermission,
  checkRoleHierarchy,
};
