const { body, param, validationResult } = require('express-validator');
const { sendError } = require('../controller/response.helper');
const db = require('../config/db');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const firstError = errors.array()[0].msg;
        return sendError(res, firstError, 400, errors.array());
    }
    next();
};

const validateSchool = [
    body('name')
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលឈ្មោះសាលា'),
    body('address')
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលអាសយដ្ឋាន'),
    body('email')
        .optional({ checkFalsy: true })
        .trim()
        .isEmail().withMessage('ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវ'),
    body('founded_date')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('កាលបរិច្ឆេទមិនត្រឹមត្រូវ'),
    validate
];

const validatePrincipal = [
    body('first_name')
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
    body('last_name')
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('email')
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលអ៊ីមែល')
        .bail()
        .isEmail().withMessage('ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវ')
        .bail()
        .custom(async (value) => {
            const [user] = await db.query('SELECT id FROM users WHERE email = ?', [value]);
            if (user.length > 0) {
                return Promise.reject('អ៊ីមែលនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
            }
            return true;
        }),
    body('password')
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលពាក្យសម្ងាត់')
        .isLength({ min: 6 }).withMessage('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួអក្សរ'),
    body('phone_number')
        .optional({ checkFalsy: true })
        .trim()
        .custom(async (value) => {
            if (value) {
                const [user] = await db.query('SELECT id FROM users WHERE phone_number = ?', [value]);
                if (user.length > 0) {
                    return Promise.reject('លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
                }
            }
            return true;
        }),
    body('address')
        .optional({ checkFalsy: true })
        .trim(),
    body('sex')
        .optional({ checkFalsy: true })
        .trim(),
    body('date_of_birth')
        .optional({ checkFalsy: true })
        .isISO8601().withMessage('កាលបរិច្ឆេទកំណើតមិនត្រឹមត្រូវ'),
    body('place_of_birth')
        .optional({ checkFalsy: true })
        .trim(),
    body('school_id')
        .customSanitizer(val => (val === 'null' || val === 'undefined' ? '' : val))
        .optional({ checkFalsy: true })
        .isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    body('experience')
        .customSanitizer(val => (val === 'null' || val === 'undefined' ? '' : val))
        .optional({ checkFalsy: true })
        .isInt().withMessage('បទពិសោធន៍ត្រូវតែជាលេខ'),
    validate
];

const validatePrincipalUpdate = [
    body('first_name')
        .optional()
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('last_name')
        .optional()
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
    body('phone_number')
        .optional({ checkFalsy: true })
        .trim()
        .custom(async (value, { req }) => {
            if (value) {
                let userId = req.params.id;
                if (userId === 'me') userId = req.user.id;
                const [user] = await db.query('SELECT id FROM users WHERE phone_number = ? AND id != ?', [value, userId]);
                if (user.length > 0) {
                    return Promise.reject('លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
                }
            }
            return true;
        }),
    body('school_id')
        .optional({ checkFalsy: true })
        .isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    body('experience')
        .optional({ checkFalsy: true })
        .isInt().withMessage('បទពិសោធន៍ត្រូវតែជាលេខ'),
    validate
];

const validateTeacher = [
    body('first_name').trim().notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
    body('last_name').trim().notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('email').trim().notEmpty().withMessage('សូមបញ្ចូលអ៊ីមែល').bail().isEmail().withMessage('ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវ').bail().custom(async (value) => {
        const [user] = await db.query('SELECT id FROM users WHERE email = ?', [value]);
        if (user.length > 0) return Promise.reject('អ៊ីមែលនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
        return true;
    }),
    body('password').trim().notEmpty().withMessage('សូមបញ្ចូលពាក្យសម្ងាត់').isLength({ min: 6 }).withMessage('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួអក្សរ'),
    body('phone_number').optional({ checkFalsy: true }).trim().isLength({ min: 8 }).withMessage('លេខទូរស័ព្ទមិនត្រឹមត្រូវ')
        .bail()
        .custom(async (value) => {
            if (value) {
                const [user] = await db.query('SELECT id FROM users WHERE phone_number = ?', [value]);
                if (user.length > 0) {
                    return Promise.reject('លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
                }
            }
            return true;
        }),
    body('address').optional({ checkFalsy: true }).trim(),
    body('sex').notEmpty().withMessage('សូមជ្រើសរើសភេទ'),
    body('date_of_birth').notEmpty().withMessage('សូមជ្រើសរើសថ្ងៃខែឆ្នាំកំណើត').bail().isISO8601().withMessage('កាលបរិច្ឆេទកំណើតមិនត្រឹមត្រូវ'),
    body('place_of_birth').optional({ checkFalsy: true }).trim(),
    body('school_id').customSanitizer(val => (val === 'null' || val === 'undefined' ? '' : val)).optional({ checkFalsy: true }).isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    body('experience').customSanitizer(val => (val === 'null' || val === 'undefined' ? '' : val)).optional({ checkFalsy: true }).isInt().withMessage('បទពិសោធន៍ត្រូវតែជាលេខ'),
    validate
];

const validateTeacherUpdate = [
    body('first_name')
        .optional()
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('last_name')
        .optional()
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
    body('phone_number')
        .optional({ checkFalsy: true })
        .trim()
        .custom(async (value, { req }) => {
            if (value) {
                let userId = req.params.id;
                if (userId === 'me') userId = req.user.id;
                const [user] = await db.query('SELECT id FROM users WHERE phone_number = ? AND id != ?', [value, userId]);
                if (user.length > 0) {
                    return Promise.reject('លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
                }
            }
            return true;
        }),
    body('school_id')
        .optional({ checkFalsy: true })
        .isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    body('experience')
        .optional({ checkFalsy: true })
        .isInt().withMessage('បទពិសោធន៍ត្រូវតែជាលេខ'),
    validate
];

const validateClass = [
    body('name').trim().notEmpty().withMessage('សូមបញ្ចូលឈ្មោះថ្នាក់'),
    body('school_id').optional({ checkFalsy: true }).isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    body('academic_year').trim().notEmpty().withMessage('សូមបញ្ចូលឆ្នាំសិក្សា'),
    body('start_date').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទចាប់ផ្តើមមិនត្រឹមត្រូវ'),
    body('end_date').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទបញ្ចប់មិនត្រឹមត្រូវ'),
    body('start_time').optional({ checkFalsy: true }).matches(/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('ម៉ោងចាប់ផ្តើមមិនត្រឹមត្រូវ'),
    body('end_time').optional({ checkFalsy: true }).matches(/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('ម៉ោងបញ្ចប់មិនត្រឹមត្រូវ'),
    validate
];

const validateClassUpdate = [
    body('name').optional().trim().notEmpty().withMessage('សូមបញ្ចូលឈ្មោះថ្នាក់'),
    body('school_id').optional().isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    body('academic_year').optional().trim().notEmpty().withMessage('សូមបញ្ចូលឆ្នាំសិក្សា'),
    body('start_date').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទចាប់ផ្តើមមិនត្រឹមត្រូវ'),
    body('end_date').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទបញ្ចប់មិនត្រឹមត្រូវ'),
    body('start_time').optional({ checkFalsy: true }).matches(/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('ម៉ោងចាប់ផ្តើមមិនត្រឹមត្រូវ'),
    body('end_time').optional({ checkFalsy: true }).matches(/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).withMessage('ម៉ោងបញ្ចប់មិនត្រឹមត្រូវ'),
    validate
];

const validateAssignStudent = [
    param('classId').isInt().withMessage('Class ID ត្រូវតែជាលេខ'),
    body('student_id')
        .notEmpty().withMessage('សូមជ្រើសរើសសិស្ស')
        .isInt().withMessage('Student ID ត្រូវតែជាលេខ'),
    validate
];

const validateStudent = [
    body('first_name').trim().notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('last_name').trim().notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
    body('email').trim().notEmpty().withMessage('សូមបញ្ចូលអ៊ីមែល').bail().isEmail().withMessage('ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវ').bail().custom(async (value) => {
        const [user] = await db.query('SELECT id FROM users WHERE email = ?', [value]);
        if (user.length > 0) return Promise.reject('អ៊ីមែលនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
        return true;
    }),
    body('password').trim().notEmpty().withMessage('សូមបញ្ចូលពាក្យសម្ងាត់').isLength({ min: 6 }).withMessage('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួ'),
    body('phone_number').optional({ checkFalsy: true }).trim()
        .custom(async (value) => {
            if (value) {
                const [user] = await db.query('SELECT id FROM users WHERE phone_number = ?', [value]);
                if (user.length > 0) {
                    return Promise.reject('លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
                }
            }
            return true;
        }),
    body('address').optional({ checkFalsy: true }).trim(),
    body('date_of_birth').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទកំណើតមិនត្រឹមត្រូវ'),
    body('enrollment_date').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទចុះឈ្មោះមិនត្រឹមត្រូវ'),
    body('school_id').customSanitizer(val => (val === 'null' || val === 'undefined' ? '' : val)).optional({ checkFalsy: true }).isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    validate
];

const validateStudentUpdate = [
    body('first_name').optional().trim().notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('last_name').optional().trim().notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
    body('phone_number').optional({ checkFalsy: true }).trim()
        .custom(async (value, { req }) => {
            if (value) {
                const [user] = await db.query('SELECT id FROM users WHERE phone_number = ? AND id != ?', [value, req.params.id]);
                if (user.length > 0) {
                    return Promise.reject('លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
                }
            }
            return true;
        }),
    body('date_of_birth').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទកំណើតមិនត្រឹមត្រូវ'),
    body('enrollment_date').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទចុះឈ្មោះមិនត្រឹមត្រូវ'),
    validate
];

const validateSubject = [
    body('name').trim().notEmpty().withMessage('សូមបញ្ចូលឈ្មោះមុខវិជ្ជា'),
    body('school_id').optional({ checkFalsy: true }).isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    body('description').optional({ checkFalsy: true }).trim(),
    validate
];

const validateSubjectUpdate = [
    body('name').optional().trim().notEmpty().withMessage('សូមបញ្ចូលឈ្មោះមុខវិជ្ជា'),
    body('description').optional({ checkFalsy: true }).trim(),
    validate
];

const validateSchedule = [
    body('class_id').isInt().withMessage('Class ID ត្រូវតែជាលេខ'),
    body('teacher_id').isInt().withMessage('Teacher ID ត្រូវតែជាលេខ'),
    body('subject_id').isInt().withMessage('Subject ID ត្រូវតែជាលេខ'),
    body('day_of_week').trim().notEmpty().withMessage('សូមជ្រើសរើសថ្ងៃ'),
    body('start_time').trim().notEmpty().withMessage('សូមបញ្ចូលម៉ោងចាប់ផ្តើម'),
    body('end_time').trim().notEmpty().withMessage('សូមបញ្ចូលម៉ោងបញ្ចប់'),
    validate
];

const validateScheduleUpdate = [
    body('class_id').optional().isInt().withMessage('Class ID ត្រូវតែជាលេខ'),
    body('teacher_id').optional().isInt().withMessage('Teacher ID ត្រូវតែជាលេខ'),
    body('subject_id').optional().isInt().withMessage('Subject ID ត្រូវតែជាលេខ'),
    body('day_of_week').optional().trim().notEmpty().withMessage('សូមជ្រើសរើសថ្ងៃ'),
    body('start_time').optional().trim().notEmpty().withMessage('សូមបញ្ចូលម៉ោងចាប់ផ្តើម'),
    body('end_time').optional().trim().notEmpty().withMessage('សូមបញ្ចូលម៉ោងបញ្ចប់'),
    validate
];

const validateAcademicResult = [
    body('records').isArray({ min: 1 }).withMessage('សូមបញ្ចូលទិន្នន័យលទ្ធផលសិក្សា'),
    body('records.*.student_id').isInt().withMessage('Student ID ត្រូវតែជាលេខ'),
    body('records.*.class_id').isInt().withMessage('Class ID ត្រូវតែជាលេខ'),
    body('records.*.subject_id').isInt().withMessage('Subject ID ត្រូវតែជាលេខ'),
    body('records.*.academic_period').trim().notEmpty().withMessage('សូមបញ្ចូលឆមាស/ខែ'),
    body('records.*.final_grade').isFloat({ min: 0 }).withMessage('ពិន្ទុមិនត្រឹមត្រូវ'),
    validate
];

const validateEvent = [
    body('title').trim().notEmpty().withMessage('សូមបញ្ចូលចំណងជើងព្រឹត្តិការណ៍'),
    body('start_date')
        .notEmpty().withMessage('សូមជ្រើសរើសកាលបរិច្ឆេទចាប់ផ្តើម')
        .isISO8601().withMessage('ទម្រង់កាលបរិច្ឆេទមិនត្រឹមត្រូវ'),
    body('end_date')
        .notEmpty().withMessage('សូមជ្រើសរើសកាលបរិច្ឆេទបញ្ចប់')
        .isISO8601().withMessage('ទម្រង់កាលបរិច្ឆេទមិនត្រឹមត្រូវ')
        .custom((value, { req }) => {
            if (req.body.start_date && new Date(value) <= new Date(req.body.start_date)) {
                throw new Error('កាលបរិច្ឆេទបញ្ចប់ត្រូវតែនៅក្រោយកាលបរិច្ឆេទចាប់ផ្តើម');
            }
            return true;
        }),
    body('map_link')
        .optional({ checkFalsy: true })
        .isURL().withMessage('តំណភ្ជាប់ផែនទីមិនត្រឹមត្រូវ'),
    validate
];

const validateEventUpdate = [
    body('title').optional().trim().notEmpty().withMessage('សូមបញ្ចូលចំណងជើងព្រឹត្តិការណ៍'),
    body('start_date').optional().isISO8601().withMessage('ទម្រង់កាលបរិច្ឆេទមិនត្រឹមត្រូវ'),
    body('end_date').optional().isISO8601().withMessage('ទម្រង់កាលបរិច្ឆេទមិនត្រឹមត្រូវ')
        .custom((value, { req }) => {
            if (req.body.start_date && value && new Date(value) <= new Date(req.body.start_date)) {
                throw new Error('កាលបរិច្ឆេទបញ្ចប់ត្រូវតែនៅក្រោយកាលបរិច្ឆេទចាប់ផ្តើម');
            }
            return true;
        }),
    body('map_link').optional({ checkFalsy: true }).isURL().withMessage('តំណភ្ជាប់ផែនទីមិនត្រឹមត្រូវ'),
    validate
];

const validateLogin = [
    body('email').trim().notEmpty().withMessage('សូមបញ្ចូលអ៊ីមែល').isEmail().withMessage('ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវ'),
    body('password').trim().notEmpty().withMessage('សូមបញ្ចូលពាក្យសម្ងាត់'),
    validate
];

const validateChangePassword = [
    body('current_password').trim().notEmpty().withMessage('សូមបញ្ចូលពាក្យសម្ងាត់បច្ចុប្បន្ន'),
    body('new_password').trim().notEmpty().withMessage('សូមបញ្ចូលពាក្យសម្ងាត់ថ្មី').isLength({ min: 6 }).withMessage('ពាក្យសម្ងាត់ថ្មីត្រូវមានយ៉ាងតិច ៦ តួ'),
    validate
];

const validateProfileUpdate = [
    body('first_name').optional().trim().notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('last_name').optional().trim().notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
    body('phone_number').optional({ checkFalsy: true }).trim()
        .custom(async (value, { req }) => {
            if (value) {
                const [user] = await db.query('SELECT id FROM users WHERE phone_number = ? AND id != ?', [value, req.user.id]);
                if (user.length > 0) {
                    return Promise.reject('លេខទូរស័ព្ទនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
                }
            }
            return true;
        }),
    validate
];

const validateAttendance = [
    body('class_id').isInt().withMessage('Class ID ត្រូវតែជាលេខ'),
    body('date').isISO8601().withMessage('កាលបរិច្ឆេទមិនត្រឹមត្រូវ'),
    body('records').isArray({ min: 1 }).withMessage('សូមបញ្ចូលទិន្នន័យវត្តមាន'),
    body('records.*.student_id').isInt().withMessage('Student ID ត្រូវតែជាលេខ'),
    body('records.*.status').isIn(['present', 'absent', 'permission', 'late']).withMessage('ស្ថានភាពវត្តមានមិនត្រឹមត្រូវ'),
    validate
];

const validateScore = [
    body('records').isArray({ min: 1 }).withMessage('សូមបញ្ចូលទិន្នន័យពិន្ទុ'),
    body('records.*.student_id').isInt().withMessage('Student ID ត្រូវតែជាលេខ'),
    body('records.*.class_id').isInt().withMessage('Class ID ត្រូវតែជាលេខ'),
    body('records.*.subject_id').isInt().withMessage('Subject ID ត្រូវតែជាលេខ'),
    body('records.*.score').isFloat({ min: 0 }).withMessage('ពិន្ទុមិនត្រឹមត្រូវ'),
    body('records.*.date_recorded').isISO8601().withMessage('កាលបរិច្ឆេទមិនត្រឹមត្រូវ'),
    validate
];

module.exports = {
    validateSchool,
    validatePrincipal,
    validatePrincipalUpdate,
    validateTeacher,
    validateTeacherUpdate,
    validateClass,
    validateClassUpdate,
    validateAssignStudent,
    validateStudent,
    validateStudentUpdate,
    validateSubject,
    validateSubjectUpdate,
    validateSchedule,
    validateScheduleUpdate,
    validateAcademicResult,
    validateEvent,
    validateEventUpdate,
    validateLogin,
    validateChangePassword,
    validateProfileUpdate,
    validateAttendance,
    validateScore
};