// Catalyse - Shared JavaScript Utilities

// API helpers
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
    };

    const response = await fetch(endpoint, {
        ...options,
        headers
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || 'Request failed');
    }

    return response.json();
}

// Utility functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncate(text, length) {
    if (!text) return '';
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function formatDateTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatStatus(status) {
    const labels = {
        'seeking_owner': 'Seeking Owner',
        'seeking_help': 'Seeking Help',
        'in_progress': 'In Progress',
        'on_hold': 'On Hold',
        'completed': 'Completed',
        'pending_review': 'Pending Review',
        'needs_discussion': 'Needs Discussion',
        'archived': 'Archived'
    };
    return labels[status] || status;
}

function formatInterestType(type) {
    const labels = {
        'want_to_contribute': 'Wants to contribute',
        'want_to_own': 'Wants to own'
    };
    return labels[type] || type;
}

function formatUrgency(urgency) {
    return urgency.charAt(0).toUpperCase() + urgency.slice(1);
}

// Message display
function showMessage(text, type, containerId = 'messageDiv') {
    const div = document.getElementById(containerId);
    if (!div) return;
    div.textContent = text;
    div.className = `message ${type}`;
    div.style.display = 'flex';
    setTimeout(() => div.style.display = 'none', 5000);
}

// Skills rendering
async function loadSkills() {
    return apiRequest('/api/skills');
}

function renderSkillSelector(containerId, selectedIds = [], onChangeCallback = null) {
    const container = document.getElementById(containerId);

    loadSkills().then(categories => {
        if (!categories || categories.length === 0) {
            container.innerHTML = '<p style="color: var(--text-light);">No skills available yet.</p>';
            return;
        }

        container.innerHTML = categories.map(cat => `
            <div class="skill-category">
                <div class="skill-category-title">${escapeHtml(cat.name)}</div>
                <div class="skill-options">
                    ${cat.skills.map(skill => `
                        <label class="skill-option ${selectedIds.includes(skill.id) ? 'selected' : ''}"
                               data-skill-id="${skill.id}">
                            <input type="checkbox" name="skills" value="${skill.id}"
                                   ${selectedIds.includes(skill.id) ? 'checked' : ''}>
                            ${escapeHtml(skill.name)}
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.skill-option').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const checkbox = el.querySelector('input');
                checkbox.checked = !checkbox.checked;
                el.classList.toggle('selected', checkbox.checked);
                if (onChangeCallback) onChangeCallback(getSelectedSkills(containerId));
            });
        });
    }).catch(err => {
        console.error('Failed to load skills:', err);
        container.innerHTML = '<p style="color: var(--error);">Failed to load skills. Please refresh.</p>';
    });
}

function getSelectedSkills(containerId) {
    const container = document.getElementById(containerId);
    const checkboxes = container.querySelectorAll('input[name="skills"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

// Auth state
async function getCurrentUser() {
    const token = localStorage.getItem('authToken');
    if (!token) return null;

    try {
        return await apiRequest('/api/auth/me');
    } catch (e) {
        localStorage.removeItem('authToken');
        return null;
    }
}

function requireAuth() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/static/login.html?redirect=' + encodeURIComponent(window.location.pathname);
        return false;
    }
    return true;
}

// Navigation helpers
function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

// Common header rendering
function renderHeader(activePage = '') {
    return `
        <header>
            <div class="container">
                <a href="/" class="logo">Catalyse <img src="/static/images/pauseai-logo.png" alt="PauseAI"></a>
                <nav>
                    <a href="/" class="${activePage === 'projects' ? 'active' : ''}">Projects</a>
                    <a href="/static/volunteers.html" class="${activePage === 'volunteers' ? 'active' : ''}">Volunteers</a>
                    <a href="/static/suggest.html" class="${activePage === 'suggest' ? 'active' : ''}">Suggest Project</a>
                    <a href="/static/starter-tasks.html" class="${activePage === 'starter-tasks' ? 'active' : ''}">Starter Tasks</a>
                </nav>
                <div class="nav-auth" id="authNav"></div>
            </div>
        </header>
    `;
}

async function initAuthNav() {
    const user = await getCurrentUser();
    const nav = document.getElementById('authNav');

    if (user) {
        const isAdmin = user.is_admin;
        nav.innerHTML = `
            <a href="/static/dashboard.html" class="btn btn-ghost">Dashboard</a>
            <div class="user-menu">
                <button class="user-button" onclick="toggleUserMenu()">
                    ${escapeHtml(user.name)}
                </button>
                <div class="user-dropdown" id="userDropdown">
                    <a href="/static/profile.html">My Profile</a>
                    <a href="/static/dashboard.html">Dashboard</a>
                    <a href="/static/settings.html">Account Settings</a>
                    <a href="/static/privacy.html">Privacy & Data</a>
                    ${isAdmin ? `
                        <hr style="margin: 6px 0; border: none; border-top: 1px solid var(--border);">
                        <a href="/static/admin/triage.html">Triage Queue</a>
                        <a href="/static/admin/create-project.html">Create Org Project</a>
                        <a href="/static/admin/starter-tasks.html">Manage Starter Tasks</a>
                        <a href="/static/admin/skills.html">Manage Skills</a>
                        <a href="/static/admin/bugs.html">Bug Reports</a>
                        <a href="/static/admin/team.html">Admin Team</a>
                        <a href="/static/admin/stats.html">Platform Stats</a>
                    ` : ''}
                    <hr style="margin: 6px 0; border: none; border-top: 1px solid var(--border);">
                    <a href="#" onclick="logout(); return false;">Logout</a>
                </div>
            </div>
        `;
    } else {
        nav.innerHTML = `
            <a href="/static/login.html" class="btn btn-outline">Login</a>
            <a href="/static/signup.html" class="btn btn-primary">Sign Up</a>
        `;
    }

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.user-menu')) {
            document.getElementById('userDropdown')?.classList.remove('show');
        }
    });

    return user;
}

