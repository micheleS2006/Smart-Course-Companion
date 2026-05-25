const ACCOUNT_API = '/api/student/account';
const ENROLLMENTS_API = '/api/student/enrollments';

function getElement(id) {
    return document.getElementById(id);
}

function showStatus(message) {
    const status = getElement('accountStatus');
    if (!status) return;

    status.textContent = message;
    status.className = 'account-status error';
    status.hidden = false;
}

function hideStatus() {
    const status = getElement('accountStatus');
    if (!status) return;

    status.hidden = true;
    status.textContent = '';
    status.className = 'account-status';
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.error || 'Request failed');
    }

    return payload;
}

function formatCreatedAt(value) {
    if (!value) return 'N/A';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'N/A';
    }

    return date.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function renderAccount(account) {
    getElement('studentName').textContent = account.name || 'N/A';
    getElement('studentNumber').textContent = account.student_number || 'N/A';
    getElement('studentEmail').textContent = account.email || 'N/A';
    getElement('studentCreatedAt').textContent = formatCreatedAt(account.created_at);
}

function renderCourses(courses) {
    const courseList = getElement('courseList');
    if (!courseList) return;

    if (!courses.length) {
        courseList.innerHTML = '<li class="account-empty">No enrolled courses yet.</li>';
        return;
    }

    courseList.innerHTML = courses.map((course) => {
        const title = [course.course_code, course.course_name].filter(Boolean).join(' - ');
        const meta = [course.term, course.instructor].filter(Boolean).join(' | ');

        return `
            <li>
                <div>
                    <div class="course-main">${title || 'Untitled Course'}</div>
                    ${meta ? `<div class="course-meta">${meta}</div>` : ''}
                </div>
            </li>
        `;
    }).join('');
}

async function loadAccountPage() {
    try {
        hideStatus();
        const [account, courses] = await Promise.all([
            fetchJson(ACCOUNT_API),
            fetchJson(ENROLLMENTS_API)
        ]);

        renderAccount(account);
        renderCourses(courses);
    } catch (error) {
        showStatus(`Could not load account details: ${error.message}`);
        renderCourses([]);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    loadAccountPage();
});
