const { sendError } = require('../controller/response.helper');

const validateAssignStudent = (req, res, next) => {
    const { student_id } = req.body;

    if (!student_id) {
        return sendError(res, "student_id is required.", 400);
    }
    next();
};

module.exports = {
    validateAssignStudent
};