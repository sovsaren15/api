const db = require('../config/db');
const { logError } = require("../config/service");
const { getTeacherIdFromUserId, bulkUpsert } = require('../route/record.service');
const { sendSuccess, sendError } = require('./response.helper');
const QueryBuilder = require('./query.helper');

const getAll = async (req, res, next) => {
    try {
        const baseQuery = `
            SELECT 
                sc.id, sc.score, sc.assessment_type, sc.date_recorded,
                st.id as student_id,
                CONCAT(u.first_name, ' ', u.last_name) as student_name,
                st.date_of_birth,
                c.name as class_name,
                sub.name as subject_name
            FROM scores sc
            JOIN students st ON sc.student_id = st.id
            JOIN users u ON st.user_id = u.id
            JOIN classes c ON sc.class_id = c.id
            JOIN subjects sub ON sc.subject_id = sub.id
        `;

        const builder = new QueryBuilder(baseQuery);

        builder.applyFilters(req.query, {
            class_id: 'sc.class_id',
            student_id: 'sc.student_id',
            subject_id: 'sc.subject_id',
            assessment_type: 'sc.assessment_type',
            date_recorded: 'sc.date_recorded'
        });

        if (req.query.date_from) {
            builder.whereClauses.push('sc.date_recorded >= ?');
            builder.params.push(req.query.date_from);
        }

        if (req.query.date_to) {
            builder.whereClauses.push('sc.date_recorded <= ?');
            builder.params.push(req.query.date_to);
        }

        // Build the filtered query first (WHERE clause)
        const { query: filteredQuery, params: filteredParams } = builder.build();

        // Apply sorting and optional pagination
        const finalBuilder = new QueryBuilder(filteredQuery);
        finalBuilder.params = filteredParams;

        finalBuilder.applySorting(req.query, 'sc.date_recorded DESC, u.first_name ASC');

        if (req.query.limit) {
            finalBuilder.applyPagination(req.query);
        }

        const { query, params } = finalBuilder.build();

        const [rows] = await db.query(query, params);
        sendSuccess(res, rows);
    } catch (error) {
        logError("Get All Scores", error);
        next(error);
    }
};

const createOrUpdate = async (req, res, next) => {
    try {
        const records = Array.isArray(req.body) ? req.body : req.body?.records;

        if (!Array.isArray(records) || records.length === 0) { 
            return sendError(res, 'A non-empty records array is required.', 400);
        } 

        const recorded_by_teacher_id = await getTeacherIdFromUserId(req.user.id);

        // Map values for bulk insertion
        const values = records.map(record => [
            record.student_id,
            record.class_id,
            record.subject_id,
            record.assessment_type,
            record.score,
            record.date_recorded, // Format: YYYY-MM-DD
            recorded_by_teacher_id,
        ]);

        const insertCols = [
            'student_id', 
            'class_id', 
            'subject_id', 
            'assessment_type', 
            'score', 
            'date_recorded', 
            'recorded_by_teacher_id'
        ];

        // This defines which columns to update if the Unique Key (student+subject+type+date) matches
        const updateCols = ['score', 'recorded_by_teacher_id'];

        await bulkUpsert('scores', insertCols, values, updateCols);

        sendSuccess(res, { message: 'Scores saved/updated successfully.' }, 201);
    } catch (error) {
        logError("Create/Update Scores", error);
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [result] = await db.query('DELETE FROM scores WHERE id = ?', [id]);
        if (result.affectedRows > 0) {
            res.status(204).send();
        } else {
            sendError(res, 'Score not found', 404);
        }
    } catch (error) {
        logError("Delete Score", error);
        next(error);
    }
};