function toggleUserMenu() {
    document.getElementById('userDropdown')?.classList.toggle('show');
}

async function logout() {
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            // Ignore errors
        }
    }
    localStorage.removeItem('authToken');
    window.location.href = '/static/login.html';
}

// Modal helpers
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Form validation
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRequired(value) {
    return value && value.trim().length > 0;
}

// ============================================
// BUG REPORT FLOATING BUTTON
// ============================================

function initBugReportButton() {
    // Don't add to admin pages (they have their own bug list)
    if (window.location.pathname.includes('/admin/bugs.html')) return;

    // Create floating button
    const fab = document.createElement('div');
    fab.className = 'bug-report-fab';
    fab.innerHTML = `
        <button onclick="openBugReportModal()" title="Report a bug or give feedback">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4"></path>
                <path d="M12 8h.01"></path>
            </svg>
        </button>
    `;
    document.body.appendChild(fab);

    // Create modal
    const modal = document.createElement('div');
    modal.id = 'bugReportModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h2>Report an Issue</h2>
                <button class="modal-close" onclick="closeModal('bugReportModal')">&times;</button>
            </div>
            <div class="modal-body">
                <form id="bugReportForm">
                    <div class="form-group">
                        <label>What type of feedback?</label>
                        <div class="category-options">
                            <label>
                                <input type="radio" name="category" value="bug" checked>
                                <span class="category-btn">Bug</span>
                            </label>
                            <label>
                                <input type="radio" name="category" value="feature">
                                <span class="category-btn">Feature</span>
                            </label>
                            <label>
                                <input type="radio" name="category" value="ux">
                                <span class="category-btn">UX Issue</span>
                            </label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="bugTitle" class="required">Title</label>
                        <input type="text" id="bugTitle" name="title" required placeholder="Brief description">
                    </div>

                    <div class="form-group">
                        <label for="bugDescription" class="required">Details</label>
                        <textarea id="bugDescription" name="description" required
                                  placeholder="What happened? What did you expect to happen?"
                                  style="min-height: 120px;"></textarea>
                    </div>

                    <div class="form-group" id="bugEmailGroup" style="display: none;">
                        <label for="bugEmail">Your Email (optional)</label>
                        <input type="email" id="bugEmail" name="email" placeholder="In case we need to follow up">
                    </div>

                    <div class="form-group">
                        <label>How urgent is this?</label>
                        <select id="bugSeverity" name="severity">
                            <option value="low">Low - Minor issue</option>
                            <option value="medium" selected>Medium - Annoying but workable</option>
                            <option value="high">High - Blocking my work</option>
                            <option value="critical">Critical - Site is broken</option>
                        </select>
                    </div>

                    <button type="submit" class="btn btn-primary">Submit Report</button>
                </form>

                <div id="bugReportSuccess" style="display: none; text-align: center; padding: 20px;">
                    <h3 style="color: var(--success);">Thank you!</h3>
                    <p style="margin: 12px 0;">Your feedback has been submitted.</p>
                    <button class="btn btn-outline" onclick="closeModal('bugReportModal')">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Setup form submission
    document.getElementById('bugReportForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Submitting...';

        try {
            const data = {
                title: form.title.value.trim(),
                description: form.description.value.trim(),
                category: form.querySelector('input[name="category"]:checked').value,
                severity: form.severity.value,
                page_url: window.location.href
            };

            // Include email if provided (for non-logged-in users)
            if (form.email && form.email.value.trim()) {
                data.reporter_email = form.email.value.trim();
            }

            await apiRequest('/api/bug-reports', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            form.style.display = 'none';
            document.getElementById('bugReportSuccess').style.display = 'block';

        } catch (error) {
            alert('Failed to submit: ' + error.message);
        }

        btn.disabled = false;
        btn.textContent = 'Submit Report';
    });

    // Close modal on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal('bugReportModal');
        }
    });
}

function openBugReportModal() {
    // Reset form
    const form = document.getElementById('bugReportForm');
    form.reset();
    form.style.display = 'block';
    document.getElementById('bugReportSuccess').style.display = 'none';

    // Show email field if not logged in
    const token = localStorage.getItem('authToken');
    document.getElementById('bugEmailGroup').style.display = token ? 'none' : 'block';

    openModal('bugReportModal');
}

// Auto-initialize bug report button on all pages
document.addEventListener('DOMContentLoaded', initBugReportButton);
