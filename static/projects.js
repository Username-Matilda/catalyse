let allProjects = [];
let allCircles = [];
let allRoles = [];
let allTensions = [];

// Load data
loadDropdowns();
loadProjects();

async function loadDropdowns() {
    try {
        // Load circles
        const circlesResponse = await fetch('/api/circles');
        if (circlesResponse.ok) {
            allCircles = await circlesResponse.json();
            populateSelect('circleFilter', allCircles, 'id', 'name');
        }
        
        // Load roles
        const rolesResponse = await fetch('/api/roles');
        if (rolesResponse.ok) {
            allRoles = await rolesResponse.json();
            populateSelect('projectRole', allRoles, 'id', (r) => `${r.name} (${r.circle_name})`);
        }
        
        // Load tensions
        const tensionsResponse = await fetch('/api/tensions?status=open');
        if (tensionsResponse.ok) {
            allTensions = await tensionsResponse.json();
            const select = document.getElementById('projectTension');
            allTensions.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                option.textContent = t.description.substring(0, 60) + '...';
                select.appendChild(option);
            });
        }
        
    } catch (error) {
        console.error('Failed to load dropdowns:', error);
    }
}

function populateSelect(selectId, items, valueField, textField) {
    const select = document.getElementById(selectId);
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item[valueField];
        option.textContent = typeof textField === 'function' ? textField(item) : item[textField];
        select.appendChild(option);
    });
}

async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('Failed to load projects');
        
        allProjects = await response.json();
        displayProjects(allProjects);
        
    } catch (error) {
        console.error('Failed to load projects:', error);
        document.getElementById('projectsGrid').innerHTML = 
            '<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Failed to load projects</p></div>';
    }
}

function filterProjects() {
    const circleId = document.getElementById('circleFilter').value;
    const status = document.getElementById('statusFilter').value;
    
    let filtered = allProjects;
    
    if (circleId) {
        filtered = filtered.filter(p => p.circle_id === parseInt(circleId));
    }
    
    if (status) {
        filtered = filtered.filter(p => p.status === status);
    }
    
    displayProjects(filtered);
}

function displayProjects(projects) {
    const grid = document.getElementById('projectsGrid');
    
    if (projects.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <p>No projects yet.</p>
                <p style="margin-top: 10px; color: #999;">Projects are multi-step outcomes tracked by roles.</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = projects.map(project => `
        <div class="project-card ${project.status}" onclick="viewProject(${project.id})">
            <div class="project-header">
                <div class="project-title">${project.title}</div>
                <div class="project-meta">
                    <span>🎭 ${project.role_name}</span>
                    <span>⭕ ${project.circle_name}</span>
                </div>
            </div>
            ${project.outcome ? `<div class="project-outcome">${project.outcome}</div>` : ''}
            <div class="project-footer">
                <span class="status-badge status-${project.status}">${formatStatus(project.status)}</span>
                ${project.jira_reference ? `<a href="#" class="jira-link" onclick="event.stopPropagation()">${project.jira_reference}${project.jira_status ? ` (${project.jira_status})` : ''}</a>` : ''}
            </div>
        </div>
    `).join('');
}

function formatStatus(status) {
    const statusMap = {
        'active': 'Active',
        'completed': 'Completed',
        'on_hold': 'On Hold',
        'cancelled': 'Cancelled'
    };
    return statusMap[status] || status;
}

function viewProject(projectId) {
    window.location.href = `project-detail.html?id=${projectId}`;
}

// Modal handling
function openCreateModal() {
    document.getElementById('createModal').classList.add('show');
}

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('show');
    document.getElementById('createProjectForm').reset();
}

// Form submission
document.getElementById('createProjectForm').addEventListener('submit', handleCreateProject);

async function handleCreateProject(event) {
    event.preventDefault();
    
    const projectData = {
        title: document.getElementById('projectTitle').value,
        outcome: document.getElementById('projectOutcome').value || null,
        role_id: parseInt(document.getElementById('projectRole').value),
        jira_reference: document.getElementById('projectJira').value || null,
        jira_status: document.getElementById('projectJiraStatus').value || null,
        created_from_tension_id: document.getElementById('projectTension').value ? 
                                 parseInt(document.getElementById('projectTension').value) : null
    };
    
    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(projectData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create project');
        }
        
        showMessage('Project created!', 'success', 'modalMessage');
        
        setTimeout(() => {
            closeCreateModal();
            loadProjects();
        }, 1000);
        
    } catch (error) {
        console.error('Failed to create project:', error);
        showMessage(`Error: ${error.message}`, 'error', 'modalMessage');
    }
}

function showMessage(text, type, elementId) {
    const messageDiv = document.getElementById(elementId);
    messageDiv.textContent = text;
    messageDiv.className = `message ${type} show`;
    
    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 5000);
}