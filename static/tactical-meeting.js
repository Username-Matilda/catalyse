// Load initial data
loadDropdowns();
setTodayDate();

async function loadDropdowns() {
    try {
        // Load circles
        const circlesResponse = await fetch('/api/circles');
        if (circlesResponse.ok) {
            const circles = await circlesResponse.json();
            const select = document.getElementById('meetingCircle');
            circles.forEach(circle => {
                const option = document.createElement('option');
                option.value = circle.id;
                option.textContent = circle.name;
                select.appendChild(option);
            });
        }
        
        // Load people
        const peopleResponse = await fetch('/api/people');
        if (peopleResponse.ok) {
            const people = await peopleResponse.json();
            const facilitatorSelect = document.getElementById('facilitator');
            people.forEach(person => {
                const option = document.createElement('option');
                option.value = person.id;
                option.textContent = person.name;
                facilitatorSelect.appendChild(option);
            });
        }
        
    } catch (error) {
        console.error('Failed to load dropdowns:', error);
    }
}

function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('meetingDate').value = today;
}

let circleProjects = [];

// Listen for circle selection
document.getElementById('meetingCircle').addEventListener('change', loadCircleProjects);

async function loadCircleProjects() {
    const circleId = document.getElementById('meetingCircle').value;
    if (!circleId) {
        document.getElementById('projectUpdatesSection').innerHTML = 
            '<p style="color: #999; margin-bottom: 15px;">Select a circle to load projects...</p>';
        return;
    }
    
    try {
        const response = await fetch(`/api/projects?circle_id=${circleId}&status=active`);
        if (!response.ok) throw new Error('Failed to load projects');
        
        circleProjects = await response.json();
        displayProjectUpdateFields();
        
    } catch (error) {
        console.error('Failed to load projects:', error);
        document.getElementById('projectUpdatesSection').innerHTML = 
            '<p style="color: #f57c00;">Failed to load projects for this circle</p>';
    }
}

function displayProjectUpdateFields() {
    const container = document.getElementById('projectUpdatesSection');
    
    if (circleProjects.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">No active projects for this circle</p>';
        return;
    }
    
    container.innerHTML = circleProjects.map((project, index) => `
        <div class="form-group" style="padding: 15px; background: #f9f9f9; border-radius: 4px; margin-bottom: 15px;">
            <label style="color: #388e3c; font-weight: 600;">${project.title}</label>
            <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
                🎭 ${project.role_name}
                ${project.jira_reference ? ` • 📋 ${project.jira_reference}` : ''}
            </div>
            <textarea id="projectUpdate${index}" data-project-id="${project.id}"
                      placeholder="Quick status update for this project..."></textarea>
        </div>
    `).join('');
}

// Form submission
document.getElementById('tacticalMeetingForm').addEventListener('submit', handleSubmit);

async function handleSubmit(event) {
    event.preventDefault();
    
    // Collect project updates
    const projectUpdates = circleProjects.map((project, index) => {
        const updateText = document.getElementById(`projectUpdate${index}`)?.value;
        return updateText ? {
            project_id: project.id,
            update_text: updateText
        } : null;
    }).filter(Boolean);
    
    const meetingData = {
        circle_id: parseInt(document.getElementById('meetingCircle').value),
        meeting_date: document.getElementById('meetingDate').value,
        facilitator_person_id: document.getElementById('facilitator').value ? 
                              parseInt(document.getElementById('facilitator').value) : null,
        checkin_notes: document.getElementById('checkin').value || null,
        checklist_review: document.getElementById('checklist').value || null,
        metrics_review: document.getElementById('metrics').value || null,
        tension_processing: document.getElementById('tensions').value || null,
        closing_notes: document.getElementById('closing').value || null
    };
    
    try {
        // Create meeting first
        const response = await fetch('/api/tactical-meetings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(meetingData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create meeting');
        }
        
        const created = await response.json();
        
        // Add project updates if any exist
        if (projectUpdates.length > 0) {
            await Promise.all(projectUpdates.map(update => 
                fetch(`/api/projects/${update.project_id}/updates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        update_text: update.update_text,
                        meeting_id: created.id
                    })
                })
            ));
        }
        
        showMessage('Tactical meeting saved successfully!', 'success');
        
        setTimeout(() => {
            window.location.href = `tactical-meeting-detail.html?id=${created.id}`;
        }, 1500);
        
    } catch (error) {
        console.error('Failed to create meeting:', error);
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