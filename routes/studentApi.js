const express = require('express');
const router = express.Router();

const db = require('../db');
const { requireStudent } = require('../middleware/auth');

function sendServerError(res, err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function parsePositiveInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isValidAgendaColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || ''));
}

function ensureStudentTemplateAccess(templateId, studentId, res, onSuccess) {
    db.query(
        `SELECT
            at.id,
            at.course_id
        FROM assessment_templates at
        INNER JOIN enrollments e ON e.course_id = at.course_id
        WHERE at.id = ? AND e.student_id = ?
        LIMIT 1`,
        [templateId, studentId],
        (err, results) => {
            if (err) return sendServerError(res, err);
            if (!results.length) {
                return res.status(404).json({ error: 'Assessment not found for this student.' });
            }

            onSuccess(results[0]);
        }
    );
}

function ensureOwnedEnrollment(enrollmentId, studentId, res, onSuccess) {
    db.query(
        `SELECT id, course_id
         FROM enrollments
         WHERE id = ? AND student_id = ?
         LIMIT 1`,
        [enrollmentId, studentId],
        (err, results) => {
            if (err) return sendServerError(res, err);
            if (!results.length) {
                return res.status(404).json({ error: 'Enrollment not found.' });
            }

            onSuccess(results[0]);
        }
    );
}

router.use(requireStudent);

router.get('/account', (req, res) => {
    db.query(
        `SELECT id, name, email, student_number, created_at
        FROM students
        WHERE id = ?
        LIMIT 1`,
        [req.session.userId],
        (err, results) => {
            if (err) return sendServerError(res, err);
            if (!results.length) {
                return res.status(404).json({ error: 'Student account not found.' });
            }

            res.json(results[0]);
        }
    );
});

router.get('/enrollments', (req, res) => {
    db.query(
        `SELECT
            e.id AS enrollment_id,
            e.student_id,
            e.course_id,
            e.enrolled_at,
            c.course_code,
            c.course_name,
            c.instructor,
            c.term,
            c.max_students,
            c.is_enabled,
            CASE
                WHEN she.enrollment_id IS NULL THEN 0
                ELSE 1
            END AS is_hidden
        FROM enrollments e
        INNER JOIN courses c ON c.id = e.course_id
        LEFT JOIN student_hidden_enrollments she ON she.enrollment_id = e.id
        WHERE e.student_id = ?
        ORDER BY c.course_code ASC, e.id ASC`,
        [req.session.userId],
        (err, results) => {
            if (err) return sendServerError(res, err);
            res.json(results);
        }
    );
});

router.get('/agenda', (req, res) => {
    db.query(
        `SELECT id, task_text, color, created_at
         FROM student_agenda_items
         WHERE student_id = ?
         ORDER BY created_at DESC, id DESC`,
        [req.session.userId],
        (err, results) => {
            if (err) return sendServerError(res, err);
            res.json(results);
        }
    );
});

router.post('/agenda', (req, res) => {
    const taskText = String(req.body.text || '').trim();
    const color = String(req.body.color || '#9a89d6').trim();

    if (!taskText) {
        return res.status(400).json({ error: 'Please enter a task first.' });
    }

    if (taskText.length > 120) {
        return res.status(400).json({ error: 'Agenda items must be 120 characters or fewer.' });
    }

    if (!isValidAgendaColor(color)) {
        return res.status(400).json({ error: 'Please choose a valid task color.' });
    }

    db.query(
        'INSERT INTO student_agenda_items (student_id, task_text, color) VALUES (?, ?, ?)',
        [req.session.userId, taskText, color.toLowerCase()],
        (err, result) => {
            if (err) return sendServerError(res, err);

            db.query(
                `SELECT id, task_text, color, created_at
                 FROM student_agenda_items
                 WHERE id = ? AND student_id = ?
                 LIMIT 1`,
                [result.insertId, req.session.userId],
                (selectErr, results) => {
                    if (selectErr) return sendServerError(res, selectErr);
                    res.status(201).json(results[0]);
                }
            );
        }
    );
});

router.delete('/agenda/:agendaId', (req, res) => {
    const agendaId = parsePositiveInteger(req.params.agendaId);

    if (!agendaId) {
        return res.status(400).json({ error: 'Please provide a valid agenda item id.' });
    }

    db.query(
        'DELETE FROM student_agenda_items WHERE id = ? AND student_id = ?',
        [agendaId, req.session.userId],
        (err, result) => {
            if (err) return sendServerError(res, err);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Agenda item not found.' });
            }

            res.json({ message: 'Agenda item removed.' });
        }
    );
});

router.post('/enroll', (req, res) => {
    const courseCode = String(req.body.course_code || '').trim().toUpperCase();

    if (!courseCode) {
        return res.status(400).json({ error: 'Course code is required.' });
    }

    db.query(
        `SELECT
            c.*,
            COUNT(e.id) AS enrollment_count
         FROM courses c
         LEFT JOIN enrollments e ON e.course_id = c.id
         WHERE c.course_code = ?
         GROUP BY c.id
         LIMIT 1`,
        [courseCode],
        (courseErr, courseResults) => {
            if (courseErr) return sendServerError(res, courseErr);
            if (!courseResults.length) {
                return res.status(404).json({ error: 'Course not found.' });
            }

            const course = courseResults[0];

            if (!course.is_enabled) {
                return res.status(400).json({ error: 'This course is currently disabled.' });
            }

            const maxStudents = course.max_students === null ? null : Number(course.max_students);
            const enrollmentCount = Number(course.enrollment_count || 0);

            if (Number.isFinite(maxStudents) && maxStudents > 0 && enrollmentCount >= maxStudents) {
                return res.status(400).json({ error: 'This course is full.' });
            }

            db.query(
                'INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)',
                [req.session.userId, course.id],
                (enrollErr, result) => {
                    if (enrollErr) {
                        if (enrollErr.code === 'ER_DUP_ENTRY') {
                            return res.status(400).json({ error: 'You are already enrolled in this course.' });
                        }
                        return sendServerError(res, enrollErr);
                    }

                    res.json({
                        message: 'Enrolled successfully.',
                        enrollment_id: result.insertId,
                        course: {
                            course_id: course.id,
                            course_code: course.course_code,
                            course_name: course.course_name,
                            instructor: course.instructor,
                            term: course.term
                        }
                    });
                }
            );
        }
    );
});

