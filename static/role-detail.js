// Get role ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roleId = urlParams.get('id');

if (!roleId) {
    alert('No role ID specified');
    window.location.href = 'index.html';
}

// Load role details on page load
loadRoleDetails();

async function loadRoleDetails() {
    try {
        const response = await fetch(`/api/roles/${roleId}`);
        
        if (!response.ok) {
            throw new Error('Role not found');
        }
        
        const role = await response.json();
        displayRole(role);
        loadRoleProjects();
        loadCirclePolicies();
        
    } catch (error) {
        console.error('Failed to load role:', error);
        showMessage('Failed to load role details', 'error', 'accountabilityMessage');
    }
}

async function loadCirclePolicies() {
    try {
        // We need to get the circle_id from the role data
        // This requires storing it when we load role details
        if (!window.currentCircleId) return;
        
        const response = await fetch(`/api/policies?circle_id=${window.currentCircleId}`);
        if (!response.ok) return;
        
        const policies = await response.json();
        displayCirclePolicies(policies);
        
    } catch (error) {
        console.error('Failed to load policies:', error);
    }
}

function displayRole(role) {
    currentRole = role;
    window.currentCircleId = role.circle_id;

    document.getElementById('roleName').textContent = role.name;
    document.getElementById('circleInfo').textContent = role.circle_name || 'Unknown Circle';
    document.getElementById('roleType').textContent = formatRoleType(role.role_type);
    document.getElementById('rolePurpose').textContent = role.purpose || 'No purpose defined';
    
    displayAccountabilities(role.accountabilities);
    displayDomains(role.domains);
    displayAssignments(role.role_leads);
}

function displayCirclePolicies(policies) {
    const container = document.getElementById('circlePoliciesList');
    
    if (policies.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">No policies for this circle</p>';
        return;
    }
    
    container.innerHTML = policies.map(policy => `
        <div style="padding: 12px; background: #f9f9f9; border-radius: 4px; margin-bottom: 10px; border-left: 3px solid #1976d2;">
            <div style="font-weight: 600; margin-bottom: 5px;">${policy.title}</div>
            <div style="color: #555; line-height: 1.6; white-space: pre-wrap;">${policy.policy_text}</div>
        </div>
    `).join('');
}

function formatRoleType(type) {
    const typeMap = {
        'normal': 'Normal Role',
        'circle_lead': 'Circle Lead',
        'facilitator': 'Facilitator',
        'secretary': 'Secretary',
        'circle_rep': 'Circle Rep'
    };
    return typeMap[type] || type;
}

// ============= ACCOUNTABILITIES =============

function displayAccountabilities(accountabilities) {
    const list = document.getElementById('accountabilityList');
    
    if (!accountabilities || accountabilities.length === 0) {
        list.innerHTML = '<div class="empty-state">No accountabilities defined yet</div>';
        return;
    }
    
    list.innerHTML = accountabilities.map(acc => `
        <li class="item accountability-item">
            <span class="item-text">${acc.description}</span>
            <button class="delete-btn" onclick="deleteAccountability(${acc.id})">Delete</button>
        </li>
    `).join('');
}

