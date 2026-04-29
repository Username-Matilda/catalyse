// Catalyse - Shared JavaScript Utilities

// Apply dark mode immediately to prevent flash
(function() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();

// Country options for PauseAI Global
const COUNTRIES = [
    "Remote",
    "Australia", "Austria", "Belgium", "Brazil", "Canada",
    "Czech Republic", "Denmark", "Finland", "France", "Germany",
    "India", "Ireland", "Italy", "Japan", "Mexico",
    "Netherlands", "New Zealand", "Norway", "Poland", "Portugal",
    "Singapore", "South Korea", "Spain", "Sweden", "Switzerland",
    "UK", "US", "Other"
];

function renderCountrySelect(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">Any country</option>' +
        COUNTRIES.map(c => `<option value="${c}" ${c === selectedValue ? 'selected' : ''}>${c}</option>`).join('');
}

// Local group options keyed by country — add new countries here to expand
const LOCAL_GROUPS = {
    "UK": ["Oxfordshire", "London", "Scotland", "West of England", "Leicester", "Manchester"]
};

// Show/populate the local group select for the given country, or hide it if no groups exist.
function renderLocalGroupSelect(selectId, country = '', selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;
    const groups = LOCAL_GROUPS[country] || [];
    const container = select.closest('.form-group');
    if (groups.length === 0) {
        if (container) container.style.display = 'none';
        select.value = '';
        return;
    }
    if (container) container.style.display = '';
    select.innerHTML = '<option value="">Any local group</option>' +
        groups.map(g => `<option value="${g}" ${g === selectedValue ? 'selected' : ''}>${g}</option>`).join('');
}

// Combined country + local group filter dropdown for listing pages.
// Returns { getValue(), setValue() } for external state management.
function createLocationFilter(containerId, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    // Build flat list of items: countries with their sub-items interleaved
    const items = [{ label: 'All locations', country: '', group: '' }];
    COUNTRIES.forEach(country => {
        items.push({ label: country, country, group: '' });
        (LOCAL_GROUPS[country] || []).forEach(group => {
            items.push({ label: group, country, group, isSubItem: true });
        });
    });

    container.innerHTML = `
        <button type="button" class="location-filter-btn">All locations</button>
        <div class="location-filter-panel">
            ${items.map(item => `
                <div class="location-filter-item${item.isSubItem ? ' is-subitem' : ''}"
                     data-country="${item.country}"
                     data-group="${item.group}">
                    ${item.isSubItem ? '<span class="subitem-arrow">↳</span>' : ''}${escapeHtml(item.label)}
                </div>
            `).join('')}
        </div>
    `;

    const btn = container.querySelector('.location-filter-btn');
    const panel = container.querySelector('.location-filter-panel');

    function getLabel(country, group) {
        if (!country && !group) return 'All locations';
        if (group) return `${country} - ${group}`;
        return country;
    }

    function select(country, group) {
        panel.querySelectorAll('.location-filter-item').forEach(el => {
            el.classList.toggle('selected',
                el.dataset.country === country && el.dataset.group === group);
        });
        btn.textContent = getLabel(country, group);
    }

    btn.addEventListener('click', e => {
        e.stopPropagation();
        document.querySelectorAll('.location-filter-panel.open').forEach(p => { if (p !== panel) p.classList.remove('open'); });
        panel.classList.toggle('open');
    });

    panel.addEventListener('click', e => {
        const item = e.target.closest('.location-filter-item');
        if (!item) return;
        select(item.dataset.country, item.dataset.group);
        panel.classList.remove('open');
        onChange();
    });

    // Initialise with "All locations" selected
    select('', '');

    return {
        getValue() {
            const sel = panel.querySelector('.location-filter-item.selected');
            if (!sel) return { country: '', localGroup: '' };
            return { country: sel.dataset.country, localGroup: sel.dataset.group };
        },
        setValue(country, group) {
            select(country, group || '');
        }
    };
}

// Close all open filter panels when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.location-filter-panel.open').forEach(p => p.classList.remove('open'));
});

