const express = require('express');
const router = express.Router();
const db = require('../db');
const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const { requireAdmin, requireStudent } = require('../middleware/auth');

const getStudentId = (req) => req.session.userId;
const getAdminId = (req) => req.session.userId;

function sendServerError(res, err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function parsePositiveInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validateDateOnly(value) {
    if (value === null || value === undefined || value === '') {
        return { value: null };
    }

    if (typeof value !== 'string') {
        return { error: 'Please enter a valid due date.' };
    }

    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return { error: 'Please enter a valid due date.' };
    }

    const [year, month, day] = trimmed.split('-').map(Number);
    const parsedDate = new Date(`${trimmed}T00:00:00`);

    if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.getUTCFullYear() !== year ||
        parsedDate.getUTCMonth() + 1 !== month ||
        parsedDate.getUTCDate() !== day
    ) {
        return { error: 'Please enter a valid due date.' };
    }

    return { value: trimmed };
}

function validateOptionalNumber(value, label, options = {}) {
    const {
        min = 0,
        max = null,
        allowZero = true
    } = options;

    if (value === null || value === undefined || value === '') {
        return { value: null };
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return { error: `${label} must be a valid number.` };
    }

    if (parsed < min || (!allowZero && parsed === 0)) {
        const minimumLabel = allowZero ? min : min || 0;
        return { error: `${label} must be greater than ${minimumLabel}.` };
    }

    if (max !== null && parsed > max) {
        return { error: `${label} cannot be greater than ${max}.` };
    }

    return { value: parsed };
}

function validateGradePayload(body, options = {}) {
    const { requireCourseId = true } = options;
    const courseId = parsePositiveInteger(body.course_id);
    const assessmentName = String(body.assessment_name || '').trim();
    const category = body.category === null || body.category === undefined
        ? ''
        : String(body.category).trim();
    const status = String(body.status || 'pending').trim().toLowerCase();

    if (requireCourseId && !courseId) {
        return { error: 'Please choose a valid course.' };
    }

    if (!assessmentName) {
        return { error: 'Assessment name is required.' };
    }

    if (assessmentName.length > 100) {
        return { error: 'Assessment name must be 100 characters or fewer.' };
    }

    if (category.length > 50) {
        return { error: 'Assessment category must be 50 characters or fewer.' };
    }

    const dueDateResult = validateDateOnly(body.due_date);
    if (dueDateResult.error) {
        return { error: dueDateResult.error };
    }

    const weightResult = validateOptionalNumber(body.weight, 'Weight', {
        min: 0,
        max: 100
    });
    if (weightResult.error) {
        return { error: weightResult.error };
    }

    const earnedMarksResult = validateOptionalNumber(body.earned_marks, 'Earned marks', {
        min: 0
    });
    if (earnedMarksResult.error) {
        return { error: earnedMarksResult.error };
    }

    const totalMarksResult = validateOptionalNumber(body.total_marks, 'Total marks', {
        min: 0,
        allowZero: false
    });
    if (totalMarksResult.error) {
        return { error: totalMarksResult.error };
    }

    if ((earnedMarksResult.value === null) !== (totalMarksResult.value === null)) {
        return {
            error: 'Earned marks and total marks must both be filled in or both be left empty.'
        };
    }

    if (!['pending', 'completed'].includes(status)) {
        return { error: 'Status must be either pending or completed.' };
    }

    return {
        value: {
            course_id: courseId,
            assessment_name: assessmentName,
            category,
            due_date: dueDateResult.value,
            weight: weightResult.value,
            earned_marks: earnedMarksResult.value,
            total_marks: totalMarksResult.value,
            status
        }
    };
}

function ensureStudentEnrollment(courseId, studentId, res, onSuccess) {
    db.query(
        `SELECT id
        FROM enrollments
        WHERE course_id = ? AND student_id = ?
        LIMIT 1`,
        [courseId, studentId],
        (err, results) => {
            if (err) return sendServerError(res, err);
            if (results.length === 0) {
                return res.status(403).json({ error: 'You are not enrolled in this course.' });
            }

            onSuccess();
        }
    );
}

