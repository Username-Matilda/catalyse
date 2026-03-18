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
                <a href="/" class="logo"><img src="/static/images/pauseai-logo.png" alt="PauseAI"> Catalyse</a>
                <nav>
                    <a href="/" class="${activePage === 'projects' ? 'active' : ''}">Projects</a>
                    <a href="/static/volunteers.html" class="${activePage === 'volunteers' ? 'active' : ''}">Volunteers</a>
                    <a href="/static/suggest.html" class="${activePage === 'suggest' ? 'active' : ''}">Suggest Project</a>
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
            ${isAdmin ? '<a href="/static/admin/triage.html" class="btn btn-ghost">Admin</a>' : ''}
            <a href="/static/dashboard.html" class="btn btn-ghost">Dashboard</a>
            <div class="user-menu">
                <button class="user-button" onclick="toggleUserMenu()">
                    ${escapeHtml(user.name)}
                </button>
                <div class="user-dropdown" id="userDropdown">
                    <a href="/static/profile.html">My Profile</a>
                    <a href="/static/dashboard.html">Dashboard</a>
                    <a href="/static/privacy.html">Privacy & Data</a>
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
    window.location.href = '/';
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
