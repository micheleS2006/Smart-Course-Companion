const STUDENT_API = '/api/student';
const GRADES_API = '/api/grades';

let activeCourseId = null;
let enrolledCourses = [];

function normalizeCourseCode(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/\s+/g, '');
}

function getLegacyCourseCodeFromPath() {
    const page = window.location.pathname.toLowerCase();
    if (page.includes('comp249')) return 'COMP 249';
    if (page.includes('soen287')) return 'SOEN 287';
    if (page.includes('engr233')) return 'ENGR 233';
    if (page.includes('soen228')) return 'SOEN 228';
    return null;
}

function getRequestedCourseId() {
    const params = new URLSearchParams(window.location.search);
    const courseId = Number(params.get('courseId'));
    return Number.isInteger(courseId) && courseId > 0 ? courseId : null;
}

function isDetailMode() {
    return getRequestedCourseId() !== null || getLegacyCourseCodeFromPath() !== null;
}

function getSelectedCourse(courses) {
    const requestedCourseId = getRequestedCourseId();
    if (requestedCourseId !== null) {
        return courses.find((course) => Number(course.course_id) === requestedCourseId) || null;
    }

    const legacyCourseCode = getLegacyCourseCodeFromPath();
    if (!legacyCourseCode) {
        return null;
    }

    const normalizedLegacyCode = normalizeCourseCode(legacyCourseCode);
    return courses.find(
        (course) => normalizeCourseCode(course.course_code) === normalizedLegacyCode
    ) || null;
}

function getCourseAnalyticsUrl(course) {
    return `analytics.html?courseId=${encodeURIComponent(course.course_id)}`;
}

function formatCourseLabel(course) {
    const code = course.course_code || 'Untitled Course';
    const name = course.course_name ? ` - ${course.course_name}` : '';
    return `${code}${name}`;
}

function toGpa(avg) {
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
}

function getProgressPercentage(data) {
    if (!data.total_weight) {
        return data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
    }

    return Math.round((data.completed_weight / data.total_weight) * 100);
}

function toNumberOrNull(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function getCompletedAssessments(assessments) {
    return assessments.filter((assessment) => toNumberOrNull(assessment.percentage) !== null);
}

function calculateAverage(assessments) {
    const completedAssessments = getCompletedAssessments(assessments);

    if (!completedAssessments.length) {
        return 0;
    }

    const weightedAssessments = completedAssessments.filter(
        (assessment) => (toNumberOrNull(assessment.weight) || 0) > 0
    );

    if (weightedAssessments.length) {
        const weightedPoints = weightedAssessments.reduce((sum, assessment) => {
            const weight = toNumberOrNull(assessment.weight) || 0;
            const percentage = toNumberOrNull(assessment.percentage) || 0;
            return sum + ((percentage / 100) * weight);
        }, 0);
        const totalWeight = weightedAssessments.reduce(
            (sum, assessment) => sum + (toNumberOrNull(assessment.weight) || 0),
            0
        );

        if (totalWeight > 0) {
            return Number((((weightedPoints / totalWeight) * 100).toFixed(2)));
        }
    }

    const totalPercentage = completedAssessments.reduce(
        (sum, assessment) => sum + (toNumberOrNull(assessment.percentage) || 0),
        0
    );

    return Number((totalPercentage / completedAssessments.length).toFixed(2));
}

function updateRing(ring, value, label) {
    if (!ring) return;

    ring.style.setProperty('--p', String(value));
    const center = ring.querySelector('.ring-center');
    if (center) {
        center.textContent = label;
    }
}

function setSummaryOverviewVisible(isVisible) {
    const detailSection = document.getElementById('detailSection');
    if (detailSection) {
        detailSection.hidden = !isVisible;
    }
}

function clearAnalyticsError() {
    document.querySelectorAll('.analytics-error').forEach((node) => node.remove());
}

function setAnalyticsError(message) {
    const content = document.querySelector('.content');
    if (!content) return;

    clearAnalyticsError();

    const error = document.createElement('p');
    error.className = 'analytics-error';
    error.textContent = message;
    error.style.color = '#a22';
    error.style.fontWeight = '600';
    content.prepend(error);
}

async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.error || 'Request failed');
    }

    return payload;
}

async function fetchAnalytics(courseId) {
    return fetchJson(`${GRADES_API}/${courseId}/analytics`);
}

async function fetchEnrollments() {
    try {
        const response = await fetch(`${STUDENT_API}/enrollments`);
        const contentType = String(response.headers.get('content-type') || '');

        if (!response.ok || !contentType.includes('application/json')) {
            return [];
        }

        const payload = await response.json().catch(() => []);
        return Array.isArray(payload) ? payload : [];
    } catch {
        return [];
    }
}

