const API = '/api/grades';
const STUDENT_API = '/api/student';

const COURSE_IDS = {
    soen287: 1,
    comp249: 2,
    engr233: 3,
    soen228: 4
};

function getCourseId() {
    const params = new URLSearchParams(window.location.search);
    const queryCourseId = Number(params.get('courseId'));
    if (Number.isInteger(queryCourseId) && queryCourseId > 0) {
        return queryCourseId;
    }

    const page = window.location.pathname.toLowerCase();
    if (page.includes('soen287')) return COURSE_IDS.soen287;
    if (page.includes('comp249')) return COURSE_IDS.comp249;
    if (page.includes('engr233')) return COURSE_IDS.engr233;
    if (page.includes('soen228')) return COURSE_IDS.soen228;
    return null;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function ensureFeedbackBox() {
    let feedback = document.getElementById('detailsFeedback');
    if (feedback) return feedback;

    const assessments = document.querySelector('.assessments');
    const heading = assessments ? assessments.querySelector('h2') : null;

    feedback = document.createElement('div');
    feedback.id = 'detailsFeedback';
    feedback.className = 'details-feedback';
    feedback.hidden = true;

    if (heading) {
        heading.insertAdjacentElement('afterend', feedback);
    } else if (assessments) {
        assessments.prepend(feedback);
    }

    return feedback;
}

function showFeedback(message, type = 'error') {
    const feedback = ensureFeedbackBox();
    feedback.textContent = message;
    feedback.className = `details-feedback ${type}`;
    feedback.hidden = false;
}

function clearFeedback() {
    const feedback = ensureFeedbackBox();
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.className = 'details-feedback';
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.error || payload.message || 'Request failed');
    }

    return payload;
}

function validateDateInput(value) {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return 'Please enter a valid due date.';
    }

    const [year, month, day] = value.split('-').map(Number);
    const parsedDate = new Date(`${value}T00:00:00`);

    if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.getUTCFullYear() !== year ||
        parsedDate.getUTCMonth() + 1 !== month ||
        parsedDate.getUTCDate() !== day
    ) {
        return 'Please enter a valid due date.';
    }

    return null;
}

function validateAssessmentPayload(payload) {
    if (!payload.assessment_name) {
        return 'Assessment name is required.';
    }

    if (payload.assessment_name.length > 100) {
        return 'Assessment name must be 100 characters or fewer.';
    }

    if ((payload.category || '').length > 50) {
        return 'Assessment type must be 50 characters or fewer.';
    }

    const dueDateError = validateDateInput(payload.due_date);
    if (dueDateError) {
        return dueDateError;
    }

    if (payload.weight !== null && (payload.weight < 0 || payload.weight > 100)) {
        return 'Weight must be between 0 and 100.';
    }

    if (payload.earned_marks !== null && payload.earned_marks < 0) {
        return 'Earned marks cannot be negative.';
    }

    if (payload.total_marks !== null && payload.total_marks <= 0) {
        return 'Total marks must be greater than 0.';
    }

    if ((payload.earned_marks === null) !== (payload.total_marks === null)) {
        return 'Earned and total marks must both be filled or both be empty.';
    }

    if (!['pending', 'completed'].includes(payload.status)) {
        return 'Please choose a valid status.';
    }

    return null;
}

function enforceWeightInputLimit(input) {
    if (!input || input.dataset.weightLimitReady === 'true') return;

    input.dataset.weightLimitReady = 'true';
    input.setAttribute('min', '0');
    input.setAttribute('max', '100');
    input.setAttribute('step', '0.01');

    input.addEventListener('input', () => {
        if (input.value === '') {
            input.setCustomValidity('');
            return;
        }

        const numericValue = Number(input.value);

        if (!Number.isFinite(numericValue)) {
            input.setCustomValidity('Please enter a valid weight.');
            input.reportValidity();
            return;
        }

        if (numericValue > 100) {
            input.value = '100';
        } else if (numericValue < 0) {
            input.value = '0';
        }

        input.setCustomValidity('');
    });
}

function initializeWeightInputs(scope = document) {
    scope.querySelectorAll('.js-weight, #newWeight').forEach((input) => {
        enforceWeightInputLimit(input);
    });
}

function formatCourseHeading(course) {
    const code = course.course_code || 'Unknown Course';
    const name = course.course_name || 'Course Details';
    return `${code} - ${name}`.toUpperCase();
}

