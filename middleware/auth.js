const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
require('dotenv').config();

const PRESENCE_UPDATE_INTERVAL_MS = 60 * 1000;

const maybeUpdatePresence = async (user) => {
  if (!user?.id || !user?.role) {
    return;
  }

  const recentThreshold = new Date(Date.now() - PRESENCE_UPDATE_INTERVAL_MS);

  try {
    if (user.role === 'student') {
      await Student.updateOne(
        {
          _id: user.id,
          $or: [
            { last_seen_at: { $exists: false } },
            { last_seen_at: null },
            { last_seen_at: { $lt: recentThreshold } },
          ],
        },
        { $set: { last_seen_at: new Date() } }
      );
      return;
    }

    if (user.role === 'teacher') {
      await Teacher.updateOne(
        {
          _id: user.id,
          $or: [
            { last_seen_at: { $exists: false } },
            { last_seen_at: null },
            { last_seen_at: { $lt: recentThreshold } },
          ],
        },
        { $set: { last_seen_at: new Date() } }
      );
    }
  } catch (error) {
    console.error('Presence update failed:', error);
  }
};

const authenticateToken = (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token, access denied'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    void maybeUpdatePresence(decoded);
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Token is not valid'
    });
  }
};

module.exports = { authenticateToken };