function buildSidebar(courses, selectedCourseId = null) {
    const sidebar = document.getElementById('analyticsSidebar');
    if (!sidebar) return;

    sidebar.innerHTML = '';

    const title = document.createElement('h2');
    title.className = 'side-title';
    title.textContent = 'Courses';
    sidebar.appendChild(title);

    const allCoursesLink = document.createElement('a');
    allCoursesLink.className = `course-link${selectedCourseId === null ? ' active-course' : ''}`;
    allCoursesLink.href = 'analytics.html';
    allCoursesLink.textContent = 'All Courses';
    sidebar.appendChild(allCoursesLink);

    if (!courses.length) {
        const empty = document.createElement('p');
        empty.style.opacity = '0.6';
        empty.style.fontSize = '13px';
        empty.style.marginTop = '14px';
        empty.textContent = 'Enroll in a course to see analytics';
        sidebar.appendChild(empty);
        return;
    }

    courses.forEach((course) => {
        const link = document.createElement('a');
        link.className = `course-link${Number(course.course_id) === Number(selectedCourseId) ? ' active-course' : ''}`;
        link.href = getCourseAnalyticsUrl(course);
        link.textContent = course.course_code || course.course_name || `Course ${course.course_id}`;
        sidebar.appendChild(link);
    });
}

function showSummaryMode() {
    const heading = document.getElementById('analyticsHeading');
    if (heading) {
        heading.textContent = 'Analytics Summary';
    }

    const summarySection = document.getElementById('summarySection');
    if (summarySection) {
        summarySection.hidden = false;
    }

    setSummaryOverviewVisible(false);

    const exportSection = document.getElementById('detailExportSection');
    if (exportSection) {
        exportSection.hidden = true;
    }
}

function showDetailMode(course) {
    const title = course?.course_code
        ? `Analytics - ${course.course_code}`
        : 'Course Analytics';

    const heading = document.getElementById('analyticsHeading');
    if (heading) {
        heading.textContent = title;
    } else {
        const firstHeading = document.querySelector('.content h1');
        if (firstHeading) {
            firstHeading.textContent = title;
        }
    }

    document.title = title;

    const summarySection = document.getElementById('summarySection');
    if (summarySection) {
        summarySection.hidden = true;
    }

    const detailSection = document.getElementById('detailSection');
    if (detailSection) {
        detailSection.hidden = false;
    }

    const exportSection = document.getElementById('detailExportSection');
    if (exportSection) {
        exportSection.hidden = false;
    }
}

function renderSummaryCards(courses) {
    const summaryGrid = document.getElementById('summaryGrid');
    if (!summaryGrid) return;

    summaryGrid.innerHTML = courses.map((course) => `
        <a href="${getCourseAnalyticsUrl(course)}" class="summary-card">
            <h2>${course.course_code || `Course ${course.course_id}`}</h2>
            <p style="font-size:12px; opacity:0.65; margin-top:-4px; margin-bottom:12px;">
                ${course.course_name || 'No course name'}
            </p>
            <div style="display:flex; gap:16px; justify-content:center;">
                <div>
                    <p style="font-size:11px; opacity:0.6; margin-bottom:4px;">Average</p>
                    <div id="avg-ring-${course.course_id}" class="ring small-ring" style="--p:0;">
                        <span class="ring-center">0%</span>
                    </div>
                </div>
                <div>
                    <p style="font-size:11px; opacity:0.6; margin-bottom:4px;">GPA</p>
                    <div id="gpa-ring-${course.course_id}" class="ring small-ring" style="--p:0;">
                        <span class="ring-center">0</span>
                    </div>
                </div>
            </div>
            <p id="comp-${course.course_id}">Completed 0 / 0</p>
        </a>
    `).join('');
}

function renderSummaryEmptyState(isEmpty) {
    const summaryGrid = document.getElementById('summaryGrid');
    const emptyState = document.getElementById('analyticsEmptyState');

    if (summaryGrid) {
        summaryGrid.innerHTML = '';
    }

    if (emptyState) {
        emptyState.hidden = !isEmpty;
    }
}

function renderTrendBars(container, data) {
    if (!container) return;

    const completedAssessments = getCompletedAssessments(data.assessments || []);

    if (!completedAssessments.length) {
        container.innerHTML = `
            <p style="opacity:0.5;">No graded assessments</p>
        `;
        return;
    }

    container.innerHTML = completedAssessments.map((assessment) => {
        const weightValue = toNumberOrNull(assessment.weight);
        const percentageValue = toNumberOrNull(assessment.percentage) || 0;
        const weightLabel = weightValue !== null ? `${weightValue}%` : 'No weight';
        const label = assessment.trend_label || assessment.assessment_name;
        return `
            <div class="trend-row">
                <span>${label} (${weightLabel})</span>
                <div class="trend-bar-wrap">
                    <div class="trend-bar" style="width:${percentageValue}%;"></div>
                </div>
                <span>${percentageValue}%</span>
            </div>
        `;
    }).join('');
}

