/**
 * Centralized permission configuration.
 * Maps a permission name to an array of roles that have that permission.
 */
const PERMISSIONS = {
    // School Management
    MANAGE_SCHOOLS: ['admin'],

    // Principal Management
    MANAGE_PRINCIPALS: ['admin'],
    VIEW_OWN_PROFILE_PRINCIPAL: ['principal'],

    // Teacher Management
    MANAGE_TEACHERS: ['admin', 'principal'],
    VIEW_TEACHERS: ['admin', 'principal', 'teacher'],

    // Student Management
    MANAGE_STUDENTS: ['principal', 'teacher'],
    VIEW_STUDENTS: ['teacher', 'principal'],

    // Class Management
    MANAGE_CLASSES: ['principal', 'teacher'],
    VIEW_CLASSES: ['admin', 'principal', 'teacher'],
    DELETE_CLASSES: ['admin', 'principal'], // More restrictive than general management

    // Subject & Event Management
    MANAGE_SUBJECTS: ['admin', 'principal'],
    MANAGE_EVENTS: ['admin', 'principal'],
    MANAGE_SCHEDULES: ['admin', 'principal'],

    // Academic Records
    RECORD_ATTENDANCE: ['teacher'],
    VIEW_ATTENDANCE: ['admin', 'principal', 'teacher'],
    MANAGE_SCORES: ['admin', 'principal', 'teacher'],
    MANAGE_ACADEMIC_RESULTS: ['teacher'],

    // Dashboard
    VIEW_DASHBOARD: ['principal'],
};

module.exports = PERMISSIONS;