// Generic single-select custom dropdown for filter bars. Returns { getValue(), setValue(), setOptions() }.
function createSelectFilter(containerId, options, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    function markSelected(value) {
        const btn = container.querySelector('.location-filter-btn');
        const items = container.querySelectorAll('.location-filter-item');
        let found = null;
        items.forEach(el => {
            const match = el.dataset.value === String(value ?? '');
            el.classList.toggle('selected', match);
            if (match) found = el;
        });
        if (!found && items.length > 0) { items[0].classList.add('selected'); found = items[0]; }
        if (btn && found) btn.textContent = found.textContent.trim();
    }

    function build(opts) {
        container.innerHTML = `
            <button type="button" class="location-filter-btn">${escapeHtml(opts[0]?.label || '')}</button>
            <div class="location-filter-panel">
                ${opts.map(opt => `<div class="location-filter-item" data-value="${opt.value}">${escapeHtml(opt.label)}</div>`).join('')}
            </div>
        `;
        container.querySelector('.location-filter-btn').addEventListener('click', e => {
            e.stopPropagation();
            const p = container.querySelector('.location-filter-panel');
            document.querySelectorAll('.location-filter-panel.open').forEach(op => { if (op !== p) op.classList.remove('open'); });
            p.classList.toggle('open');
        });
        container.querySelector('.location-filter-panel').addEventListener('click', e => {
            const item = e.target.closest('.location-filter-item');
            if (!item) return;
            markSelected(item.dataset.value);
            container.querySelector('.location-filter-panel').classList.remove('open');
            onChange();
        });
        markSelected(opts[0]?.value ?? '');
    }

    build(options);

    return {
        getValue() {
            const sel = container.querySelector('.location-filter-item.selected');
            return sel ? sel.dataset.value : '';
        },
        setValue(value) { markSelected(String(value ?? '')); },
        setOptions(opts) {
            const current = this.getValue();
            build(opts);
            markSelected(current);
        }
    };
}

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
        const isFieldErrors = Array.isArray(error.detail);
        const message = isFieldErrors
            ? error.detail.map(e => e.msg).join(', ')
            : (error.detail || 'Request failed');
        const err = new Error(message);
        if (isFieldErrors) err.fieldErrors = error.detail;
        throw err;
    }

    return response.json().catch(() => ({}));
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
        'needs_tasks': 'Needs Tasks',
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

// Field-level validation error display
function clearFieldErrors(container = document) {
    container.querySelectorAll('.field-error-msg').forEach(el => el.remove());
    container.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
}

