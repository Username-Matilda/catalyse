let allTensions = [];
let currentFilter = 'all';

// Load initial data
loadTensions();
populateDropdowns();

async function loadTensions() {
    try {
        const response = await fetch('/api/tensions?status=open');
        if (!response.ok) throw new Error('Failed to load tensions');
        
        allTensions = await response.json();
        displayTensions();
        
    } catch (error) {
        console.error('Failed to load tensions:', error);
        document.getElementById('tensionBoard').innerHTML = 
            '<div class="empty-state">Failed to load tensions</div>';
    }
}

function displayTensions() {
    const board = document.getElementById('tensionBoard');
    
    let filteredTensions = allTensions;
    if (currentFilter !== 'all') {
        filteredTensions = allTensions.filter(t => t.tension_type === currentFilter);
    }
    
    if (filteredTensions.length === 0) {
        board.innerHTML = '<div class="empty-state">No tensions captured yet. The system is perfectly aligned with reality, or everyone is too comfortable. 🤔</div>';
        return;
    }
    
    board.innerHTML = filteredTensions.map(tension => `
        <div class="tension-card ${tension.tension_type}" onclick="viewTension(${tension.id})">
            <div class="tension-header">
                <span class="tension-type ${tension.tension_type}">${tension.tension_type || 'unknown'}</span>
            </div>
            <div class="tension-description">${tension.description}</div>
            <div class="tension-meta">
                ${tension.sensed_by_name ? `<span>👤 ${tension.sensed_by_name}</span>` : ''}
                ${tension.related_circle_name ? `<span>⭕ ${tension.related_circle_name}</span>` : ''}
                ${tension.related_role_name ? `<span>🎭 ${tension.related_role_name}</span>` : ''}
                <span>${formatDate(tension.created_at)}</span>
            </div>
        </div>
    `).join('');
}

function filterTensions(type) {
    currentFilter = type;
    
    // Update active tab
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    displayTensions();
}

function viewTension(tensionId) {
    // For now, just log. Later we'll create a tension detail page
    console.log('View tension:', tensionId);
    // Could navigate to: window.location.href = `tension-detail.html?id=${tensionId}`;
}

async function populateDropdowns() {
    try {
        // Load people
        const peopleResponse = await fetch('/api/people');
        if (peopleResponse.ok) {
            const people = await peopleResponse.json();
            const sensedBySelect = document.getElementById('sensedBy');
            people.forEach(person => {
                const option = document.createElement('option');
                option.value = person.id;
                option.textContent = person.name;
                sensedBySelect.appendChild(option);
            });
        }
        
        // Load circles
        const circlesResponse = await fetch('/api/circles');
        if (circlesResponse.ok) {
            const circles = await circlesResponse.json();
            const circleSelect = document.getElementById('relatedCircle');
            circles.forEach(circle => {
                const option = document.createElement('option');
                option.value = circle.id;
                option.textContent = circle.name;
                circleSelect.appendChild(option);
            });
        }
        
        // Load roles
        const rolesResponse = await fetch('/api/roles');
        if (rolesResponse.ok) {
            const roles = await rolesResponse.json();
            const roleSelect = document.getElementById('relatedRole');
            roles.forEach(role => {
                const option = document.createElement('option');
                option.value = role.id;
                option.textContent = `${role.name} (${role.circle_name})`;
                roleSelect.appendChild(option);
            });
        }
        
    } catch (error) {
        console.error('Failed to load dropdown data:', error);
    }
}

// Form submission
document.getElementById('createTensionForm').addEventListener('submit', handleFormSubmit);

async function handleFormSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const tensionData = {
        description: formData.get('description'),
        tension_type: formData.get('tension_type'),
        sensed_by_person_id: formData.get('sensed_by_person_id') ? parseInt(formData.get('sensed_by_person_id')) : null,
        related_role_id: formData.get('related_role_id') ? parseInt(formData.get('related_role_id')) : null,
        related_circle_id: formData.get('related_circle_id') ? parseInt(formData.get('related_circle_id')) : null
    };
    
    try {
        const response = await fetch('/api/tensions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tensionData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create tension');
        }
        
        showMessage('Tension captured! The gap has been acknowledged.', 'success');
        event.target.reset();
        loadTensions();  // Refresh board
        
    } catch (error) {
        console.error('Failed to create tension:', error);
        showMessage(`Error: ${error.message}`, 'error');
    }
}

function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type} show`;
    
    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 5000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}