function populateDetailView(data) {
    const average = Number(data.average || 0);
    const gpa = toGpa(average);
    const completionPercent = getProgressPercentage(data);

    const averageRing = document.getElementById('detailAverageRing') || document.getElementById('averageRing');
    const gpaRing = document.getElementById('detailGpaRing') || document.getElementById('gpaRing');
    const completionRing = document.getElementById('detailCompletionRing')
        || document.querySelector('.stat-card:nth-of-type(2) .ring');
    const completionValue = document.getElementById('detailCompletionValue')
        || document.getElementById('completionValue');
    const trendContainer = document.getElementById('detailTrendBars')
        || document.getElementById('trendBars');

    updateRing(averageRing, average, `${average.toFixed(2)}%`);
    updateRing(gpaRing, ((gpa / 4.3) * 100).toFixed(0), gpa.toFixed(1));
    updateRing(completionRing, completionPercent, `${completionPercent}%`);

    if (completionValue) {
        completionValue.textContent = `${data.completed} / ${data.total}`;
    }

    renderTrendBars(trendContainer, data);
}

function buildSummaryAnalytics(courses, courseAnalytics) {
    const showCoursePrefix = courses.length > 1;
    const assessments = courseAnalytics.flatMap(({ course, data }) => (
        (data.assessments || []).map((assessment) => ({
            ...assessment,
            trend_label: showCoursePrefix
                ? `${course.course_code || `Course ${course.course_id}`}: ${assessment.assessment_name}`
                : assessment.assessment_name
        }))
    ));

    const completedAssessments = getCompletedAssessments(assessments);
    const completedWeight = completedAssessments.reduce(
        (sum, assessment) => sum + (toNumberOrNull(assessment.weight) || 0),
        0
    );
    const totalWeight = assessments.reduce(
        (sum, assessment) => sum + (toNumberOrNull(assessment.weight) || 0),
        0
    );

    return {
        assessments,
        average: calculateAverage(assessments).toFixed(2),
        completed: completedAssessments.length,
        total: assessments.length,
        completed_weight: Number(completedWeight.toFixed(2)),
        total_weight: Number(totalWeight.toFixed(2))
    };
}

async function loadSummaryAnalytics(courses) {
    showSummaryMode();

    if (!courses.length) {
        renderSummaryEmptyState(true);
        setSummaryOverviewVisible(false);
        return;
    }

    renderSummaryEmptyState(false);
    renderSummaryCards(courses);

    const analyticsResults = await Promise.all(courses.map(async (course) => {
        try {
            const data = await fetchAnalytics(course.course_id);
            const average = Number(data.average || 0);
            const gpa = toGpa(average);

            updateRing(
                document.getElementById(`avg-ring-${course.course_id}`),
                average,
                `${average.toFixed(2)}%`
            );

            updateRing(
                document.getElementById(`gpa-ring-${course.course_id}`),
                ((gpa / 4.3) * 100).toFixed(0),
                gpa.toFixed(1)
            );

            const completion = document.getElementById(`comp-${course.course_id}`);
            if (completion) {
                completion.textContent = `Completed ${data.completed} / ${data.total}`;
            }

            return { course, data };
        } catch (error) {
            const completion = document.getElementById(`comp-${course.course_id}`);
            if (completion) {
                completion.textContent = error.message;
            }

            return null;
        }
    }));

    const successfulAnalytics = analyticsResults.filter(Boolean);

    if (!successfulAnalytics.length) {
        setSummaryOverviewVisible(false);
        return;
    }

    populateDetailView(buildSummaryAnalytics(courses, successfulAnalytics));
    setSummaryOverviewVisible(true);
}

async function loadCourseAnalytics(course) {
    showDetailMode(course);
    activeCourseId = Number(course.course_id);
    const data = await fetchAnalytics(activeCourseId);
    populateDetailView(data);
}

async function initializeAnalyticsPage() {
    clearAnalyticsError();

    try {
        enrolledCourses = await fetchEnrollments();
        const selectedCourse = getSelectedCourse(enrolledCourses);

        buildSidebar(enrolledCourses, selectedCourse ? selectedCourse.course_id : null);

        if (isDetailMode()) {
            if (!selectedCourse) {
                activeCourseId = null;
                await loadSummaryAnalytics(enrolledCourses);
                return;
            }

            await loadCourseAnalytics(selectedCourse);
            return;
        }

        await loadSummaryAnalytics(enrolledCourses);
    } catch (error) {
        enrolledCourses = [];
        buildSidebar([]);
        await loadSummaryAnalytics([]);
    }
}

function exportCSV() {
    if (!activeCourseId) return;
    window.location.href = `${GRADES_API}/${activeCourseId}/export/csv`;
}

function exportPDF() {
    if (!activeCourseId) return;
    window.location.href = `${GRADES_API}/${activeCourseId}/export/pdf`;
}

window.exportCSV = exportCSV;
window.exportPDF = exportPDF;
window.addEventListener('load', initializeAnalyticsPage);