function ensureAdminCourseOwnership(courseId, adminId, res, onSuccess) {
    db.query(
        `SELECT id
         FROM courses
         WHERE id = ? AND admin_id = ?
         LIMIT 1`,
        [courseId, adminId],
        (err, results) => {
            if (err) return sendServerError(res, err);
            if (results.length === 0) {
                return res.status(404).json({ error: 'Course not found.' });
            }

            onSuccess();
        }
    );
}

// ADD a new student-owned assessment
router.post('/', requireStudent, (req, res) => {
    const studentId = getStudentId(req);
    const validation = validateGradePayload(req.body, { requireCourseId: true });

    if (validation.error) {
        return res.status(400).json({ error: validation.error });
    }

    const {
        course_id,
        assessment_name,
        category,
        due_date,
        weight,
        earned_marks,
        total_marks,
        status
    } = validation.value;

    db.query(
        'SELECT id FROM courses WHERE id = ? LIMIT 1',
        [course_id],
        (courseErr, courseResults) => {
            if (courseErr) return sendServerError(res, courseErr);
            if (courseResults.length === 0) {
                return res.status(404).json({ error: 'The selected course was not found.' });
            }

            ensureStudentEnrollment(course_id, studentId, res, () => {
                db.query(
                    `INSERT INTO student_grades
                    (student_id, course_id, assessment_name, category,
                    due_date, weight, earned_marks, total_marks, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    [
                        studentId,
                        course_id,
                        assessment_name,
                        category,
                        due_date,
                        weight,
                        earned_marks,
                        total_marks,
                        status
                    ],
                    (err, result) => {
                        if (err) return sendServerError(res, err);
                        res.json({ message: 'Grade added!', id: result.insertId });
                    }
                );
            });
        }
    );
});

// EDIT a grade
router.put('/:id', requireStudent, (req, res) => {
    const gradeId = parsePositiveInteger(req.params.id);
    const studentId = getStudentId(req);

    if (!gradeId) {
        return res.status(400).json({ error: 'Please provide a valid assessment id.' });
    }

    const validation = validateGradePayload(req.body, { requireCourseId: true });

    if (validation.error) {
        return res.status(400).json({ error: validation.error });
    }

    const {
        course_id,
        assessment_name,
        category,
        due_date,
        weight,
        earned_marks,
        total_marks,
        status
    } = validation.value;

    db.query(
        'SELECT id FROM courses WHERE id = ? LIMIT 1',
        [course_id],
        (courseErr, courseResults) => {
            if (courseErr) return sendServerError(res, courseErr);
            if (courseResults.length === 0) {
                return res.status(404).json({ error: 'The selected course was not found.' });
            }

            ensureStudentEnrollment(course_id, studentId, res, () => {
                db.query(
                    `UPDATE student_grades SET
                    course_id = ?, assessment_name = ?, category = ?, due_date = ?,
                    weight = ?, earned_marks = ?, total_marks = ?, status = ?,
                    updated_at = NOW()
                    WHERE id = ? AND student_id = ? AND assessment_id IS NULL`,
                    [
                        course_id,
                        assessment_name,
                        category,
                        due_date,
                        weight,
                        earned_marks,
                        total_marks,
                        status,
                        gradeId,
                        studentId
                    ],
                    (err, result) => {
                        if (err) return sendServerError(res, err);
                        if (result.affectedRows === 0) {
                            return res.status(404).json({ error: 'Grade not found' });
                        }

                        res.json({ message: 'Grade updated!' });
                    }
                );
            });
        }
    );
});

// DELETE a grade
router.delete('/:id', requireStudent, (req, res) => {
    const gradeId = parsePositiveInteger(req.params.id);

    if (!gradeId) {
        return res.status(400).json({ error: 'Please provide a valid assessment id.' });
    }

    db.query(
        'DELETE FROM student_grades WHERE id = ? AND student_id = ? AND assessment_id IS NULL',
        [gradeId, getStudentId(req)],
        (err, result) => {
            if (err) return sendServerError(res, err);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Grade not found' });
            }

            res.json({ message: 'Grade deleted!' });
        }
    );
});

// GET weighted average for a course
router.get('/:courseId/average', requireStudent, (req, res) => {
    const courseId = parsePositiveInteger(req.params.courseId);
    const studentId = getStudentId(req);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureStudentEnrollment(courseId, studentId, res, () => {
            db.query(
                `SELECT
                    weight,
                    earned_marks,
                    total_marks
                FROM student_grades
                WHERE course_id = ? AND student_id = ?
                AND earned_marks IS NOT NULL
                AND total_marks IS NOT NULL
                AND total_marks <> 0`,
                [courseId, studentId],
                (err, results) => {
                    if (err) return sendServerError(res, err);

                    const weightedPoints = results.reduce((sum, row) => {
                        const weight = parseFloat(row.weight || 0);
                        const percentage = (parseFloat(row.earned_marks) / parseFloat(row.total_marks)) * 100;
                        return sum + ((percentage / 100) * weight);
                    }, 0);

                    const totalWeight = results.reduce(
                        (sum, row) => sum + parseFloat(row.weight || 0),
                        0
                    );

                    const average = totalWeight > 0
                        ? Number((((weightedPoints / totalWeight) * 100).toFixed(2)))
                        : 0;

                    res.json({ average, total_weight: Number(totalWeight.toFixed(2)) });
                }
            );
        }
    );
});

// GET GPA across all courses
router.get('/gpa/all', requireStudent, (req, res) => {
    const studentId = getStudentId(req);

    db.query(
        `SELECT
            course_id,
            weight,
            earned_marks,
            total_marks
        FROM student_grades
        WHERE student_id = ?
        AND earned_marks IS NOT NULL
        AND total_marks IS NOT NULL
        AND total_marks <> 0`,
        [studentId],
        (err, results) => {
            if (err) return sendServerError(res, err);

            const gpaScale = (avg) => {
                if (avg >= 90) return 4.3;
                if (avg >= 85) return 4.0;
                if (avg >= 80) return 3.7;
                if (avg >= 75) return 3.3;
                if (avg >= 70) return 3.0;
                if (avg >= 65) return 2.7;
                if (avg >= 60) return 2.3;
                if (avg >= 55) return 2.0;
                if (avg >= 50) return 1.0;
                return 0.0;
            };

            const grouped = results.reduce((acc, row) => {
                const key = row.course_id;
                const weight = parseFloat(row.weight || 0);
                const percentage = (parseFloat(row.earned_marks) / parseFloat(row.total_marks)) * 100;

                if (!acc[key]) {
                    acc[key] = { weightedPoints: 0, totalWeight: 0 };
                }

                acc[key].weightedPoints += (percentage / 100) * weight;
                acc[key].totalWeight += weight;
                return acc;
            }, {});

            const courses = Object.entries(grouped).map(([courseId, data]) => {
                const average = data.totalWeight > 0
                    ? Number((((data.weightedPoints / data.totalWeight) * 100).toFixed(2)))
                    : 0;

                return {
                    course_id: Number(courseId),
                    average,
                    gpa: gpaScale(average)
                };
            });

            const overallGpa = courses.length > 0
                ? Number((courses.reduce((sum, course) => sum + course.gpa, 0) / courses.length).toFixed(2))
                : 0;

            res.json({ courses, overall_gpa: overallGpa });
        }
    );
});

// GET all grades for a course
router.get('/:courseId', requireStudent, (req, res) => {
    const courseId = parsePositiveInteger(req.params.courseId);
    const studentId = getStudentId(req);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureStudentEnrollment(courseId, studentId, res, () => {
        db.query(
            `SELECT *
            FROM student_grades
            WHERE course_id = ? AND student_id = ? AND assessment_id IS NULL
            ORDER BY due_date IS NULL, due_date ASC, created_at ASC, id ASC`,
            [courseId, studentId],
            (err, results) => {
                if (err) return sendServerError(res, err);
                res.json(results);
            }
        );
    });
});

// GET student-entered assessments for a course details page
router.get('/:courseId/details', requireStudent, (req, res) => {
    const courseId = parsePositiveInteger(req.params.courseId);
    const studentId = getStudentId(req);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureStudentEnrollment(courseId, studentId, res, () => {
        db.query(
            `SELECT
                id AS grade_id,
                course_id,
                assessment_id,
                assessment_name,
                category,
                due_date,
                weight,
                earned_marks,
                total_marks,
                status
            FROM student_grades
            WHERE student_id = ? AND course_id = ? AND assessment_id IS NULL
            ORDER BY due_date IS NULL, due_date ASC, created_at ASC, id ASC`,
            [studentId, courseId],
            (err, results) => {
                if (err) return sendServerError(res, err);
                res.json(results);
            }
        );
    });
});

// GET all grades for a course (admin view)
router.get('/:courseId/all', requireAdmin, (req, res) => {
    const courseId = parsePositiveInteger(req.params.courseId);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureAdminCourseOwnership(courseId, getAdminId(req), res, () => {
        db.query(
            `SELECT
                at.assessment_name,
                at.category,
                COUNT(stp.id) AS submissions,
                CASE
                    WHEN COALESCE(MAX(ec.total_students), 0) = 0 THEN 0
                    ELSE ROUND((COUNT(stp.id) / MAX(ec.total_students)) * 100, 1)
                END AS avg_pct
             FROM assessment_templates at
             LEFT JOIN (
                SELECT course_id, COUNT(*) AS total_students
                FROM enrollments
                GROUP BY course_id
             ) ec ON ec.course_id = at.course_id
             LEFT JOIN student_template_progress stp
                ON stp.template_id = at.id
                AND stp.status = 'completed'
             WHERE at.course_id = ?
             GROUP BY at.id, at.assessment_name, at.category
             ORDER BY at.due_date IS NULL, at.due_date ASC, at.id ASC`,
            [courseId],
            (err, results) => {
                if (err) return sendServerError(res, err);
                res.json(results);
            }
        );
    });
});

// GET analytics data for a course
router.get('/:courseId/analytics', requireStudent, (req, res) => {
    const courseId = parsePositiveInteger(req.params.courseId);
    const studentId = getStudentId(req);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureStudentEnrollment(courseId, studentId, res, () => {
            db.query(
                `SELECT
                    id,
                    assessment_name,
                    category,
                due_date,
                weight,
                earned_marks,
                total_marks,
                status,
                CASE
                    WHEN earned_marks IS NOT NULL
                        AND total_marks IS NOT NULL
                        AND total_marks <> 0
                    THEN ROUND((earned_marks / total_marks) * 100, 2)
                    ELSE NULL
                END as percentage
            FROM student_grades
            WHERE course_id = ? AND student_id = ?
            ORDER BY due_date IS NULL, due_date ASC, created_at ASC, id ASC`,
            [courseId, studentId],
            (err, results) => {
                if (err) return sendServerError(res, err);

                const assessments = results.map((row) => ({
                    ...row,
                    weight: row.weight === null ? null : parseFloat(row.weight),
                    earned_marks: row.earned_marks === null ? null : parseFloat(row.earned_marks),
                    total_marks: row.total_marks === null ? null : parseFloat(row.total_marks),
                    percentage: row.percentage === null ? null : parseFloat(row.percentage)
                }));

                const completedAssessments = assessments.filter(
                    (assessment) => assessment.percentage !== null
                );

                const weightedPoints = completedAssessments.reduce((sum, assessment) => {
                    const weight = assessment.weight || 0;
                    return sum + ((assessment.percentage / 100) * weight);
                }, 0);

                const completedWeight = completedAssessments.reduce(
                    (sum, assessment) => sum + (assessment.weight || 0),
                    0
                );

                const totalWeight = assessments.reduce(
                    (sum, assessment) => sum + (assessment.weight || 0),
                    0
                );

                const average = completedWeight > 0
                    ? ((weightedPoints / completedWeight) * 100).toFixed(2)
                    : '0.00';

                res.json({
                    assessments,
                    average,
                    completed: completedAssessments.length,
                    total: assessments.length,
                    completed_weight: Number(completedWeight.toFixed(2)),
                    total_weight: Number(totalWeight.toFixed(2))
                });
            }
        );
    });
});

// EXPORT to CSV
router.get('/:courseId/export/csv', requireStudent, (req, res) => {
    const courseId = parsePositiveInteger(req.params.courseId);
    const studentId = getStudentId(req);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureStudentEnrollment(courseId, studentId, res, () => {
            db.query(
                `SELECT
                    assessment_name, category, due_date, weight,
                    earned_marks, total_marks,
                    ROUND((earned_marks / total_marks) * 100, 2) as percentage, status
            FROM student_grades
            WHERE course_id = ? AND student_id = ?`,
            [courseId, studentId],
            (err, results) => {
                if (err) return sendServerError(res, err);

                const fields = [
                    { label: 'Assessment', value: 'assessment_name' },
                    { label: 'Category', value: 'category' },
                    { label: 'Due Date', value: 'due_date' },
                    { label: 'Weight', value: 'weight' },
                    { label: 'Earned', value: 'earned_marks' },
                    { label: 'Total', value: 'total_marks' },
                    { label: 'Percentage', value: 'percentage' },
                    { label: 'Status', value: 'status' }
                ];

                const parser = new Parser({ fields });
                const csv = parser.parse(results);

                res.header('Content-Type', 'text/csv');
                res.attachment(`course_${courseId}_grades.csv`);
                res.send(csv);
            }
        );
    });
});

// EXPORT to PDF
router.get('/:courseId/export/pdf', requireStudent, (req, res) => {
    const courseId = parsePositiveInteger(req.params.courseId);
    const studentId = getStudentId(req);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureStudentEnrollment(courseId, studentId, res, () => {
            db.query(
                `SELECT
                    assessment_name, category, due_date, weight,
                    earned_marks, total_marks,
                    ROUND((earned_marks / total_marks) * 100, 2) as percentage, status
            FROM student_grades
            WHERE course_id = ? AND student_id = ?`,
            [courseId, studentId],
            (err, results) => {
                if (err) return sendServerError(res, err);

                const doc = new PDFDocument({ margin: 40 });

                res.header('Content-Type', 'application/pdf');
                res.attachment(`course_${courseId}_grades.pdf`);
                doc.pipe(res);

                doc.fontSize(20)
                   .fillColor('#2d1b6e')
                   .text('Smart Course Companion', { align: 'center' });
                doc.fontSize(14)
                   .fillColor('#6a4fcf')
                   .text(`Grade Report - Course ${courseId}`, { align: 'center' });
                doc.moveDown();

                doc.fontSize(10)
                   .fillColor('#ffffff')
                   .rect(40, doc.y, 520, 20)
                   .fill('#6a4fcf');

                doc.fillColor('#ffffff')
                   .text('Assessment', 45, doc.y - 15)
                   .text('Category', 160, doc.y - 15)
                   .text('Weight', 245, doc.y - 15)
                   .text('Earned', 305, doc.y - 15)
                   .text('Total', 365, doc.y - 15)
                   .text('%', 425, doc.y - 15)
                   .text('Status', 465, doc.y - 15);

                doc.moveDown();

                results.forEach((grade, index) => {
                    const y = doc.y;
                    if (index % 2 === 0) {
                        doc.rect(40, y, 520, 20).fill('#f0ebff');
                    }

                    doc.fillColor('#000')
                       .fontSize(9)
                       .text(grade.assessment_name || '-', 45, y + 5)
                       .text(grade.category || '-', 160, y + 5)
                       .text(grade.weight ?? '-', 245, y + 5)
                       .text(grade.earned_marks ?? '-', 305, y + 5)
                       .text(grade.total_marks ?? '-', 365, y + 5)
                       .text(grade.percentage ?? '-', 425, y + 5)
                       .text(grade.status || '-', 465, y + 5);

                    doc.moveDown();
                });

                doc.end();
            }
        );
    });
});

module.exports = router;