function showFieldErrors(fieldErrors, container = document, fieldMap = {}) {
    if (!fieldErrors || !fieldErrors.length) return;
    let firstInput = null;
    for (const err of fieldErrors) {
        const fieldName = err.loc && err.loc[err.loc.length - 1];
        if (!fieldName) continue;
        const elId = fieldMap[fieldName] || fieldName;
        const input = container.querySelector(`#${elId}, [name="${elId}"]`);
        if (!input) continue;
        input.classList.add('input-error');
        const msg = document.createElement('p');
        msg.className = 'field-error-msg';
        msg.textContent = err.msg;
        const group = input.closest('.form-group');
        if (group) group.appendChild(msg);
        else input.after(msg);
        if (!firstInput) firstInput = input;
    }
    if (firstInput) firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Toast notifications (bottom-right desktop, bottom-centre mobile)
function showToast(text, type = 'error', duration = 5000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = text;
    container.appendChild(toast);

    // Animate out then remove
    setTimeout(() => {
        toast.classList.add('toast-hiding');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
}

// Message display — errors also appear as toasts
function showMessage(text, type, containerId = 'messageDiv') {
    if (type === 'error') showToast(text, 'error');
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

        // Add click handlers — use change event on checkbox for reliable cross-browser behavior
        container.querySelectorAll('.skill-option input').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                checkbox.closest('.skill-option').classList.toggle('selected', checkbox.checked);
                if (onChangeCallback) onChangeCallback(getSelectedSkills(containerId));
            });
        });
        // Also allow clicking the label area (not just the hidden checkbox)
        container.querySelectorAll('.skill-option').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return; // let native checkbox handle it
                e.preventDefault();
                const checkbox = el.querySelector('input');
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            });
        });
    }).catch(err => {
        console.error('Failed to load skills:', err);
        container.innerHTML = `
            <p style="color: var(--error); margin-bottom: 8px;">Failed to load skills.</p>
            <button class="btn btn-small btn-outline" onclick="renderSkillSelector('${containerId}', ${JSON.stringify(selectedIds)})">Try Again</button>
        `;
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
        const isAdminPage = window.location.pathname.includes('/admin/');
        nav.innerHTML = `
            <a href="/static/dashboard.html" class="btn btn-ghost">My Projects</a>
            <div class="user-menu">
                <button class="user-button" onclick="toggleUserMenu()" aria-label="Account menu">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                </button>
                <div class="user-dropdown" id="userDropdown">
                    <a href="/static/profile.html">My Profile</a>
                    <a href="/static/settings.html">Account Settings</a>
                    <a href="/static/privacy.html">Privacy & Data</a>
                    ${isAdmin && !isAdminPage ? `
                        <div class="dropdown-section dropdown-section--admin">Admin</div>
                        <a href="/static/admin/triage.html">Triage Queue</a>
                        <a href="/static/admin/create-project.html">Create Org Project</a>
                        <a href="/static/admin/starter-tasks.html">Manage Starter Tasks</a>
                        <a href="/static/admin/skills.html">Manage Skills</a>
                        <a href="/static/admin/bugs.html">Bug Reports</a>
                        <a href="/static/admin/team.html">Admin Team</a>
                        <a href="/static/admin/stats.html">Platform Stats</a>
                    ` : ''}
                    <div class="dropdown-section">Session</div>
                    <a href="#" onclick="logout(); return false;">Sign Out</a>
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

    initMobileMenu(user);

    return user;
}

function toggleUserMenu() {
    document.getElementById('userDropdown')?.classList.toggle('show');
}

function initMobileMenu(user) {
    const header = document.querySelector('header .container');
    if (!header || document.getElementById('mobileMenuBtn')) return;

    const isAdminPage = window.location.pathname.includes('/admin/');

    // Hamburger button
    const btn = document.createElement('button');
    btn.className = 'mobile-menu-btn';
    btn.id = 'mobileMenuBtn';
    btn.setAttribute('aria-label', 'Open menu');
    btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
    header.appendChild(btn);

    // Collect nav links from the current page's <nav>
    const navLinks = Array.from(document.querySelectorAll('header nav a'));
    const navHTML = navLinks.map(link => {
        const active = link.classList.contains('active') ? ' class="active"' : '';
        return `<a href="${link.getAttribute('href')}"${active}>${link.textContent.trim()}</a>`;
    }).join('');

    // Auth section
    let authHTML = '';
    if (user) {
        authHTML = `
            <div class="mobile-nav-section">Account</div>
            <a href="/static/dashboard.html">My Projects</a>
            <a href="/static/profile.html">My Profile</a>
            <a href="/static/settings.html">Account Settings</a>
            <a href="/static/privacy.html">Privacy &amp; Data</a>
        `;
        if (user.is_admin && !isAdminPage) {
            authHTML += `
                <div class="mobile-nav-section mobile-nav-section--admin">Admin</div>
                <a href="/static/admin/triage.html">Triage Queue</a>
                <a href="/static/admin/create-project.html">Create Org Project</a>
                <a href="/static/admin/starter-tasks.html">Manage Starter Tasks</a>
                <a href="/static/admin/skills.html">Manage Skills</a>
                <a href="/static/admin/bugs.html">Bug Reports</a>
                <a href="/static/admin/team.html">Admin Team</a>
                <a href="/static/admin/stats.html">Platform Stats</a>
            `;
        }
        authHTML += `
            <div class="mobile-nav-section">Session</div>
            <a href="#" onclick="logout(); return false;">Sign Out</a>
        `;
    } else {
        authHTML = `
            <div class="mobile-nav-section">Account</div>
            <a href="/static/login.html">Login</a>
            <a href="/static/signup.html">Sign Up</a>
        `;
    }

    // Clone logo from header
    const logoEl = header.querySelector('.logo');
    const logoHTML = logoEl ? logoEl.outerHTML : `<a href="/" class="logo">Catalyse</a>`;

    const panel = document.createElement('div');
    panel.className = 'mobile-nav-panel';
    panel.id = 'mobileNavPanel';
    panel.innerHTML = `
        <div class="mobile-nav-header">
            ${logoHTML}
            <button class="mobile-nav-close" id="mobileMenuClose" aria-label="Close menu">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>
        <div class="mobile-nav-links">
            ${navHTML}
            ${authHTML}
        </div>
    `;
    document.body.appendChild(panel);

    btn.addEventListener('click', () => {
        panel.classList.add('open');
        document.body.style.overflow = 'hidden';
    });

    document.getElementById('mobileMenuClose').addEventListener('click', () => {
        panel.classList.remove('open');
        document.body.style.overflow = '';
    });
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
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'flex';
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
}

// Form validation
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRequired(value) {
    return value && value.trim().length > 0;
}

// ============================================
// DARK MODE
// ============================================

function initDarkMode() {
    // Restore preference
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Create toggle button
    const toggle = document.createElement('button');
    toggle.className = 'theme-toggle';
    toggle.title = 'Toggle dark mode';
    toggle.innerHTML = document.documentElement.getAttribute('data-theme') === 'dark' ? '&#9788;' : '&#9789;';
    toggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            toggle.innerHTML = '&#9789;';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            toggle.innerHTML = '&#9788;';
        }
    });
    document.body.appendChild(toggle);
}

document.addEventListener('DOMContentLoaded', initDarkMode);


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
            showToast(error.message, 'error');
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


// ============================================
// GOOGLE ANALYTICS + COOKIE CONSENT
// ============================================

const GA_ID = 'G-5V7B3WCJ42';

function loadGoogleAnalytics() {
    if (document.getElementById('ga-script')) return; // already loaded

    const script = document.createElement('script');
    script.id = 'ga-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
}

function initCookieConsent() {
    // Don't show on login/signup pages (clutters the auth flow)
    if (window.location.pathname.includes('login.html') ||
        window.location.pathname.includes('signup.html')) return;

    const consent = localStorage.getItem('cookie_consent');

    if (consent === 'accepted') {
        loadGoogleAnalytics();
        return;
    }

    if (consent === 'declined') {
        return; // respect their choice
    }

    // Show consent banner
    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.innerHTML = `
        <div class="cookie-banner-content">
            <p>Accepting cookies helps us understand how volunteers use this platform so we can make it better. That's the only reason we use analytics.
               <a href="/static/privacy.html" style="color: inherit; text-decoration: underline;">Privacy policy</a></p>
            <div class="cookie-banner-actions">
                <button class="btn btn-small btn-primary" onclick="acceptCookies()">Accept</button>
                <button class="btn btn-small btn-outline" onclick="declineCookies()">Decline</button>
            </div>
        </div>
    `;
    document.body.appendChild(banner);
}

function acceptCookies() {
    localStorage.setItem('cookie_consent', 'accepted');
    document.querySelector('.cookie-banner')?.remove();
    loadGoogleAnalytics();
}

function declineCookies() {
    localStorage.setItem('cookie_consent', 'declined');
    document.querySelector('.cookie-banner')?.remove();
}

document.addEventListener('DOMContentLoaded', initCookieConsent);
