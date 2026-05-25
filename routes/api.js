const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');

const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

function sendServerError(res, err) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

function parsePositiveInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeNullableValue(value) {
    return value === '' || value === null || value === undefined ? null : value;
}

function getAdminId(req) {
    return req.session.userId;
}

function queryExecutorAsync(executor, sql, params = []) {
    return new Promise((resolve, reject) => {
        executor.query(sql, params, (err, results) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(results);
        });
    });
}

function queryAsync(sql, params = []) {
    return queryExecutorAsync(db, sql, params);
}

function queryConnectionAsync(connection, sql, params = []) {
    return queryExecutorAsync(connection, sql, params);
}

function getConnectionAsync() {
    return new Promise((resolve, reject) => {
        db.getConnection((err, connection) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(connection);
        });
    });
}

function beginTransactionAsync(connection) {
    return new Promise((resolve, reject) => {
        connection.beginTransaction((err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}

function commitAsync(connection) {
    return new Promise((resolve, reject) => {
        connection.commit((err) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}

function rollbackAsync(connection) {
    return new Promise((resolve) => {
        connection.rollback(() => resolve());
    });
}

async function withTransaction(work) {
    const connection = await getConnectionAsync();

    try {
        await beginTransactionAsync(connection);
        const result = await work(connection);
        await commitAsync(connection);
        return result;
    } catch (err) {
        await rollbackAsync(connection);
        throw err;
    } finally {
        connection.release();
    }
}

function normalizeTemplateWeight(value) {
    if (value === '' || value === null || value === undefined) {
        return { value: null };
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return { error: 'Weight must be a valid number.' };
    }

    if (parsed < 0 || parsed > 100) {
        return { error: 'Weight must be between 0 and 100.' };
    }

    return { value: parsed };
}

async function ensureOwnedCourseLock(connection, courseId, adminId) {
    const ownedCourses = await queryConnectionAsync(
        connection,
        'SELECT id FROM courses WHERE id = ? AND admin_id = ? LIMIT 1 FOR UPDATE',
        [courseId, adminId]
    );

    if (!ownedCourses.length) {
        const err = new Error('Course not found.');
        err.status = 404;
        throw err;
    }
}

async function ensureCourseTemplateWeightLimit(connection, courseId, nextWeight, excludeTemplateId = null) {
    const weightValue = nextWeight === null ? 0 : Number(nextWeight);
    const params = [courseId];
    let sql = `
        SELECT weight
        FROM assessment_templates
        WHERE course_id = ?
    `;

    if (excludeTemplateId !== null) {
        sql += ' AND id != ?';
        params.push(excludeTemplateId);
    }

    sql += ' FOR UPDATE';

    const results = await queryConnectionAsync(connection, sql, params);
    const currentTotal = results.reduce((sum, row) => sum + Number(row.weight || 0), 0);
    const nextTotal = currentTotal + weightValue;

    if (nextTotal > 100) {
        throw new Error(
            `Total assessment weight for this course cannot exceed 100%. This change would bring it to ${nextTotal.toFixed(2)}%.`
        );
    }
}

function getOwnedCourse(courseId, adminId, callback) {
    db.query(
        `SELECT
            c.*,
            (
                SELECT COUNT(*)
                FROM enrollments e
                WHERE e.course_id = c.id
            ) AS enrollment_count
        FROM courses c
        WHERE c.id = ? AND c.admin_id = ?
        LIMIT 1`,
        [courseId, adminId],
        callback
    );
}

function ensureOwnedCourse(courseId, adminId, res, onSuccess) {
    getOwnedCourse(courseId, adminId, (err, results) => {
        if (err) return sendServerError(res, err);
        if (!results.length) {
            return res.status(404).json({ error: 'Course not found.' });
        }

        onSuccess(results[0]);
    });
}

function ensureOwnedTemplate(templateId, adminId, res, onSuccess) {
    db.query(
        `SELECT at.id, at.course_id
         FROM assessment_templates at
         INNER JOIN courses c ON c.id = at.course_id
         WHERE at.id = ? AND c.admin_id = ?
         LIMIT 1`,
        [templateId, adminId],
        (err, results) => {
            if (err) return sendServerError(res, err);
            if (!results.length) {
                return res.status(404).json({ error: 'Template not found.' });
            }

            onSuccess(results[0]);
        }
    );
}

router.get('/courses', requireAdmin, (req, res) => {
    db.query(
        `SELECT
            c.*,
            (
                SELECT COUNT(*)
                FROM enrollments e
                WHERE e.course_id = c.id
            ) AS enrollment_count
         FROM courses c
         WHERE c.admin_id = ?
         ORDER BY c.course_code ASC, c.id ASC`,
        [getAdminId(req)],
        (err, results) => {
            if (err) return sendServerError(res, err);
            res.json(results);
        }
    );
});

router.get('/grade-summary/:courseId', requireAdmin, (req, res) => {
    const courseId = parsePositiveInteger(req.params.courseId);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureOwnedCourse(courseId, getAdminId(req), res, () => {
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

router.get('/analytics/export/pdf', requireAdmin, async (req, res) => {
    const requestedCourseId = req.query.courseId === undefined
        ? null
        : parsePositiveInteger(req.query.courseId);

    if (req.query.courseId !== undefined && !requestedCourseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    try {
        const courses = await queryAsync(
            `SELECT
                c.*,
                (
                    SELECT COUNT(*)
                    FROM enrollments e
                    WHERE e.course_id = c.id
                ) AS enrollment_count
             FROM courses c
             WHERE c.admin_id = ?
               AND c.is_enabled = 1
               ${requestedCourseId ? 'AND c.id = ?' : ''}
             ORDER BY c.course_code ASC, c.id ASC`,
            requestedCourseId ? [getAdminId(req), requestedCourseId] : [getAdminId(req)]
        );

        if (requestedCourseId && !courses.length) {
            return res.status(404).json({ error: 'Course not found.' });
        }

        const courseReports = await Promise.all(courses.map(async (course) => {
            const templates = await queryAsync(
                `SELECT
                    assessment_name,
                    category,
                    due_date,
                    weight
                 FROM assessment_templates
                 WHERE course_id = ?
                 ORDER BY due_date IS NULL, due_date ASC, id ASC`,
                [course.id]
            );

            const gradeSummary = await queryAsync(
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
                [course.id]
            );

            return {
                course,
                templates,
                gradeSummaryByName: gradeSummary.reduce((acc, item) => {
                    acc[String(item.assessment_name || '').toLowerCase()] = item;
                    return acc;
                }, {})
            };
        }));

        const totalStudents = courses.reduce((sum, course) => sum + Number(course.enrollment_count || 0), 0);
        const totalAssessments = courseReports.reduce((sum, report) => sum + report.templates.length, 0);

        let totalPct = 0;
        let totalBars = 0;
        courseReports.forEach((report) => {
            report.templates.forEach((template) => {
                const gradeData = report.gradeSummaryByName[String(template.assessment_name || '').toLowerCase()];
                totalPct += gradeData ? Math.min(100, parseFloat(gradeData.avg_pct) || 0) : 0;
                totalBars += 1;
            });
        });
        const avgCompletion = totalBars > 0 ? Math.round(totalPct / totalBars) : 0;

        const doc = new PDFDocument({ margin: 40, size: 'A4' });

        res.header('Content-Type', 'application/pdf');
        res.attachment(
            requestedCourseId && courses[0]
                ? `${courses[0].course_code}_analytics.pdf`
                : 'admin_analytics_report.pdf'
        );
        doc.pipe(res);

        const ensurePageSpace = (neededHeight = 24) => {
            if (doc.y + neededHeight <= doc.page.height - doc.page.margins.bottom) {
                return;
            }

            doc.addPage();
        };

        doc.fontSize(20).fillColor('#2d1b6e').text('Smart Course Companion', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(13).fillColor('#6a4fcf').text('Admin Analytics Report', { align: 'center' });
        doc.moveDown(1);

        doc.fontSize(11).fillColor('#222222');
        doc.text(`Active Courses: ${courses.length}`);
        doc.text(`Total Students: ${totalStudents}`);
        doc.text(`Assessments: ${totalAssessments}`);
        doc.text(`Average Completion: ${avgCompletion}%`);
        doc.moveDown(1);

        if (!courseReports.length) {
            doc.fontSize(11).fillColor('#555555').text('No active course analytics available.');
            doc.end();
            return;
        }

        courseReports.forEach((report, index) => {
            ensurePageSpace(40);
            if (index > 0) {
                doc.moveDown(0.5);
            }

            doc.fontSize(14).fillColor('#2d1b6e')
                .text(`${report.course.course_code} - ${report.course.course_name}`);
            doc.fontSize(10).fillColor('#444444')
                .text(`Students enrolled: ${Number(report.course.enrollment_count || 0)}`);
            doc.moveDown(0.5);

            if (!report.templates.length) {
                doc.fontSize(10).fillColor('#666666').text('No assessments added yet for this course.');
                doc.moveDown(1);
                return;
            }

            report.templates.forEach((template) => {
                ensurePageSpace(34);
                const gradeData = report.gradeSummaryByName[String(template.assessment_name || '').toLowerCase()];
                const pct = gradeData ? Math.min(100, parseFloat(gradeData.avg_pct) || 0) : 0;
                const submissions = gradeData ? Number(gradeData.submissions || 0) : 0;
                const dueDate = template.due_date
                    ? new Date(template.due_date).toLocaleDateString('en-CA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    })
                    : 'No due date';

                let status = 'Low Completion';
                if (pct >= 75) status = 'On Track';
                else if (pct >= 40) status = 'In Progress';

                doc.fontSize(10).fillColor('#111111')
                    .text(`${template.assessment_name} (${template.category || 'Uncategorized'})`);
                doc.fontSize(9).fillColor('#555555')
                    .text(`Due: ${dueDate}   Completion: ${pct}%   Completed: ${submissions}   Status: ${status}`);
                doc.moveDown(0.4);
            });

            doc.moveDown(0.6);
        });

        doc.end();
    } catch (err) {
        sendServerError(res, err);
    }
});

router.post('/courses', requireAdmin, (req, res) => {
    const {
        course_code,
        course_name,
        instructor,
        term,
        max_students,
        is_enabled
    } = req.body;

    const normalizedCode = String(course_code || '').trim().toUpperCase();
    const normalizedName = String(course_name || '').trim();

    if (!normalizedCode || !normalizedName) {
        return res.status(400).json({ error: 'Course code and course name are required.' });
    }

    db.query(
        `INSERT INTO courses
        (admin_id, course_code, course_name, instructor, term, max_students, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            getAdminId(req),
            normalizedCode,
            normalizedName,
            String(instructor || '').trim() || null,
            String(term || '').trim() || null,
            max_students || null,
            is_enabled ?? 1
        ],
        (err, result) => {
            if (err) return sendServerError(res, err);
            res.json({ message: 'Course added!', id: result.insertId });
        }
    );
});

router.put('/courses/:id', requireAdmin, (req, res) => {
    const courseId = parsePositiveInteger(req.params.id);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    const {
        course_code,
        course_name,
        instructor,
        term,
        max_students,
        is_enabled
    } = req.body;

    const normalizedCode = String(course_code || '').trim().toUpperCase();
    const normalizedName = String(course_name || '').trim();

    if (!normalizedCode || !normalizedName) {
        return res.status(400).json({ error: 'Course code and course name are required.' });
    }

    ensureOwnedCourse(courseId, getAdminId(req), res, () => {
        db.query(
            `UPDATE courses SET
            course_code = ?,
            course_name = ?,
            instructor = ?,
            term = ?,
            max_students = ?,
            is_enabled = ?
            WHERE id = ? AND admin_id = ?`,
            [
                normalizedCode,
                normalizedName,
                String(instructor || '').trim() || null,
                String(term || '').trim() || null,
                max_students || null,
                is_enabled ?? 1,
                courseId,
                getAdminId(req)
            ],
            (err, result) => {
                if (err) return sendServerError(res, err);
                if (result.affectedRows === 0) {
                    return res.status(404).json({ error: 'Course not found.' });
                }
                res.json({ message: 'Course updated!' });
            }
        );
    });
});

router.delete('/courses/:id', requireAdmin, (req, res) => {
    const courseId = parsePositiveInteger(req.params.id);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureOwnedCourse(courseId, getAdminId(req), res, () => {
        db.query(
            'DELETE FROM courses WHERE id = ? AND admin_id = ?',
            [courseId, getAdminId(req)],
            (err, result) => {
                if (err) return sendServerError(res, err);
                if (result.affectedRows === 0) {
                    return res.status(404).json({ error: 'Course not found.' });
                }
                res.json({ message: 'Course deleted!' });
            }
        );
    });
});

router.get('/templates/:courseId', requireAdmin, (req, res) => {
    const courseId = parsePositiveInteger(req.params.courseId);

    if (!courseId) {
        return res.status(400).json({ error: 'Please provide a valid course id.' });
    }

    ensureOwnedCourse(courseId, getAdminId(req), res, () => {
        db.query(
            `SELECT
                id,
                course_id,
                assessment_name,
                category,
                description,
                weight,
                created_at,
                DATE_FORMAT(released_date, '%Y-%m-%dT%H:%i') AS released_date,
                DATE_FORMAT(due_date, '%Y-%m-%dT%H:%i') AS due_date
            FROM assessment_templates
            WHERE course_id = ?
            ORDER BY due_date IS NULL, due_date ASC, id ASC`,
            [courseId],
            (err, results) => {
                if (err) return sendServerError(res, err);
                res.json(results);
            }
        );
    });
});

router.post('/templates', requireAdmin, async (req, res) => {
    const {
        course_id,
        assessment_name,
        category,
        description,
        released_date,
        due_date,
        weight
    } = req.body;

    const courseId = parsePositiveInteger(course_id);
    const normalizedName = String(assessment_name || '').trim();

    if (!courseId) {
        return res.status(400).json({ error: 'Please choose a valid course.' });
    }

    if (!normalizedName) {
        return res.status(400).json({ error: 'Assessment name is required.' });
    }

    const normalizedWeight = normalizeTemplateWeight(weight);
    if (normalizedWeight.error) {
        return res.status(400).json({ error: normalizedWeight.error });
    }

    try {
        const result = await withTransaction(async (connection) => {
            await ensureOwnedCourseLock(connection, courseId, getAdminId(req));
            await ensureCourseTemplateWeightLimit(connection, courseId, normalizedWeight.value);

            return queryConnectionAsync(
                connection,
                `INSERT INTO assessment_templates
                (course_id, assessment_name, category, description, released_date, due_date, weight)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    courseId,
                    normalizedName,
                    String(category || '').trim() || null,
                    String(description || '').trim() || null,
                    released_date || null,
                    due_date || null,
                    normalizedWeight.value
                ]
            );
        });

        res.json({ message: 'Template added!', id: result.insertId });
    } catch (err) {
        if (err.status === 404) {
            return res.status(404).json({ error: err.message });
        }
        if (err.message && err.message.includes('Total assessment weight')) {
            return res.status(400).json({ error: err.message });
        }
        return sendServerError(res, err);
    }
});

router.patch('/templates/:id/field', requireAdmin, async (req, res) => {
    const templateId = parsePositiveInteger(req.params.id);
    const { field, value } = req.body;
    const allowed = ['released_date', 'due_date', 'assessment_name', 'category', 'description', 'weight'];

    if (!templateId) {
        return res.status(400).json({ error: 'Please provide a valid template id.' });
    }

    if (!allowed.includes(field)) {
        return res.status(400).json({ error: 'Invalid field.' });
    }

    try {
        let nextValue = normalizeNullableValue(value);
        if (field === 'weight') {
            const normalizedWeight = normalizeTemplateWeight(value);
            if (normalizedWeight.error) {
                return res.status(400).json({ error: normalizedWeight.error });
            }
            nextValue = normalizedWeight.value;
        }

        const result = await withTransaction(async (connection) => {
            const templates = await queryConnectionAsync(
                connection,
                `SELECT at.id, at.course_id
                 FROM assessment_templates at
                 INNER JOIN courses c ON c.id = at.course_id
                 WHERE at.id = ? AND c.admin_id = ?
                 LIMIT 1`,
                [templateId, getAdminId(req)]
            );

            if (!templates.length) {
                const err = new Error('Template not found.');
                err.status = 404;
                throw err;
            }

            if (field === 'weight') {
                await ensureOwnedCourseLock(connection, templates[0].course_id, getAdminId(req));
                await ensureCourseTemplateWeightLimit(connection, templates[0].course_id, nextValue, templateId);
            }

            return queryConnectionAsync(
                connection,
                `UPDATE assessment_templates SET ${field} = ? WHERE id = ?`,
                [nextValue, templateId]
            );
        });

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Template not found.' });
        }

        res.json({ message: 'Updated!' });
    } catch (err) {
        if (err.status === 404) {
            return res.status(404).json({ error: err.message });
        }
        if (err.message && err.message.includes('Total assessment weight')) {
            return res.status(400).json({ error: err.message });
        }
        return sendServerError(res, err);
    }
});

router.put('/templates/:id', requireAdmin, async (req, res) => {
    const templateId = parsePositiveInteger(req.params.id);

    if (!templateId) {
        return res.status(400).json({ error: 'Please provide a valid template id.' });
    }

    const {
        course_id,
        assessment_name,
        category,
        description,
        released_date,
        due_date,
        weight
    } = req.body;

    const courseId = parsePositiveInteger(course_id);
    const normalizedName = String(assessment_name || '').trim();

    if (!courseId) {
        return res.status(400).json({ error: 'Please choose a valid course.' });
    }

    if (!normalizedName) {
        return res.status(400).json({ error: 'Assessment name is required.' });
    }

    const normalizedWeight = normalizeTemplateWeight(weight);
    if (normalizedWeight.error) {
        return res.status(400).json({ error: normalizedWeight.error });
    }

    try {
        const result = await withTransaction(async (connection) => {
            const templates = await queryConnectionAsync(
                connection,
                `SELECT at.id, at.course_id
                 FROM assessment_templates at
                 INNER JOIN courses c ON c.id = at.course_id
                 WHERE at.id = ? AND c.admin_id = ?
                 LIMIT 1`,
                [templateId, getAdminId(req)]
            );
            if (!templates.length) {
                const err = new Error('Template not found.');
                err.status = 404;
                throw err;
            }

            const courseIdsToLock = [...new Set([templates[0].course_id, courseId])].sort((a, b) => a - b);
            for (const lockedCourseId of courseIdsToLock) {
                await ensureOwnedCourseLock(connection, lockedCourseId, getAdminId(req));
            }

            await ensureCourseTemplateWeightLimit(connection, courseId, normalizedWeight.value, templateId);

            return queryConnectionAsync(
                connection,
                `UPDATE assessment_templates SET
                course_id = ?,
                assessment_name = ?,
                category = ?,
                description = ?,
                released_date = ?,
                due_date = ?,
                weight = ?
                WHERE id = ?`,
                [
                    courseId,
                    normalizedName,
                    String(category || '').trim() || null,
                    String(description || '').trim() || null,
                    released_date || null,
                    due_date || null,
                    normalizedWeight.value,
                    templateId
                ]
            );
        });

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Template not found.' });
        }

        res.json({ message: 'Template updated!' });
    } catch (err) {
        if (err.status === 404) {
            return res.status(404).json({ error: err.message });
        }
        if (err.message && err.message.includes('Total assessment weight')) {
            return res.status(400).json({ error: err.message });
        }
        return sendServerError(res, err);
    }
});

router.delete('/templates/:id', requireAdmin, (req, res) => {
    const templateId = parsePositiveInteger(req.params.id);

    if (!templateId) {
        return res.status(400).json({ error: 'Please provide a valid template id.' });
    }

    ensureOwnedTemplate(templateId, getAdminId(req), res, () => {
        db.query(
            'DELETE FROM assessment_templates WHERE id = ?',
            [templateId],
            (err, result) => {
                if (err) return sendServerError(res, err);
                if (result.affectedRows === 0) {
                    return res.status(404).json({ error: 'Template not found.' });
                }
                res.json({ message: 'Template deleted!' });
            }
        );
    });
});

module.exports = router;
