/**
 * Sends a standardized success response.
 * @param {object} res - The Express response object.
 * @param {object|Array} data - The payload to send.
 * @param {number} [statusCode=200] - The HTTP status code.
 */
const sendSuccess = (res, data, statusCode = 200) => {
    res.status(statusCode).json({
        success: true,
        data: data,
    });
};

/**
 * Sends a standardized error response.
 * @param {object} res - The Express response object.
 * @param {string} message - The error message.
 * @param {number} [statusCode=500] - The HTTP status code.
 * @param {Array} [details=null] - Optional array of validation errors or other details.
 */
const sendError = (res, message, statusCode = 500, details = null) => {
    const errorResponse = {
        success: false,
        error: {
            message: message,
        },
    };

    if (details) {
        errorResponse.error.details = details;
    }

    res.status(statusCode).json(errorResponse);
};

module.exports = { sendSuccess, sendError };