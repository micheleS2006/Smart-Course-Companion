const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function ensureStudentGradesWeightColumn() {
    db.query(
        `SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'student_grades'
        AND COLUMN_NAME = 'weight'
        LIMIT 1`,
        [process.env.DB_NAME],
        (checkErr, results) => {
            if (checkErr) {
                console.log('Could not inspect student_grades columns:', checkErr);
                return;
            }

            if (results.length > 0) {
                return;
            }

            db.query(
                'ALTER TABLE student_grades ADD COLUMN weight DECIMAL(5,2) NULL AFTER due_date',
                (alterErr) => {
                    if (alterErr) {
                        console.log('Could not add weight column to student_grades:', alterErr);
                        return;
                    }

                    console.log('Added weight column to student_grades.');
                }
            );
        }
    );
}

function ensureColumn(tableName, columnName, definition, onReady) {
    db.query(
        `SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        LIMIT 1`,
        [process.env.DB_NAME, tableName, columnName],
        (checkErr, results) => {
            if (checkErr) {
                console.log(`Could not inspect ${tableName}.${columnName}:`, checkErr);
                return;
            }

            if (results.length > 0) {
                if (typeof onReady === 'function') {
                    onReady(false);
                }
                return;
            }

            db.query(
                `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`,
                (alterErr) => {
                    if (alterErr) {
                        console.log(`Could not add ${columnName} to ${tableName}:`, alterErr);
                        return;
                    }

                    console.log(`Added ${columnName} column to ${tableName}.`);
                    if (typeof onReady === 'function') {
                        onReady(true);
                    }
                }
            );
        }
    );
}

function assignLegacyCoursesToSingleAdmin() {
    db.query(
        `SELECT id
         FROM admins
         ORDER BY id ASC`,
        (adminErr, admins) => {
            if (adminErr) {
                console.log('Could not inspect admin accounts for course ownership backfill:', adminErr);
                return;
            }

            if (admins.length !== 1) {
                return;
            }

            db.query(
                'UPDATE courses SET admin_id = ? WHERE admin_id IS NULL',
                [admins[0].id],
                (updateErr, result) => {
                    if (updateErr) {
                        console.log('Could not backfill course ownership:', updateErr);
                        return;
                    }

                    if (result.affectedRows > 0) {
                        console.log(`Assigned ${result.affectedRows} existing course(s) to admin ${admins[0].id}.`);
                    }
                }
            );
        }
    );
}

function ensureStudentTemplateProgressTable() {
    db.query(
        `CREATE TABLE IF NOT EXISTS student_template_progress (
            id INT PRIMARY KEY AUTO_INCREMENT,
            student_id INT NOT NULL,
            template_id INT NOT NULL,
            status ENUM('pending', 'completed') NOT NULL DEFAULT 'completed',
            completed_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_student_template_progress_student_template (student_id, template_id),
            INDEX idx_student_template_progress_student_id (student_id),
            INDEX idx_student_template_progress_template_id (template_id),
            CONSTRAINT fk_student_template_progress_student
                FOREIGN KEY (student_id) REFERENCES students(id)
                ON DELETE CASCADE,
            CONSTRAINT fk_student_template_progress_template
                FOREIGN KEY (template_id) REFERENCES assessment_templates(id)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        (err) => {
            if (err) {
                console.log('Could not ensure student_template_progress table:', err);
                return;
            }

            console.log('Ensured student_template_progress table exists.');
        }
    );
}

function ensureStudentAgendaItemsTable() {
    db.query(
        `CREATE TABLE IF NOT EXISTS student_agenda_items (
            id INT PRIMARY KEY AUTO_INCREMENT,
            student_id INT NOT NULL,
            task_text VARCHAR(120) NOT NULL,
            color VARCHAR(7) NOT NULL DEFAULT '#9a89d6',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_student_agenda_items_student_id (student_id),
            CONSTRAINT fk_student_agenda_items_student
                FOREIGN KEY (student_id) REFERENCES students(id)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        (err) => {
            if (err) {
                console.log('Could not ensure student_agenda_items table:', err);
                return;
            }

            console.log('Ensured student_agenda_items table exists.');
        }
    );
}

function ensureStudentHiddenEnrollmentsTable() {
    db.query(
        `CREATE TABLE IF NOT EXISTS student_hidden_enrollments (
            enrollment_id INT PRIMARY KEY,
            hidden_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_student_hidden_enrollments_enrollment
                FOREIGN KEY (enrollment_id) REFERENCES enrollments(id)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        (err) => {
            if (err) {
                console.log('Could not ensure student_hidden_enrollments table:', err);
                return;
            }

            console.log('Ensured student_hidden_enrollments table exists.');
        }
    );
}

db.query('SELECT 1', (err) => {
    if (err) {
        console.log('Database connection failed:', err);
        return;
    }

    console.log('Connected to MySQL database!');
    ensureStudentGradesWeightColumn();
    ensureColumn('students', 'program', 'VARCHAR(100) NULL AFTER student_number');
    ensureColumn('students', 'current_term', 'VARCHAR(50) NULL AFTER program');
    ensureColumn('admins', 'department', 'VARCHAR(100) NULL AFTER email');
    ensureColumn('admins', 'role', 'VARCHAR(50) NULL AFTER department');
    ensureColumn('assessment_templates', 'released_date', 'DATETIME NULL AFTER description');
    ensureColumn('courses', 'admin_id', 'INT NULL AFTER id', assignLegacyCoursesToSingleAdmin);
    ensureStudentTemplateProgressTable();
    ensureStudentAgendaItemsTable();
    ensureStudentHiddenEnrollmentsTable();
});

module.exports = db;
