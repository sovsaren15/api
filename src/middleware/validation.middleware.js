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
        .notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('last_name')
        .trim()
        .notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
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
        .isLength({ min: 6 }).withMessage('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួ'),
    body('phone_number')
        .optional({ checkFalsy: true })
        .trim(),
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
        .trim(),
    body('school_id')
        .optional({ checkFalsy: true })
        .isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    body('experience')
        .optional({ checkFalsy: true })
        .isInt().withMessage('បទពិសោធន៍ត្រូវតែជាលេខ'),
    validate
];

const validateTeacher = [
    body('first_name').trim().notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('last_name').trim().notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
    body('email').trim().notEmpty().withMessage('សូមបញ្ចូលអ៊ីមែល').bail().isEmail().withMessage('ទម្រង់អ៊ីមែលមិនត្រឹមត្រូវ').bail().custom(async (value) => {
        const [user] = await db.query('SELECT id FROM users WHERE email = ?', [value]);
        if (user.length > 0) return Promise.reject('អ៊ីមែលនេះមានរួចហើយនៅក្នុងប្រព័ន្ធ');
        return true;
    }),
    body('password').trim().notEmpty().withMessage('សូមបញ្ចូលពាក្យសម្ងាត់').isLength({ min: 6 }).withMessage('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួ'),
    body('phone_number').optional({ checkFalsy: true }).trim(),
    body('address').optional({ checkFalsy: true }).trim(),
    body('sex').optional({ checkFalsy: true }).trim(),
    body('date_of_birth').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទកំណើតមិនត្រឹមត្រូវ'),
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
        .trim(),
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
    validate
];

const validateClassUpdate = [
    body('name').optional().trim().notEmpty().withMessage('សូមបញ្ចូលឈ្មោះថ្នាក់'),
    body('school_id').optional().isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    body('academic_year').optional().trim().notEmpty().withMessage('សូមបញ្ចូលឆ្នាំសិក្សា'),
    body('start_date').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទចាប់ផ្តើមមិនត្រឹមត្រូវ'),
    body('end_date').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទបញ្ចប់មិនត្រឹមត្រូវ'),
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
    body('phone_number').optional({ checkFalsy: true }).trim(),
    body('address').optional({ checkFalsy: true }).trim(),
    body('date_of_birth').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទកំណើតមិនត្រឹមត្រូវ'),
    body('enrollment_date').optional({ checkFalsy: true }).isISO8601().withMessage('កាលបរិច្ឆេទចុះឈ្មោះមិនត្រឹមត្រូវ'),
    body('school_id').customSanitizer(val => (val === 'null' || val === 'undefined' ? '' : val)).optional({ checkFalsy: true }).isInt().withMessage('School ID ត្រូវតែជាលេខ'),
    validate
];

const validateStudentUpdate = [
    body('first_name').optional().trim().notEmpty().withMessage('សូមបញ្ចូលនាមត្រកូល'),
    body('last_name').optional().trim().notEmpty().withMessage('សូមបញ្ចូលនាមខ្លួន'),
    body('phone_number').optional({ checkFalsy: true }).trim(),
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
    validateSubjectUpdate
};