async function addAccountability() {
    const textarea = document.getElementById('newAccountability');
    const description = textarea.value.trim();
    
    if (!description) {
        showMessage('Please enter an accountability description', 'error', 'accountabilityMessage');
        return;
    }
    
    try {
        const response = await fetch(`/api/roles/${roleId}/accountabilities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to add accountability');
        }
        
        showMessage('Accountability added successfully', 'success', 'accountabilityMessage');
        textarea.value = '';
        loadRoleDetails();
        
    } catch (error) {
        console.error('Failed to add accountability:', error);
        showMessage(`Error: ${error.message}`, 'error', 'accountabilityMessage');
    }
}

async function deleteAccountability(accountabilityId) {
    if (!confirm('Are you sure you want to delete this accountability?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/roles/${roleId}/accountabilities/${accountabilityId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete accountability');
        }
        
        showMessage('Accountability deleted', 'success', 'accountabilityMessage');
        loadRoleDetails();
        
    } catch (error) {
        console.error('Failed to delete accountability:', error);
        showMessage(`Error: ${error.message}`, 'error', 'accountabilityMessage');
    }
}

// ============= DOMAINS =============

function displayDomains(domains) {
    const list = document.getElementById('domainList');
    
    if (!domains || domains.length === 0) {
        list.innerHTML = '<div class="empty-state">No domains defined yet</div>';
        return;
    }
    
    // Get circle name from role data (already loaded)
    const circleName = document.getElementById('circleInfo').textContent;
    
    list.innerHTML = domains.map(domain => `
        <li class="item domain-item">
            <span class="item-text">
                ${domain.description}
                <br><span style="font-size: 12px; color: #999; font-style: italic;">
                    Delegated by ${circleName}
                </span>
            </span>
            <button class="delete-btn" onclick="deleteDomain(${domain.id})">Delete</button>
        </li>
    `).join('');
}

async function addDomain() {
    const textarea = document.getElementById('newDomain');
    const description = textarea.value.trim();
    
    if (!description) {
        showMessage('Please enter a domain description', 'error', 'domainMessage');
        return;
    }
    
    try {
        const response = await fetch(`/api/roles/${roleId}/domains`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to add domain');
        }
        
        showMessage('Domain added successfully', 'success', 'domainMessage');
        textarea.value = '';
        loadRoleDetails();
        
    } catch (error) {
        console.error('Failed to add domain:', error);
        showMessage(`Error: ${error.message}`, 'error', 'domainMessage');
    }
}

async function deleteDomain(domainId) {
    if (!confirm('Are you sure you want to delete this domain?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/roles/${roleId}/domains/${domainId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete domain');
        }
        
        showMessage('Domain deleted', 'success', 'domainMessage');
        loadRoleDetails();
        
    } catch (error) {
        console.error('Failed to delete domain:', error);
        showMessage(`Error: ${error.message}`, 'error', 'domainMessage');
    }
}

// ============= UTILITIES =============

function showMessage(text, type, elementId) {
    const messageDiv = document.getElementById(elementId);
    
    if (!messageDiv) {
        console.error('Message div not found:', elementId);
        return;
    }
    
    messageDiv.textContent = text;
    messageDiv.className = `message ${type} show`;
    
    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 5000);
}
// ============= ROLE ASSIGNMENTS =============

async function loadAllPeople() {
    try {
        const response = await fetch('/api/people');
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Failed to load people:', error);
        return [];
    }
}

async function populatePersonDropdown() {
    const select = document.getElementById('assignPerson');
    const people = await loadAllPeople();
    
    people.forEach(person => {
        const option = document.createElement('option');
        option.value = person.id;
        option.textContent = person.name;
        select.appendChild(option);
    });
}

function displayAssignments(assignments) {
    const list = document.getElementById('assignmentsList');
    
    if (!assignments || assignments.length === 0) {
        list.innerHTML = '<div class="empty-state">No one assigned to this role yet</div>';
        return;
    }
    
    list.innerHTML = assignments.map(assignment => `
        <li class="item assignment-item">
            <span class="item-text">
                <strong>${assignment.person_name}</strong>
                ${assignment.focus ? `<br><span style="color: #666; font-size: 13px;">Focus: ${assignment.focus}</span>` : ''}
            </span>
            <button class="delete-btn" onclick="unassignPerson(${assignment.person_id})">Unassign</button>
        </li>
    `).join('');
}
async function loadRoleProjects() {
    try {
        const response = await fetch(`/api/projects?role_id=${roleId}&status=active`);
        if (!response.ok) return;
        
        const projects = await response.json();
        displayProjects(projects);
        
    } catch (error) {
        console.error('Failed to load projects:', error);
    }
}

function displayProjects(projects) {
    const container = document.getElementById('projectsList');
    
    if (projects.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">No active projects for this role</p>';
        return;
    }
    
    container.innerHTML = `
        <ul class="item-list">
            ${projects.map(project => `
                <li>
                    <a href="project-detail.html?id=${project.id}" style="color: #388e3c; text-decoration: none;">
                        ${project.title}
                    </a>
                    ${project.jira_reference ? `<span style="color: #999; font-size: 13px;"> • ${project.jira_reference}</span>` : ''}
                </li>
            `).join('')}
        </ul>
    `;
}

async function assignPerson() {
    const personSelect = document.getElementById('assignPerson');
    const focusInput = document.getElementById('assignmentFocus');
    
    const personId = parseInt(personSelect.value);
    const focus = focusInput.value.trim() || null;
    
    if (!personId) {
        showMessage('Please select a partner', 'error', 'assignmentMessage');
        return;
    }
    
    try {
        const response = await fetch(`/api/roles/${roleId}/assignments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ person_id: personId, focus })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to assign partner');
        }
        
        showMessage('Partner assigned successfully', 'success', 'assignmentMessage');
        personSelect.value = '';
        focusInput.value = '';
        loadRoleDetails();
        
    } catch (error) {
        console.error('Failed to assign partner:', error);
        showMessage(`Error: ${error.message}`, 'error', 'assignmentMessage');
    }
}

