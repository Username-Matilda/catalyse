// Load people on page load
loadPeople();

async function loadPeople() {
    try {
        const response = await fetch('/api/people');
        
        if (!response.ok) {
            throw new Error('Failed to load people');
        }
        
        const people = await response.json();
        displayPeople(people);
        
    } catch (error) {
        console.error('Failed to load people:', error);
        showMessage('Failed to load partners', 'error');
    }
}

function displayPeople(people) {
    const list = document.getElementById('peopleList');
    
    if (!people || people.length === 0) {
        list.innerHTML = '<div class="empty-state">No partners added yet</div>';
        return;
    }
    
    list.innerHTML = people.map(person => `
        <li class="person-item">
            <a href="person-detail.html?id=${person.id}">${person.name}</a>
            ${person.email ? `<div class="person-email">${person.email}</div>` : ''}
        </li>
    `).join('');
}

// Setup form handler
document.getElementById('createPersonForm').addEventListener('submit', handleFormSubmit);

async function handleFormSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const personData = {
        name: formData.get('name'),
        email: formData.get('email') || null,
        notes: formData.get('notes') || null
    };
    
    try {
        const response = await fetch('/api/people', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(personData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create partner');
        }
        
        showMessage('Partner added successfully!', 'success');
        event.target.reset();
        loadPeople();
        
    } catch (error) {
        console.error('Failed to create partner:', error);
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