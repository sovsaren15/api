const { logError } = require("../config/service");
const { sendError } = require("../controller/response.helper");

const errorHandler = async (err, req, res, next) => {
  // Log the error to a file for debugging
  await logError(`${req.method} ${req.path}`, err);

  // MySQL errors
  if (err.code === "ER_DUP_ENTRY") {
    return sendError(res, "Duplicate entry. This record already exists.", 409);
  }

  if (err.code === "ER_NO_REFERENCED_ROW_2") {
    return sendError(res, "Invalid reference. A related record (like a school or user) does not exist.", 400);
  }

  // Validation errors
  if (err.message === "Validation failed" && err.details) {
    return sendError(res, err.message, 400, err.details);
  }

  // Custom App Errors (e.g., from services)
  if (err.status) {
    return sendError(res, err.message, err.status);
  }

  // Default error
  return sendError(res, err.message || "Internal Server Error", 500);
};

module.exports = {
  errorHandler
};