async function unassignPerson(personId) {
    if (!confirm('Are you sure you want to unassign this partner from the role?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/roles/${roleId}/assignments/${personId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to unassign partner');
        }
        
        showMessage('Partner unassigned', 'success', 'assignmentMessage');
        loadRoleDetails();
        
    } catch (error) {
        console.error('Failed to unassign partner:', error);
        showMessage(`Error: ${error.message}`, 'error', 'assignmentMessage');
    }
}

// Initialize person dropdown on page load
populatePersonDropdown();

// ============= ROLE EDITING =============

let currentRole = null;  // Store role data globally

async function loadCirclesForEdit() {
    try {
        const response = await fetch('/api/circles');
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Failed to load circles:', error);
        return [];
    }
}

async function populateEditCircleDropdown() {
    const select = document.getElementById('editCircle');
    const circles = await loadCirclesForEdit();
    
    // Clear existing options except placeholder
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    circles.forEach(circle => {
        const option = document.createElement('option');
        option.value = circle.id;
        option.textContent = circle.name;
        select.appendChild(option);
    });
}

function enterEditMode() {
    if (!currentRole) return;
    
    // Populate form with current values
    document.getElementById('editName').value = currentRole.name || '';
    document.getElementById('editPurpose').value = currentRole.purpose || '';
    document.getElementById('editCircle').value = currentRole.circle_id || '';
    document.getElementById('editRoleType').value = currentRole.role_type || 'normal';
    
    // Toggle visibility
    document.getElementById('viewMode').style.display = 'none';
    document.getElementById('editMode').style.display = 'block';
    
    // Load circles for dropdown
    populateEditCircleDropdown();
}

function cancelEdit() {
    document.getElementById('viewMode').style.display = 'block';
    document.getElementById('editMode').style.display = 'none';
}

// Setup form handler
document.getElementById('editRoleForm').addEventListener('submit', handleEditSubmit);

async function handleEditSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const updates = {
        name: document.getElementById('editName').value.trim(),
        purpose: document.getElementById('editPurpose').value.trim() || null,
        circle_id: parseInt(document.getElementById('editCircle').value),
        role_type: document.getElementById('editRoleType').value
    };
    
    try {
        const response = await fetch(`/api/roles/${roleId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to update role');
        }
        
        showMessage('Role updated successfully!', 'success', 'editMessage');
        
        // Reload role details to show updated data
        setTimeout(() => {
            loadRoleDetails();
            cancelEdit();
        }, 1000);
        
    } catch (error) {
        console.error('Failed to update role:', error);
        showMessage(`Error: ${error.message}`, 'error', 'editMessage');
    }
    
}
async function deleteRole() {
    if (!confirm(`Permanently delete role "${currentRole.name}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/roles/${roleId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete role');
        }
        
        alert('Role deleted');
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('Delete failed:', error);
        alert(`Error: ${error.message}`);
    }
}