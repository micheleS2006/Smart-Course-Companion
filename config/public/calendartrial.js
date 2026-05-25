const DASHBOARD_API = "/api/student/dashboard";
const DASHBOARD_PROGRESS_API = "/api/student/dashboard/templates";
let assignmentsData = [];

const calendar = document.getElementById("calendar");
const weekBtn = document.getElementById("weekBtn");
const monthBtn = document.getElementById("monthBtn");
const monthSelect = document.getElementById("monthSelect");
const yearSelect = document.getElementById("yearSelect");
const monthControls = document.getElementById("monthControls");
const upcomingDeadlinesList = document.getElementById("upcomingDeadlinesList");
const recentAssessmentsList = document.getElementById("recentAssessmentsList");

const today = new Date();
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;

    const normalizedValue = typeof value === "string"
        ? value.replace(" ", "T")
        : value;
    const parsedDate = new Date(normalizedValue);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatWeight(weight) {
    if (weight === null || weight === undefined || weight === "") {
        return "Ponderation N/A";
    }

    const numericWeight = Number(weight);
    const displayWeight = Number.isNaN(numericWeight)
        ? weight
        : numericWeight;

    return `Ponderation ${displayWeight}%`;
}

function formatShortDate(date) {
    return date.toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric"
    });
}

function formatCalendarDateLabel(date) {
    return `${SHORT_MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function loadAssignments() {
    try {
        const response = await fetch(DASHBOARD_API);
        const contentType = String(response.headers.get("content-type") || "");

        if (!response.ok || !contentType.includes("application/json")) {
            assignmentsData = [];
            return;
        }

        const dashboardData = await response.json().catch(() => []);
        if (!Array.isArray(dashboardData)) {
            assignmentsData = [];
            return;
        }

        assignmentsData = dashboardData
            .map((item) => {
                const dueDate = parseDate(item.due_date);
                if (!dueDate) return null;

                return {
                    templateId: item.template_id || item.id,
                    title: item.assessment_name || "Untitled assessment",
                    courseName: item.course_name || "Unknown course",
                    weightLabel: formatWeight(item.weight),
                    date: dueDate,
                    createdAt: parseDate(item.assessment_created_at || item.created_at || item.due_date),
                    done: item.status === "completed"
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.date - b.date);
    } catch {
        assignmentsData = [];
    }
}

async function updateAssignmentProgress(templateId, status) {
    const response = await fetch(`${DASHBOARD_PROGRESS_API}/${templateId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || "Could not update assessment progress");
    }
}

function renderAssessmentList(listElement, items, emptyMessage, datePrefix = "") {
    if (!listElement) return;

    if (items.length === 0) {
        listElement.innerHTML = `
            <li class="deadline-empty">${escapeHtml(emptyMessage)}</li>
        `;
        return;
    }

    listElement.innerHTML = items.map((item) => {
        const dateLabel = item.displayDate
            ? `${datePrefix}${formatShortDate(item.displayDate)}`
            : datePrefix.trim() || "No date";

        return `
            <li class="deadline-item">
                <div class="deadline-top-row">
                    <span class="deadline-course">${escapeHtml(item.courseName)}</span>
                    <span class="deadline-date">${escapeHtml(dateLabel)}</span>
                </div>
                <div class="deadline-title">${escapeHtml(item.title)}</div>
                <div class="deadline-bottom-row">
                    <span class="deadline-pill">${escapeHtml(item.weightLabel)}</span>
                </div>
            </li>
        `;
    }).join("");
}

function renderUpcomingDeadlines() {
    const upcomingItems = assignmentsData
        .slice(0, 3)
        .map((item) => ({ ...item, displayDate: item.date }));

    renderAssessmentList(
        upcomingDeadlinesList,
        upcomingItems,
        "No assessments to show.",
        "Due "
    );
}

function renderRecentAssessments() {
    const recentItems = [...assignmentsData]
        .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
        .slice(0, 3)
        .map((item) => ({ ...item, displayDate: item.createdAt }));

    renderAssessmentList(
        recentAssessmentsList,
        recentItems,
        "No assessments to show.",
        "Added "
    );
}

function createWeekdayHeader(label) {
    const header = document.createElement("div");
    header.className = "calendar-column-header";
    header.textContent = label;
    return header;
}

