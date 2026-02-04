const fs = require("fs/promises");
const moment = require("moment");
const { validationResult } = require("express-validator");
const path = require("path");

const logError = async (context, error) => {
    try {
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const logDir = path.join(__dirname, '..', 'logs');
        const logFile = path.join(logDir, `error.log`);

        // Ensure the logs directory exists
        await fs.mkdir(logDir, { recursive: true });

        // Use the error stack for more detailed logging
        const logMessage = `[${timestamp}] [${context}] ${error.stack || error}\n\n`;

        await fs.appendFile(logFile, logMessage);
    } catch (logWriteError) {
        console.error("Error writing to log file:", logWriteError);
        console.error("Original error that was not logged:", error);
    }
};

const validatorCheck = (req, res, next) => {
    const errors = validationResult(req);
    if(errors.isEmpty()){
        return next();
    }
    // Pass a structured error to the central error handler
    const validationError = new Error('Validation failed');
    validationError.status = 400;
    validationError.details = errors.array();
    next(validationError);
};
module.exports = { 
    logError ,
    validatorCheck};