const getScoreReport = async (req, res, next) => {
    try {
        let { class_id, subject_id, date_from, date_to, school_id } = req.query;

        // Handle potential array query parameters
        if (Array.isArray(class_id)) class_id = class_id[0];
        if (Array.isArray(school_id)) school_id = school_id[0];
        if (Array.isArray(subject_id)) subject_id = subject_id[0];
        if (Array.isArray(date_from)) date_from = date_from[0];
        if (Array.isArray(date_to)) date_to = date_to[0];

        const userRole = (req.user?.role_name || req.user?.role || '').toLowerCase();

        if (userRole === 'principal') {
            if (!req.user?.id) {
                return sendError(res, 'User ID not found.', 401);
            }
            const [principalRows] = await db.query('SELECT school_id FROM principals WHERE user_id = ?', [req.user.id]);
            if (principalRows.length === 0 || !principalRows[0].school_id) {
                return sendError(res, 'You are not assigned to a school.', 403);
            }
            const assignedSchoolId = principalRows[0].school_id;

            if (school_id && parseInt(school_id) != assignedSchoolId) {
                return sendError(res, 'Access denied. You can only view reports for your own school.', 403);
            }

            if (!class_id) {
                school_id = assignedSchoolId;
            }
        }

        if (!class_id && !school_id) {
            return sendError(res, 'Either class_id or school_id is required', 400);
        }

        let studentWhereClause, studentParams, scoreWhereClause, scoreParams;

        if (school_id) {
            studentWhereClause = `
                JOIN users u ON s.user_id = u.id
                JOIN student_class_map scm ON s.id = scm.student_id
                JOIN classes c ON scm.class_id = c.id
                WHERE c.school_id = ?`;
            studentParams = [school_id];

            scoreWhereClause = `
                JOIN subjects sub ON sc.subject_id = sub.id
                JOIN classes c ON sc.class_id = c.id
                WHERE c.school_id = ?`;
            scoreParams = [school_id];
        } else {
            studentWhereClause = `
                JOIN users u ON s.user_id = u.id
                JOIN student_class_map scm ON s.id = scm.student_id
                WHERE scm.class_id = ?`;
            studentParams = [class_id];

            scoreWhereClause = `
                JOIN subjects sub ON sc.subject_id = sub.id
                WHERE sc.class_id = ?`;
            scoreParams = [class_id];
        }

        // 1. Fetch Students
        const studentsQuery = `
            SELECT DISTINCT s.id as student_id, s.student_code, u.first_name, u.last_name, u.gender
            FROM students s
            ${studentWhereClause}
            ORDER BY u.last_name, u.first_name
        `;
        const [students] = await db.query(studentsQuery, studentParams);

        // 2. Fetch Scores
        let scoresQuery = `
            SELECT sc.student_id, sc.subject_id, sc.assessment_type, sc.score, 
                   sub.name as subject_name
            FROM scores sc
            ${scoreWhereClause}
        `;

        if (subject_id && subject_id !== 'all' && subject_id !== 'undefined') {
            scoresQuery += ` AND sc.subject_id = ?`;
            scoreParams.push(subject_id);
        }

        if (date_from) {
            scoresQuery += ` AND sc.date_recorded >= ?`;
            scoreParams.push(date_from);
        }

        if (date_to) {
            scoresQuery += ` AND sc.date_recorded <= ?`;
            scoreParams.push(date_to);
        }

        const [scores] = await db.query(scoresQuery, scoreParams);

        // 3. Process Data
        const MAX_SCORE = 10;

        const normalizeAssessmentType = (type, subjectName) => {
            if (subjectName && (subjectName.toLowerCase().includes('khmer') || subjectName.includes('ភាសាខ្មែរ'))) {
                const typeMap = {
                    'សមត្ថភាពស្តាប់': 'សមត្ថភាពស្តាប់',
                    'សមត្ថភាពនិយាយ': 'សមត្ថភាពនិយាយ',
                    'សមត្ថភាពអាន': 'សមត្ថភាពអាន',
                    'សមត្ថភាពសរសេរ': 'សមត្ថភាពសរសេរ'
                };
                return typeMap[type] || type;
            }
            return type;
        };

        const calculateGrade = (average) => {
            if (average === null || average === undefined) return '—';
            const num = parseFloat(average);
            if (num >= MAX_SCORE * 0.9) return 'ល្អប្រសើរ';
            if (num >= MAX_SCORE * 0.8) return 'ល្អណាស់';
            if (num >= MAX_SCORE * 0.7) return 'ល្អ';
            if (num >= MAX_SCORE * 0.6) return 'ល្អបង្គួរ';
            if (num >= MAX_SCORE * 0.5) return 'មធ្យម';
            return 'ខ្សោយ';
        };

        const getSubjectColor = (subjectName) => {
            const colors = [
                'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500',
                'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-pink-500'
            ];
            let hash = 0;
            for (let i = 0; i < subjectName.length; i++) {
                hash += subjectName.charCodeAt(i);
            }
            return colors[hash % colors.length];
        };

        // Normalize scores
        const normalizedScores = scores.map(s => ({
            ...s,
            assessment_type: normalizeAssessmentType(
                String(s.assessment_type || '').trim(),
                s.subject_name || ''
            )
        }));

        // Group subjects and types
        const subjectGroups = {};
        const seenCols = new Set();

        normalizedScores.forEach(s => {
            const sName = s.subject_name || 'Unknown';
            const sId = s.subject_id || sName;
            const key = `${sId}-${s.assessment_type}`;

            if (!seenCols.has(key)) {
                seenCols.add(key);
                if (!subjectGroups[sId]) {
                    subjectGroups[sId] = {
                        id: sId,
                        name: sName,
                        types: [],
                        color: getSubjectColor(sName)
                    };
                }
                subjectGroups[sId].types.push({
                    id: sId,
                    name: sName,
                    type: s.assessment_type,
                    key
                });
            }
        });

        // Sort Subjects and Types
        const subjectArray = Object.values(subjectGroups);
        subjectArray.sort((a, b) => a.name.localeCompare(b.name));
        
        subjectArray.forEach(subject => {
            subject.types.sort((a, b) => a.type.localeCompare(b.type));
        });

        // Calculate results per student
        const results = {};

        students.forEach(student => {
            const sId = student.student_id;
            const studentScores = normalizedScores.filter(s => s.student_id === sId);

            if (studentScores.length === 0) {
                results[sId] = { score: 0, grade: '—', status: 'No Score', typeScores: {} };
                return;
            }

            // Group by Subject -> Type to calculate subject averages first
            const subjectHierarchy = {};
            studentScores.forEach(s => {
                const subjId = s.subject_id || s.subject_name || 'Unknown';
                const type = s.assessment_type;
                
                if (!subjectHierarchy[subjId]) subjectHierarchy[subjId] = {};
                if (!subjectHierarchy[subjId][type]) subjectHierarchy[subjId][type] = [];
                
                subjectHierarchy[subjId][type].push(Number(s.score));
            });

            const typeScores = {};
            const subjectAverages = [];

            Object.keys(subjectHierarchy).forEach(subjId => {
                const types = subjectHierarchy[subjId];
                const currentSubjectTypeAvgs = [];

                Object.keys(types).forEach(type => {
                    const scores = types[type];
                    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                    
                    const key = `${subjId}-${type}`;
                    typeScores[key] = parseFloat(avg.toFixed(2));
                    currentSubjectTypeAvgs.push(avg);
                });

                if (currentSubjectTypeAvgs.length > 0) {
                    const subjAvg = currentSubjectTypeAvgs.reduce((a, b) => a + b, 0) / currentSubjectTypeAvgs.length;
                    subjectAverages.push(subjAvg);
                }
            });

            if (subjectAverages.length > 0) {
                const finalScore = subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length;
                const letterGrade = calculateGrade(finalScore);

                results[sId] = {
                    score: parseFloat(finalScore.toFixed(2)),
                    grade: letterGrade,
                    status: finalScore >= (MAX_SCORE / 2) ? 'ជាប់' : 'ធ្លាក់',
                    typeScores
                };
            } else {
                results[sId] = { score: 0, grade: '—', status: 'No Score', typeScores: {} };
            }
        });

        // Calculate Ranks
        const sortedIds = Object.keys(results).sort((a, b) => {
            const resA = results[a];
            const resB = results[b];
            if (resA.status === 'No Score') return 1;
            if (resB.status === 'No Score') return -1;
            return resB.score - resA.score;
        });

        let currentRank = 1;
        sortedIds.forEach((id, index) => {
            const current = results[id];
            if (current.status === 'No Score') {
                current.rank = '-';
                return;
            }
            if (index > 0 && results[sortedIds[index - 1]].score > current.score) {
                currentRank = index + 1;
            }
            current.rank = currentRank;
        });

        // --- Calculate Statistics for Graphs ---
        const stats = {
            total_students: students.length,
            passed: 0,
            failed: 0,
            average_score: 0,
            grade_distribution: {}
        };

        let totalScoreSum = 0;
        let scoredStudentsCount = 0;

        Object.values(results).forEach(r => {
            if (r.status === 'No Score') return;
            
            scoredStudentsCount++;
            totalScoreSum += r.score;

            if (r.status === 'ជាប់') stats.passed++;
            else stats.failed++;

            stats.grade_distribution[r.grade] = (stats.grade_distribution[r.grade] || 0) + 1;
        });

        if (scoredStudentsCount > 0) {
            stats.average_score = parseFloat((totalScoreSum / scoredStudentsCount).toFixed(2));
        }

        // Subject Performance Stats
        const subjectStats = {};
        normalizedScores.forEach(s => {
             const sName = s.subject_name || 'Unknown';
             if (!subjectStats[sName]) subjectStats[sName] = { sum: 0, count: 0 };
             subjectStats[sName].sum += Number(s.score);
             subjectStats[sName].count++;
        });
        
        stats.subject_performance = Object.entries(subjectStats).map(([name, data]) => ({
            subject: name,
            average: parseFloat((data.sum / data.count).toFixed(2))
        })).sort((a, b) => b.average - a.average);

        sendSuccess(res, {
            students,
            results,
            subjectGroups,
            stats
        });

    } catch (error) {
        console.error("Error in getScoreReport:", error);
        logError("Get Score Report", error);
        next(error);
    }
};

module.exports = { getAll, createOrUpdate, remove, getScoreReport };