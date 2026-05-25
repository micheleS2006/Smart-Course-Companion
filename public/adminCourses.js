const express = require('express');
const router = express.Router();
const db = require('../db');

console.log('✅ adminCourses router file loaded'); 

router.get('/test-admin', (req, res) => {
    res.send('admin routes working');
});

// GET all courses
router.get('/courses', (req, res) => {
    db.query(
        'SELECT * FROM courses',
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});

// ADD a new course
router.post('/courses', (req, res) => {
    const {
        course_code,
        course_name,
        instructor,
        term,
        max_students,
        is_enabled
    } = req.body;

    db.query(
        `INSERT INTO courses
        (course_code, course_name, instructor, term, max_students, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
            course_code,
            course_name,
            instructor,
            term,
            max_students,
            is_enabled ?? 1
        ],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Course added!', id: result.insertId });
        }
    );
});

// EDIT a course
router.put('/courses/:id', (req, res) => {
    const { id } = req.params;
    const {
        course_code,
        course_name,
        instructor,
        term,
        max_students,
        is_enabled
    } = req.body;

    db.query(
        `UPDATE courses SET
        course_code = ?,
        course_name = ?,
        instructor = ?,
        term = ?,
        max_students = ?,
        is_enabled = ?
        WHERE id = ?`,
        [
            course_code,
            course_name,
            instructor,
            term,
            max_students,
            is_enabled,
            id
        ],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Course updated!' });
        }
    );
});

// DELETE a course
router.delete('/courses/:id', (req, res) => {
    const { id } = req.params;

    db.query(
        'DELETE FROM courses WHERE id = ?',
        [id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Course deleted!' });
        }
    );
});

// GET all assessment templates for one course
router.get('/templates/:courseId', (req, res) => {
    const { courseId } = req.params;

    db.query(
        `SELECT id, course_id, assessment_name, category, description, weight,
        DATE_FORMAT(released_date, '%Y-%m-%dT%H:%i') AS released_date,
        DATE_FORMAT(due_date, '%Y-%m-%dT%H:%i') AS due_date
        FROM assessment_templates WHERE course_id = ?`,
        [courseId],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results);
        }
    );
});

// ADD a new assessment template
router.post('/templates', (req, res) => {
    const {
        course_id,
        assessment_name,
        category,
        description,
        released_date,
        due_date,
        weight
    } = req.body;

    db.query(
        `INSERT INTO assessment_templates
        (course_id, assessment_name, category, description, released_date, due_date, weight)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            course_id,
            assessment_name,
            category,
            description,
            released_date || null,
            due_date,
            weight
        ],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Template added!', id: result.insertId });
        }
    );
});

router.patch('/templates/:id/field', (req, res) => {
    const { id } = req.params;
    const { field, value } = req.body;
    const allowed = ['released_date', 'due_date', 'assessment_name', 'category', 'description', 'weight'];
    if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' });
    db.query(
        `UPDATE assessment_templates SET ${field} = ? WHERE id = ?`,
        [value, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Updated!' });
        }
    );
});


router.put('/templates/:id', (req, res) => {
    const { id } = req.params;
    const {
        course_id,
        assessment_name,
        category,
        description,
        released_date,
        due_date,
        weight
    } = req.body;

    db.query(
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
            course_id,
            assessment_name,
            category,
            description,
            released_date || null,
            due_date,
            weight,
            id
        ],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Template updated!' });
        }
    );
});

// DELETE an assessment template
router.delete('/templates/:id', (req, res) => {
    const { id } = req.params;

    db.query(
        'DELETE FROM assessment_templates WHERE id = ?',
        [id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Template deleted!' });
        }
    );
});

module.exports = router;