const db = require('../db');

function runQueries(queries, done) {
    const steps = Array.isArray(queries) ? queries.slice() : [];

    function runNext() {
        if (steps.length === 0) {
            done(null);
            return;
        }

        const { sql, params } = steps.shift();
        db.query(sql, params, (err) => {
            if (err) {
                done(err);
                return;
            }

            runNext();
        });
    }

    runNext();
}

function buildSyncQueries(studentId, courseId = null) {
    const courseFilter = courseId ? 'AND at.course_id = ?' : '';
    const deleteCourseFilter = courseId ? 'AND sg.course_id = ?' : '';
    const scopedParams = courseId ? [studentId, courseId] : [studentId];
    const insertParams = courseId ? [studentId, studentId, courseId] : [studentId, studentId];

    return [
        {
            sql: `DELETE sg
                FROM student_grades sg
                LEFT JOIN assessment_templates at ON at.id = sg.assessment_id
                WHERE sg.student_id = ?
                AND sg.assessment_id IS NOT NULL
                AND at.id IS NULL
                ${deleteCourseFilter}`,
            params: scopedParams
        },
        {
            sql: `UPDATE student_grades sg
                INNER JOIN assessment_templates at ON at.id = sg.assessment_id
                SET
                    sg.course_id = at.course_id,
                    sg.assessment_name = at.assessment_name,
                    sg.category = at.category,
                    sg.due_date = DATE(at.due_date),
                    sg.weight = at.weight,
                    sg.updated_at = NOW()
                WHERE sg.student_id = ?
                ${courseFilter}`,
            params: scopedParams
        },
        {
            sql: `INSERT INTO student_grades
                (student_id, course_id, assessment_id, assessment_name, category, due_date, weight, status, created_at, updated_at)
                SELECT
                    ?,
                    at.course_id,
                    at.id,
                    at.assessment_name,
                    at.category,
                    DATE(at.due_date),
                    at.weight,
                    'pending',
                    NOW(),
                    NOW()
                FROM assessment_templates at
                INNER JOIN enrollments e
                    ON e.course_id = at.course_id
                    AND e.student_id = ?
                LEFT JOIN student_grades sg
                    ON sg.student_id = e.student_id
                    AND sg.assessment_id = at.id
                WHERE sg.id IS NULL
                ${courseFilter}`,
            params: insertParams
        }
    ];
}

function syncAllTemplatesToStudent(studentId, done) {
    runQueries(buildSyncQueries(studentId), done);
}

function syncCourseTemplatesToStudent(courseId, studentId, done) {
    runQueries(buildSyncQueries(studentId, courseId), done);
}

module.exports = {
    syncAllTemplatesToStudent,
    syncCourseTemplatesToStudent
};