function renderWeek() {
    calendar.innerHTML = "";
    calendar.className = "calendar-container week-table";

    WEEKDAY_LABELS.forEach((label) => {
        calendar.appendChild(createWeekdayHeader(label));
    });

    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay());

    for (let i = 0; i < 7; i++) {
        const day = new Date(start);
        day.setDate(start.getDate() + i);
        calendar.appendChild(createDayCard(day));
    }
}

function renderMonth(month, year) {
    calendar.innerHTML = "";
    calendar.className = "calendar month-table";

    WEEKDAY_LABELS.forEach((label) => {
        calendar.appendChild(createWeekdayHeader(label));
    });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    for (let i = 0; i < firstDay.getDay(); i++) {
        const empty = document.createElement("div");
        empty.className = "day-card empty-day";
        calendar.appendChild(empty);
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new Date(year, month, d);
        calendar.appendChild(createDayCard(date));
    }
}

function createDayCard(date) {
    const card = document.createElement("div");
    card.classList.add("day-card");

    const currentDay = new Date();
    if (
        date.getDate() === currentDay.getDate() &&
        date.getMonth() === currentDay.getMonth() &&
        date.getFullYear() === currentDay.getFullYear()
    ) {
        card.classList.add("today");
    }

    const dayLabel = document.createElement("div");
    dayLabel.className = "calendar-date-label";
    dayLabel.textContent = formatCalendarDateLabel(date);
    card.appendChild(dayLabel);

    assignmentsData.forEach((assignmentData) => {
        if (
            assignmentData.date.getDate() === date.getDate() &&
            assignmentData.date.getMonth() === date.getMonth() &&
            assignmentData.date.getFullYear() === date.getFullYear()
        ) {
            const assignment = document.createElement("div");
            assignment.className = "assignment";
            if (assignmentData.done) assignment.classList.add("done");
            assignment.innerHTML = `
                <div class="assignment-content">
                    <span class="assignment-title">${escapeHtml(assignmentData.title)}</span>
                    <span class="assignment-course">${escapeHtml(assignmentData.courseName)}</span>
                    <span class="assignment-weight">${escapeHtml(assignmentData.weightLabel)}</span>
                </div>
                <button class="done-btn" type="button">${assignmentData.done ? "Undo" : "Submitted"}</button>
            `;

            assignment.querySelector(".done-btn").onclick = async (event) => {
                event.stopPropagation();
                const button = event.currentTarget;
                const nextStatus = assignmentData.done ? "pending" : "completed";

                button.disabled = true;

                try {
                    await updateAssignmentProgress(assignmentData.templateId, nextStatus);
                    assignmentData.done = nextStatus === "completed";
                    renderUpcomingDeadlines();
                    renderRecentAssessments();

                    if (monthBtn.classList.contains("active")) {
                        renderMonth(parseInt(monthSelect.value, 10), parseInt(yearSelect.value, 10));
                    } else {
                        renderWeek();
                    }
                } catch (error) {
                    console.error(error);
                    window.alert(error.message || "Could not update assessment progress.");
                    button.disabled = false;
                }
            };

            card.appendChild(assignment);
        }
    });

    return card;
}

const months = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
months.forEach((monthName, index) => {
    const option = document.createElement("option");
    option.value = index;
    option.textContent = monthName;
    monthSelect.appendChild(option);
});

for (let y = 2020; y <= 2035; y++) {
    const option = document.createElement("option");
    option.value = y;
    option.textContent = y;
    yearSelect.appendChild(option);
}

monthSelect.value = today.getMonth();
yearSelect.value = today.getFullYear();

weekBtn.addEventListener("click", () => {
    weekBtn.classList.add("active");
    monthBtn.classList.remove("active");
    monthControls.style.display = "none";
    renderWeek();
});

monthBtn.addEventListener("click", () => {
    monthBtn.classList.add("active");
    weekBtn.classList.remove("active");
    monthControls.style.display = "block";
    renderMonth(parseInt(monthSelect.value, 10), parseInt(yearSelect.value, 10));
});

monthSelect.addEventListener("change", () => {
    renderMonth(parseInt(monthSelect.value, 10), parseInt(yearSelect.value, 10));
});

yearSelect.addEventListener("change", () => {
    renderMonth(parseInt(monthSelect.value, 10), parseInt(yearSelect.value, 10));
});

async function initializeCalendar() {
    await loadAssignments();
    renderUpcomingDeadlines();
    renderRecentAssessments();
    renderWeek();
    monthControls.style.display = "none";
    weekBtn.classList.add("active");
}

initializeCalendar();
