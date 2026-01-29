const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());

// Increase the limit for JSON and URL-encoded bodies
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Handle CORS preflight requests
app.options('*', cors());

// Handle JSON and form data for applications endpoint
app.use('/api/applications', (req, res, next) => {
  if (req.method === 'POST') {
    if (req.is('application/json')) {
      express.json()(req, res, next);
    } else if (req.is('multipart/form-data')) {
      next();
    } else {
      express.urlencoded({ extended: true })(req, res, next);
    }
  } else {
    next();
  }
});

// For file uploads, we'll use multer's middleware directly in the routes

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const authRoutes = require('./routes/auth');
const newsRoutes = require('./routes/news');
const applicationsRoutes = require('./routes/applications');
const { router: uploadRoutes } = require('./routes/upload');
const testimonialsRoutes = require('./routes/testimonials');
const settingsRoutes = require('./routes/settings');
const studentAuthRoutes = require('./routes/studentAuth');
const studentProfileRoutes = require('./routes/studentProfile');
const studentAnalyticsRoutes = require('./routes/studentAnalytics');
const studentAttendanceRoutes = require('./routes/studentAttendance');
const studentAssignmentsRoutes = require('./routes/studentAssignments');
const studentNotificationsRoutes = require('./routes/studentNotifications');
const blogRoutes = require('./routes/blog');
const institutionTransfersRoutes = require('./routes/institutionTransfers');
const teacherAuthRoutes = require('./routes/teacherAuth');
const teacherStatsRoutes = require('./routes/teacherStats');
const teacherStudentsRoutes = require('./routes/teacherStudents');
const teacherAssignmentsRoutes = require('./routes/teacherAssignments');
const teacherAttendanceRoutes = require('./routes/teacherAttendance');
const examsRoutes = require('./routes/exams');
const resultsRoutes = require('./routes/results');
const adminStudentsRoutes = require('./routes/adminStudents');
const adminUsersRoutes = require('./routes/adminUsers');
const analyticsRoutes = require('./routes/analytics');

app.use('/api/auth', authRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/testimonials', testimonialsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/student/auth', studentAuthRoutes);
app.use('/api/student', studentProfileRoutes);
app.use('/api/student/analytics', studentAnalyticsRoutes);
app.use('/api/student/attendance', studentAttendanceRoutes);
app.use('/api/student/assignments', studentAssignmentsRoutes);
app.use('/api/student/notifications', studentNotificationsRoutes);
app.use('/api/teacher/auth', teacherAuthRoutes);
app.use('/api/teacher/stats', teacherStatsRoutes);
app.use('/api/teacher/students', teacherStudentsRoutes);
app.use('/api/teacher/assignments', teacherAssignmentsRoutes);
app.use('/api/teacher/attendance', teacherAttendanceRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/transfers', institutionTransfersRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/admin/students', adminStudentsRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/analytics', analyticsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'CSAM Backend API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Function to get next available port
const getPort = (port) => {
  const portNum = parseInt(port, 10);
  const server = require('http').createServer();
  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${portNum} is in use, trying port ${portNum + 1}...`);
        resolve(getPort(portNum + 1));
      } else {
        reject(err);
      }
    });
    server.listen(portNum, () => {
      const usedPort = server.address().port;
      server.close();
      resolve(usedPort);
    });
  });
};

// Start server
const startServer = async () => {
  try {
    const PORT = process.env.PORT || 13642;
    const availablePort = await getPort(PORT);

    app.listen(availablePort, () => {
      console.log(`🚀 Server is running on port ${availablePort}`);
      console.log(`📍 API URL: http://localhost:${availablePort}/api`);

      // Also log the URL that should be used in the frontend
      console.log('\n=== IMPORTANT ===');
      console.log(`Update your frontend to use: http://localhost:${availablePort}/api`);
      console.log('=================\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
