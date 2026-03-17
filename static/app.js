// Global state
let circles = [];

// Initialize on page load
async function init() {
    try {
        await loadTopology();
        populateCircleDropdown();  // Remove meaningless await
        populateParentCircleDropdown();
        setupFormHandler();
        setupCircleFormHandler();
    } catch (error) {
        console.error('Initialization failed:', error);
        showMessage('Failed to load interface. Check console for details.', 'error');
    }
}

// Populate circle dropdown in form
function populateCircleDropdown() {
    const select = document.getElementById('roleCircle');
    
    if (!select) {
        console.error('Circle dropdown element not found');
        return;
    }
    
    // Clear existing options except the first (placeholder)
    while (select.options.length > 1) {
        select.remove(1);
    }
    
    console.log('Populating dropdown with', circles.length, 'circles');
    
    circles.forEach(circle => {
        const option = document.createElement('option');
        option.value = circle.id;
        option.textContent = circle.name;
        select.appendChild(option);
    });
    
    
    console.log('Dropdown now has', select.options.length, 'options');
}

// Setup form submission handler
function setupFormHandler() {
    const form = document.getElementById('createRoleForm');
    
    if (!form) {
        console.error('Form element not found');
        return;
    }
    
    form.addEventListener('submit', handleFormSubmit);
}

function setupCircleFormHandler() {
    const form = document.getElementById('createCircleForm');
    if (!form) return;
    
    form.addEventListener('submit', handleCircleSubmit);
}

async function handleCircleSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const circleData = {
        name: formData.get('circleName'),
        purpose: formData.get('circlePurpose') || null,
        parent_circle_id: formData.get('parentCircle') ? 
                         parseInt(formData.get('parentCircle')) : null
    };

    console.log('Attempting to send:', circleData);
    
    try {
        const response = await fetch('/api/circles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(circleData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create circle');
        }
        
        const created = await response.json();
        
        showCircleMessage(`Circle "${created.name}" created!`, 'success');
        event.target.reset();
        
        // Refresh topology and dropdowns
        await loadTopology();
        populateCircleDropdown();
        populateParentCircleDropdown();
        
    } catch (error) {
        console.error('Circle creation failed:', error);
        showCircleMessage(`Error: ${error.message}`, 'error');
    }
}

function showCircleMessage(text, type) {
    const messageDiv = document.getElementById('circleMessage');
    if (!messageDiv) return;
    
    messageDiv.textContent = text;
    messageDiv.className = `message ${type} show`;
    
    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 5000);
}

function populateParentCircleDropdown() {
    const select = document.getElementById('parentCircle');
    if (!select) return;
    
    // Clear except first option
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

// Handle role creation form submission
async function handleFormSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const roleData = {
        name: formData.get('name'),
        purpose: formData.get('purpose') || null,
        circle_id: parseInt(formData.get('circle_id')),
        role_type: formData.get('role_type')
    };
    
    // Validation: circle must be selected
    if (!roleData.circle_id || isNaN(roleData.circle_id)) {
        showMessage('Please select a circle', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/roles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(roleData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create role');
        }
        
        const createdRole = await response.json();
        
        showMessage(`Role "${createdRole.name}" created successfully!`, 'success');

        event.target.reset();

        // Refresh topology to show new role
        await loadTopology();
        
    } catch (error) {
        console.error('Role creation failed:', error);
        showMessage(`Error: ${error.message}`, 'error');
    }
}

// Show success/error message
function showMessage(text, type) {
    const messageDiv = document.getElementById('formMessage');
    
    if (!messageDiv) {
        console.error('Message div not found');
        return;
    }
    
    messageDiv.textContent = text;
    messageDiv.className = `message ${type} show`;
    
    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 5000);
}

// Render circle topology
let showAllRoles = false;

function toggleStructureView() {
    showAllRoles = !showAllRoles;
    const btn = document.getElementById('toggleViewBtn');
    btn.textContent = showAllRoles ? 'Hide Roles' : 'Show All Roles';
    renderCircleCards(circles);
}

function renderCircleCards(allCircles) {
    const container = document.getElementById('circlesContainer');
    if (!container) return;
    
    // Build hierarchy
    const rootCircles = allCircles.filter(c => c.parent_circle_id === null);
    
    container.innerHTML = rootCircles.map(root => 
        renderCircleCard(root, allCircles, 0)
    ).join('');
}

function renderCircleCard(circle, allCircles, depth) {
    const children = allCircles.filter(c => c.parent_circle_id === circle.id);
    const roles = circle.roles || [];
    const rolesVisible = showAllRoles ? 'visible' : '';
    
    return `
        <div class="circle-card ${depth > 0 ? 'nested' : ''}" 
             data-circle-id="${circle.id}" 
             onclick="toggleCircleExpansion(event, ${circle.id})">
            
            <div class="circle-header">
                <div>
                    <div class="circle-name">${circle.name}</div>
                    ${circle.purpose ? `<div class="circle-purpose">${circle.purpose}</div>` : ''}
                    <div class="circle-meta">${roles.length} role${roles.length !== 1 ? 's' : ''}</div>
                </div>
                <a href="circle-detail.html?id=${circle.id}" 
                   class="manage-link" 
                   onclick="event.stopPropagation()">
                    Manage →
                </a>
            </div>
            
            <div class="roles-section ${rolesVisible}" id="roles-${circle.id}">
                ${roles.length === 0 ? 
                    '<p style="color: #999; font-style: italic;">No roles defined yet</p>' :
                    roles.map(r => `
                        <div class="role-item">
                            <a href="role-detail.html?id=${r.id}" onclick="event.stopPropagation()">
                                ${r.name}
                            </a>
                            ${r.purpose ? `<div class="role-purpose">${r.purpose}</div>` : ''}
                        </div>
                    `).join('')
                }
            </div>
            
            ${children.length > 0 ? `
                <div class="child-circles">
                    ${children.map(child => renderCircleCard(child, allCircles, depth + 1)).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function toggleCircleExpansion(event, circleId) {
    event.stopPropagation();
    
    const card = event.currentTarget;
    const rolesSection = document.getElementById(`roles-${circleId}`);
    
    if (!rolesSection) return;
    
    card.classList.toggle('expanded');
    rolesSection.classList.toggle('visible');
}

// Update loadTopology to use new rendering
async function loadTopology() {
    try {
        const response = await fetch('/api/circles');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        circles = await response.json();
        
        console.log('Circles loaded:', circles.length);
        
        if (circles.length === 0) {
            document.getElementById('circlesContainer').innerHTML = 
                '<p style="color: #999; text-align: center; padding: 40px;">No circles yet. Create your first circle to begin.</p>';
            return;
        }
        
        // Fetch roles for each circle
        await Promise.all(circles.map(async (circle) => {
            const rolesResp = await fetch(`/api/circles/${circle.id}/roles`);
            circle.roles = rolesResp.ok ? await rolesResp.json() : [];
        }));
        
        renderCircleCards(circles);
        
    } catch (error) {
        console.error('Failed to load circles:', error);
        throw error;
    }
}

// Initialize on page load
init();