function renderCourseDetails(course) {
    const titleElement = document.getElementById('courseTitle');
    const instructorElement = document.getElementById('courseInstructor');
    const termElement = document.getElementById('courseTerm');
    const pageTitle = document.getElementById('pageTitle');

    if (titleElement) {
        titleElement.textContent = formatCourseHeading(course);
    }

    if (instructorElement) {
        instructorElement.textContent = course.instructor || 'N/A';
    }

    if (termElement) {
        termElement.textContent = course.term || 'N/A';
    }

    if (pageTitle) {
        pageTitle.textContent = course.course_code
            ? `Course Details - ${course.course_code}`
            : 'Course Details';
    }
}

async function loadCourseDetails(courseId) {
    const courses = await fetchJson(`${STUDENT_API}/enrollments`);
    const course = courses.find((item) => Number(item.course_id) === Number(courseId));

    if (!course) {
        throw new Error('Course details could not be found for this enrollment.');
    }

    renderCourseDetails(course);
}

function calculatePercentage(earnedMarks, totalMarks) {
    if (earnedMarks === null || earnedMarks === undefined || earnedMarks === '') return null;
    if (totalMarks === null || totalMarks === undefined || totalMarks === '' || Number(totalMarks) === 0) {
        return null;
    }

    return ((Number(earnedMarks) / Number(totalMarks)) * 100).toFixed(2);
}

function createRow(grade) {
    const gradeId = grade.grade_id ?? grade.id;
    const dueDate = grade.due_date ? String(grade.due_date).split('T')[0] : '';
    const percentage = calculatePercentage(grade.earned_marks, grade.total_marks);

    return `
    <tr id="row-${gradeId}">
        <td><input type="text" class="assessments-input js-name"
            value="${escapeHtml(grade.assessment_name)}" disabled></td>
        <td><input type="text" class="assessments-input js-category"
            value="${escapeHtml(grade.category || '')}" disabled></td>
        <td><input type="date" class="assessments-input js-due"
            value="${dueDate}" disabled></td>
        <td><input type="number" class="assessments-input js-weight"
            min="0" max="100" step="0.01" value="${grade.weight ?? ''}" disabled></td>
        <td><input type="number" class="assessments-input js-earned"
            min="0" step="0.01" value="${grade.earned_marks ?? ''}" disabled></td>
        <td><input type="number" class="assessments-input js-total"
            min="0" step="0.01" value="${grade.total_marks ?? ''}" disabled></td>
        <td>
            <select class="js-status" disabled>
                <option value="pending" ${grade.status === 'pending' ? 'selected' : ''}>pending</option>
                <option value="completed" ${grade.status === 'completed' ? 'selected' : ''}>completed</option>
            </select>
        </td>
        <td class="js-result">${percentage ? `${percentage}%` : '-'}</td>
        <td class="actions">
            <button onclick="editRow(${gradeId})">Edit</button>
            <button onclick="deleteRow(${gradeId})">Delete</button>
        </td>
    </tr>`;
}

