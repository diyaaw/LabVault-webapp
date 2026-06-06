const { createNotification } = require('../services/notificationService');

exports.getNotifications = async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        const notifications = await Notification.find({ recipient: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20)
            .populate('actor', 'name role avatarUrl');

        res.status(200).json({
            success: true,
            notifications
        });
    } catch (error) {
        console.error('Get Notifications Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const Notification = require('../models/Notification');
        const { id } = req.params;

        if (id === 'all') {
            await Notification.updateMany(
                { recipient: req.user.id, isRead: false },
                { isRead: true }
            );
        } else {
            await Notification.findOneAndUpdate(
                { _id: id, recipient: req.user.id },
                { isRead: true }
            );
        }

        res.status(200).json({ success: true, message: 'Notification(s) marked as read' });
    } catch (error) {
        console.error('Mark As Read Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// Re-export from service for any legacy callers that import from this controller
exports.createNotification = createNotification;
