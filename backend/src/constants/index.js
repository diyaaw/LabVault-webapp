/**
 * Application-wide constants
 * Use these instead of hardcoded strings throughout the codebase.
 */

const ROLES = {
    PATIENT: 'patient',
    DOCTOR: 'doctor',
    PATHOLOGY: 'pathology',
    SUPER_ADMIN: 'SuperAdmin',
};

const USER_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    SUSPENDED: 'SUSPENDED',
};

const NOTIFICATION_TYPES = {
    NEW_REPORT: 'new_report',
    ACCOUNT_APPROVED: 'account_approved',
    ACCESS_GRANTED: 'access_granted',
    CLINICAL_NOTE: 'clinical_note',
};

const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
};

module.exports = { ROLES, USER_STATUS, NOTIFICATION_TYPES, HTTP_STATUS };
