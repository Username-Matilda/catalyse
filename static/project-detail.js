const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

if (!projectId) {
    document.body.innerHTML = '<div class="container"><p>No project ID provided</p></div>';
} else {
    loadProjectDetails();
}

async function loadProjectDetails() {
    try {
        const response = await fetch(`/api/projects/${projectId}`);
        if (!response.ok) throw new Error('Project not found');
        
        const project = await response.json();
        displayProject(project);
        
    } catch (error) {
        console.error('Failed to load project:', error);
        document.body.innerHTML = '<div class="container"><p>Failed to load project details</p></div>';
    }
}

function displayProject(project) {
    document.getElementById('projectTitle').textContent = project.title;
    
    const metaHtml = [
        `<span>🎭 ${project.role_name}</span>`,
        `<span>⭕ ${project.circle_name}</span>`,
        `<span class="status-badge status-${project.status}">${formatStatus(project.status)}</span>`,
        project.jira_reference ? `<span>📋 ${project.jira_reference}${project.jira_status ? ` (Jira: ${project.jira_status})` : ''}</span>` : ''
    ].filter(Boolean).join('');
    
    document.getElementById('projectMeta').innerHTML = metaHtml;
    
    if (project.outcome) {
        document.getElementById('projectOutcome').style.display = 'block';
        document.getElementById('projectOutcome').textContent = project.outcome;
    }
    
    displayUpdates(project.updates);
}

function displayUpdates(updates) {
    const container = document.getElementById('updatesList');
    
    if (!updates || updates.length === 0) {
        container.innerHTML = '<div class="empty-state">No updates yet</div>';
        return;
    }
    
    container.innerHTML = updates.map(update => `
        <div class="update-card">
            <div class="update-meta">
                ${formatDate(update.created_at)}
                ${update.author_name ? ` • ${update.author_name}` : ''}
            </div>
            <div class="update-text">${update.update_text}</div>
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

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleDateString('en-US', options);
}

// Form submission
document.getElementById('updateForm').addEventListener('submit', handleAddUpdate);

async function handleAddUpdate(event) {
    event.preventDefault();
    
    const updateData = {
        update_text: document.getElementById('updateText').value
    };
    
    try {
        const response = await fetch(`/api/projects/${projectId}/updates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to add update');
        }
        
        showMessage('Update added!', 'success');
        document.getElementById('updateForm').reset();
        
        // Reload project to show new update
        setTimeout(() => {
            loadProjectDetails();
        }, 500);
        
    } catch (error) {
        console.error('Failed to add update:', error);
        showMessage(`Error: ${error.message}`, 'error');
    }
}

function showMessage(text, type) {
    const messageDiv = document.getElementById('updateMessage');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type} show`;
    
    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 5000);
}