// Get person ID from URL
const urlParams = new URLSearchParams(window.location.search);
const personId = urlParams.get('id');

if (!personId) {
    alert('No person ID specified');
    window.location.href = 'people.html';
}

loadPersonDetails();

async function loadPersonDetails() {
    try {
        const response = await fetch(`/api/people/${personId}`);
        
        if (!response.ok) {
            throw new Error('Person not found');
        }
        
        const person = await response.json();
        displayPerson(person);
        
    } catch (error) {
        console.error('Failed to load person:', error);
        alert('Failed to load partner details');
        window.location.href = 'people.html';
    }
}

function displayPerson(person) {
    document.getElementById('personName').textContent = person.name;
    const emailSpan = document.getElementById('personEmail');
    if (person.email) {
        emailSpan.textContent = person.email;
    } else {
        emailSpan.style.display = 'none';
    }
    
    const notesDiv = document.getElementById('personNotes');
    if (person.notes) {
        notesDiv.textContent = person.notes;
    } else {
        notesDiv.style.display = 'none';
    }
    
    displayRoles(person.roles);
}

function displayRoles(roles) {
    const list = document.getElementById('rolesList');
    
    if (!roles || roles.length === 0) {
        list.innerHTML = '<div class="empty-state">No role assignments yet</div>';
        return;
    }
    
    list.innerHTML = roles.map(role => `
        <li class="role-item">
            <a href="role-detail.html?id=${role.id}">${role.name}</a>
            <div class="role-circle">in ${role.circle_name}</div>
            ${role.focus ? `<div class="role-focus">Focus: ${role.focus}</div>` : ''}
        </li>
    `).join('');
}

async function deletePerson() {
    if (!confirm('Are you sure you want to remove this partner? Their role assignment history will be preserved, but they will no longer appear in active lists.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/people/${personId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            // CRITICAL: Extract the actual error message from server
            const errorData = await response.json();
            console.error('Server error:', errorData);
            throw new Error(errorData.detail || 'Failed to delete partner');
        }
        
        alert('Partner removed successfully');
        window.location.href = 'people.html';
        
    } catch (error) {
        console.error('Failed to delete partner:', error);
        alert(`Error: ${error.message}`);  // Show actual error in alert
    }
}