async function loadAssessments() {
    const courseId = getCourseId();
    if (!courseId) {
        showFeedback('Course details could not be loaded because the course id is missing.');
        return;
    }

    try {
        clearFeedback();
        const grades = await fetchJson(`${API}/${courseId}/details`);
        const tbody = document.getElementById('gradesBody');
        tbody.innerHTML = '';

        grades.forEach((grade) => {
            tbody.innerHTML += createRow(grade);
        });

        initializeWeightInputs(tbody);

        if (!grades.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align:center; opacity:0.7;">
                        No assessments yet. Add your first one above.
                    </td>
                </tr>
            `;
        }

        await loadAverage(courseId);
    } catch (error) {
        const tbody = document.getElementById('gradesBody');
        showFeedback(`Could not load assessments: ${error.message}`);
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align:center; color:#a22;">
                    Could not load assessments: ${escapeHtml(error.message)}
                </td>
            </tr>
        `;
    }
}

async function loadAverage(courseId) {
    const data = await fetchJson(`${API}/${courseId}/average`);
    const avgEl = document.getElementById('courseAverage');
    if (!avgEl) return;

    avgEl.textContent = data.average
        ? `Current Weighted Average: ${data.average}%`
        : 'Current Weighted Average: N/A';
}

function editRow(id) {
    const row = document.getElementById(`row-${id}`);
    const controls = row.querySelectorAll('input, select');
    controls.forEach((control) => {
        control.disabled = false;
    });

    row.querySelector('.actions').innerHTML = `
        <button onclick="saveRow(${id})">Save</button>
        <button onclick="deleteRow(${id})">Delete</button>
    `;
}

function buildPayloadFromRow(row, courseId) {
    const name = row.querySelector('.js-name').value.trim();
    const category = row.querySelector('.js-category').value.trim();
    const dueDate = row.querySelector('.js-due').value || null;
    const weightValue = row.querySelector('.js-weight').value;
    const earnedValue = row.querySelector('.js-earned').value;
    const totalValue = row.querySelector('.js-total').value;
    const status = row.querySelector('.js-status').value;

    const payload = {
        course_id: courseId,
        assessment_name: name,
        category,
        due_date: dueDate,
        weight: weightValue === '' ? null : Number(weightValue),
        earned_marks: earnedValue === '' ? null : Number(earnedValue),
        total_marks: totalValue === '' ? null : Number(totalValue),
        status
    };

    const validationError = validateAssessmentPayload(payload);
    if (validationError) {
        throw new Error(validationError);
    }

    return payload;
}

function getCurrentWeightTotal(excludedRowId = null) {
    const rows = Array.from(document.querySelectorAll('#gradesBody tr[id^="row-"]'));

    return rows.reduce((sum, row) => {
        const rowId = row.id.replace('row-', '');
        if (excludedRowId !== null && String(rowId) === String(excludedRowId)) {
            return sum;
        }

        const weightInput = row.querySelector('.js-weight');
        if (!weightInput || weightInput.value === '') {
            return sum;
        }

        const weight = Number(weightInput.value);
        return Number.isFinite(weight) ? sum + weight : sum;
    }, 0);
}

function validateWeightTotal(nextWeight, excludedRowId = null) {
    const courseWeight = getCurrentWeightTotal(excludedRowId);
    const proposedWeight = nextWeight ?? 0;
    const nextTotal = courseWeight + proposedWeight;

    if (nextTotal > 100) {
        throw new Error(
            `Total weight for this course cannot exceed 100%. This change would bring it to ${nextTotal.toFixed(2)}%.`
        );
    }
}

async function saveRow(id) {
    const row = document.getElementById(`row-${id}`);
    const courseId = getCourseId();

    try {
        clearFeedback();
        const payload = buildPayloadFromRow(row, courseId);
        validateWeightTotal(payload.weight, id);

        await fetchJson(`${API}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        await loadAssessments();
        showFeedback('Assessment updated successfully.', 'success');
    } catch (error) {
        showFeedback(error.message);
    }
}

async function deleteRow(id) {
    if (!confirm('Are you sure you want to delete this assessment?')) return;

    try {
        clearFeedback();
        await fetchJson(`${API}/${id}`, { method: 'DELETE' });
        await loadAssessments();
        showFeedback('Assessment deleted successfully.', 'success');
    } catch (error) {
        showFeedback(error.message);
    }
}

async function addAssessment() {
    const courseId = getCourseId();

    try {
        clearFeedback();
        const payload = {
            course_id: courseId,
            assessment_name: document.getElementById('newName').value.trim(),
            category: document.getElementById('newCategory').value.trim(),
            due_date: document.getElementById('newDueDate').value || null,
            weight: document.getElementById('newWeight').value === ''
                ? null
                : Number(document.getElementById('newWeight').value),
            earned_marks: document.getElementById('newEarned').value === ''
                ? null
                : Number(document.getElementById('newEarned').value),
            total_marks: document.getElementById('newTotal').value === ''
                ? null
                : Number(document.getElementById('newTotal').value),
            status: document.getElementById('newStatus').value
        };

        const validationError = validateAssessmentPayload(payload);
        if (validationError) {
            throw new Error(validationError);
        }

        validateWeightTotal(payload.weight);

        await fetchJson(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        closeModal();
        await loadAssessments();
        showFeedback('Assessment added successfully.', 'success');
    } catch (error) {
        showFeedback(error.message);
    }
}

function openModal() {
    initializeWeightInputs();
    document.getElementById('addModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('addModal').style.display = 'none';
    ['newName', 'newCategory', 'newDueDate', 'newWeight', 'newEarned', 'newTotal', 'newStatus']
        .forEach((id) => {
            const element = document.getElementById(id);
            if (!element) return;
            if (element.tagName === 'SELECT') {
                element.selectedIndex = 0;
            } else {
                element.value = '';
            }
        });
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    localStorage.setItem(
        'theme',
        document.body.classList.contains('light-mode') ? 'light' : 'dark'
    );
}

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
    }

    initializeWeightInputs();
});

async function initializeDetailsPage() {
    const courseId = getCourseId();

    if (!courseId) {
        showFeedback('Course details could not be loaded because the course id is missing.');
        return;
    }

    try {
        await loadCourseDetails(courseId);
    } catch (error) {
        showFeedback(error.message);
    }

    await loadAssessments();
}

window.onload = initializeDetailsPage;
