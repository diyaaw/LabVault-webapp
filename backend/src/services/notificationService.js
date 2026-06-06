const Notification = require('../models/Notification');

/**
 * Creates and persists a notification document.
 * This is a shared service used by multiple controllers.
 *
 * @param {Object} params
 * @param {string} params.recipient - User ID of the notification recipient
 * @param {string} params.actor     - User ID of the actor who triggered the event
 * @param {string} params.type      - Notification type (see NOTIFICATION_TYPES in constants)
 * @param {string} params.message   - Human-readable message
 * @param {string} params.link      - Frontend route to navigate to on click
 * @returns {Promise<Notification>}
 */
const createNotification = async ({ recipient, actor, type, message, link }) => {
    try {
        const notification = new Notification({ recipient, actor, type, message, link });
        await notification.save();
        return notification;
    } catch (error) {
        // Non-fatal: log but do not crash the parent request
        console.error('[NotificationService] Failed to create notification:', error.message);
    }
};

module.exports = { createNotification };
