require('dotenv').config();

const express = require('express');
const cors = require('cors');
const app = express();
const classesRoutes = require('./src/route/classes.route');
const schoolRoutes = require('./src/route/schools.route');
const studentRoutes = require('./src/route/students.route');
const teacherRoutes = require('./src/route/teachers.route');
const principalRoutes = require('./src/route/principals.route');
const authRoutes = require('./src/route/auth.route');
const subjectRoutes = require('./src/route/subjects.route');
const eventRoutes = require('./src/route/events.route');
const studyScheduleRoutes = require('./src/route/study_schedules.route');
const attendanceRoutes = require('./src/route/attendance.route');
const scoreRoutes = require('./src/route/scores.route');
const academicResultRoutes = require('./src/route/academic_results.route');
const { errorHandler } = require('./src/middleware/error.middleware');

// Middleware to parse JSON bodies
app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/principals', principalRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/schedules', studyScheduleRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/scores', scoreRoutes);
app.use('/api/academic-results', academicResultRoutes);

// Central Error Handler Middleware
app.use(errorHandler);

const PORT = 8081;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
