const urlParams = new URLSearchParams(window.location.search);
const circleId = urlParams.get('id');

if (!circleId) {
    document.body.innerHTML = '<div class="container"><p>No circle ID provided</p></div>';
} else {
    loadCircleDetails();
    loadPolicies();
}

async function loadCircleDetails() {
    try {
        const response = await fetch(`/api/circles/${circleId}`);
        if (!response.ok) throw new Error('Circle not found');
        
        const circle = await response.json();
        displayCircle(circle);
        
    } catch (error) {
        console.error('Failed to load circle:', error);
        document.body.innerHTML = '<div class="container"><p>Failed to load circle details</p></div>';
    }
}

function displayCircle(circle) {
    document.getElementById('circleName').textContent = circle.name;
    
    if (circle.purpose) {
        document.getElementById('circlePurpose').textContent = circle.purpose;
    }
    
    displayRoles(circle.roles);
}

function displayRoles(roles) {
    const list = document.getElementById('rolesList');
    
    if (!roles || roles.length === 0) {
        list.innerHTML = '<li class="empty-state">No roles in this circle yet</li>';
        return;
    }
    
    list.innerHTML = roles.map(role => `
        <li>
            <a href="role-detail.html?id=${role.id}">${role.name}</a>
            ${role.purpose ? `<div style="color: #666; font-size: 13px; margin-top: 4px;">${role.purpose}</div>` : ''}
        </li>
    `).join('');
}

async function loadPolicies() {
    try {
        const response = await fetch(`/api/policies?circle_id=${circleId}`);
        if (!response.ok) throw new Error('Failed to load policies');
        
        const policies = await response.json();
        displayPolicies(policies);
        
    } catch (error) {
        console.error('Failed to load policies:', error);
    }
}

function displayPolicies(policies) {
    const container = document.getElementById('policiesList');
    
    if (policies.length === 0) {
        container.innerHTML = '<div class="empty-state">No policies defined for this circle yet</div>';
        return;
    }
    
    container.innerHTML = policies.map(policy => `
        <div class="policy-card">
            <div class="policy-title">${policy.title}</div>
            <div class="policy-text">${policy.policy_text}</div>
        </div>
    `).join('');
}

function togglePolicyForm() {
    const form = document.getElementById('policyForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

document.getElementById('createPolicyForm').addEventListener('submit', handleCreatePolicy);

async function handleCreatePolicy(event) {
    event.preventDefault();
    
    const policyData = {
        circle_id: parseInt(circleId),
        title: document.getElementById('policyTitle').value,
        policy_text: document.getElementById('policyText').value
    };
    
    try {
        const response = await fetch('/api/policies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(policyData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create policy');
        }
        
        showMessage('Policy created!', 'success');
        document.getElementById('createPolicyForm').reset();
        togglePolicyForm();
        loadPolicies();
        
    } catch (error) {
        console.error('Failed to create policy:', error);
        showMessage(`Error: ${error.message}`, 'error');
    }
}

async function deleteCircle() {
    const circleName = document.getElementById('circleName').textContent;
    
    if (!confirm(`Delete circle "${circleName}" and ALL its roles and policies?\n\nThis cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/circles/${circleId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete circle');
        }
        
        alert('Circle deleted');
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('Delete failed:', error);
        alert(`Error: ${error.message}`);
    }
}

function showMessage(text, type) {
    const messageDiv = document.getElementById('policyMessage');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type} show`;
    
    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 5000);
}

async function deleteCircle() {
    const circleName = document.getElementById('circleName').textContent;
    
    if (!confirm(`Delete circle "${circleName}" and ALL its roles and policies?\n\nThis cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/circles/${circleId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete circle');
        }
        
        alert('Circle deleted');
        window.location.href = 'index.html';
        
    } catch (error) {
        console.error('Delete failed:', error);
        alert(`Error: ${error.message}`);
    }
}