const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const errorHandler = require('./middleware/error.middleware');

// Load env vars
dotenv.config();

// Route files
const authRoutes = require('./route/auth.route');
const adminSchoolRoutes = require('./route/admin/school.route');
const adminEventRoutes = require('./route/admin/event.route');
const adminPrincipalRoutes = require('./route/admin/principal.route');
const principalRoutes = require('./route/principal.route');
const teacherRoutes = require('./route/teacher.route'); // Import teacher routes

const app = express();

// Body parser
app.use(express.json());

// Enable CORS
app.use(cors());

// Mount routers
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin/schools', adminSchoolRoutes);
app.use('/api/v1/admin/events', adminEventRoutes);
app.use('/api/v1/admin/principals', adminPrincipalRoutes);
app.use('/api/v1/principals', principalRoutes);
app.use('/api/v1/teachers', teacherRoutes); // Mount teacher routes

app.use(errorHandler);

const PORT = process.env.PORT || 8081;

app.listen(PORT, console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`));