router.post('/enroll/:enrollmentId/hide', (req, res) => {
    const enrollmentId = parsePositiveInteger(req.params.enrollmentId);

    if (!enrollmentId) {
        return res.status(400).json({ error: 'Please provide a valid enrollment id.' });
    }

    ensureOwnedEnrollment(enrollmentId, req.session.userId, res, () => {
        db.query(
            `INSERT INTO student_hidden_enrollments (enrollment_id)
             VALUES (?)
             ON DUPLICATE KEY UPDATE hidden_at = CURRENT_TIMESTAMP`,
            [enrollmentId],
            (err) => {
                if (err) return sendServerError(res, err);
                res.json({ message: 'Course hidden.', enrollment_id: enrollmentId, is_hidden: true });
            }
        );
    });
});

router.delete('/enroll/:enrollmentId/hide', (req, res) => {
    const enrollmentId = parsePositiveInteger(req.params.enrollmentId);

    if (!enrollmentId) {
        return res.status(400).json({ error: 'Please provide a valid enrollment id.' });
    }

    ensureOwnedEnrollment(enrollmentId, req.session.userId, res, () => {
        db.query(
            'DELETE FROM student_hidden_enrollments WHERE enrollment_id = ?',
            [enrollmentId],
            (err) => {
                if (err) return sendServerError(res, err);
                res.json({ message: 'Course unhidden.', enrollment_id: enrollmentId, is_hidden: false });
            }
        );
    });
});

router.delete('/enroll/:enrollmentId', (req, res) => {
    const enrollmentId = parsePositiveInteger(req.params.enrollmentId);

    if (!enrollmentId) {
        return res.status(400).json({ error: 'Please provide a valid enrollment id.' });
    }

    db.query(
        'DELETE FROM enrollments WHERE id = ? AND student_id = ?',
        [enrollmentId, req.session.userId],
        (err, result) => {
            if (err) return sendServerError(res, err);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Enrollment not found.' });
            }

            res.json({ message: 'Enrollment removed.' });
        }
    );
});

router.get('/dashboard', (req, res) => {
    db.query(
        `SELECT
            at.id AS template_id,
            at.assessment_name,
            at.due_date,
            at.weight,
            COALESCE(stp.status, 'pending') AS status,
            at.created_at,
            COALESCE(stp.updated_at, at.created_at) AS updated_at,
            stp.completed_at,
            c.course_code,
            c.course_name
        FROM enrollments e
        INNER JOIN courses c ON c.id = e.course_id
        INNER JOIN assessment_templates at ON at.course_id = c.id
        LEFT JOIN student_template_progress stp
            ON stp.template_id = at.id
            AND stp.student_id = e.student_id
        WHERE e.student_id = ?
        ORDER BY
            at.due_date IS NULL,
            at.due_date ASC,
            at.created_at DESC,
            at.id DESC`,
        [req.session.userId],
        (err, results) => {
            if (err) return sendServerError(res, err);

            const payload = results.map((row) => ({
                id: row.template_id,
                template_id: row.template_id,
                assessment_name: row.assessment_name,
                due_date: row.due_date,
                weight: row.weight,
                status: row.status,
                created_at: row.created_at,
                assessment_created_at: row.created_at,
                updated_at: row.updated_at,
                completed_at: row.completed_at,
                course_code: row.course_code,
                course_name: row.course_name
            }));

            res.json(payload);
        }
    );
});

router.patch('/dashboard/templates/:templateId/progress', (req, res) => {
    const templateId = parsePositiveInteger(req.params.templateId);
    const status = String(req.body.status || '').trim().toLowerCase();

    if (!templateId) {
        return res.status(400).json({ error: 'Please provide a valid template id.' });
    }

    if (!['pending', 'completed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be either pending or completed.' });
    }

    ensureStudentTemplateAccess(templateId, req.session.userId, res, () => {
        if (status === 'completed') {
            db.query(
                `INSERT INTO student_template_progress
                    (student_id, template_id, status, completed_at, created_at, updated_at)
                VALUES (?, ?, 'completed', NOW(), NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    completed_at = NOW(),
                    updated_at = NOW()`,
                [req.session.userId, templateId],
                (err) => {
                    if (err) return sendServerError(res, err);
                    res.json({ message: 'Assessment marked complete.', template_id: templateId, status });
                }
            );
            return;
        }

        db.query(
            'DELETE FROM student_template_progress WHERE student_id = ? AND template_id = ?',
            [req.session.userId, templateId],
            (err) => {
                if (err) return sendServerError(res, err);
                res.json({ message: 'Assessment reset to pending.', template_id: templateId, status });
            }
        );
    });
});

module.exports = router;
