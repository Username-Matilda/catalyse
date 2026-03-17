let currentMeetingId = null;
let allTensions = [];

// Load initial data
loadDropdownData();
setTodayDate();

async function loadDropdownData() {
    try {
        // Load circles
        const circlesResponse = await fetch('/api/circles');
        if (circlesResponse.ok) {
            const circles = await circlesResponse.json();
            populateSelect('meetingCircle', circles, 'id', 'name');
        }
        
        // Load people
        const peopleResponse = await fetch('/api/people');
        if (peopleResponse.ok) {
            const people = await peopleResponse.json();
            populateSelect('facilitator', people, 'id', 'name');
            populateSelect('secretary', people, 'id', 'name');
            populateSelect('proposer', people, 'id', 'name');
        }
        
        // Load open tensions
        const tensionsResponse = await fetch('/api/tensions?status=open');
        if (tensionsResponse.ok) {
            allTensions = await tensionsResponse.json();
            populateTensionsSelect();
        }
        
    } catch (error) {
        console.error('Failed to load dropdown data:', error);
    }
}

function populateSelect(selectId, items, valueField, textField) {
    const select = document.getElementById(selectId);
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item[valueField];
        option.textContent = item[textField];
        select.appendChild(option);
    });
}

function populateTensionsSelect() {
    const select = document.getElementById('proposalTension');
    allTensions.forEach(tension => {
        const option = document.createElement('option');
        option.value = tension.id;
        option.textContent = tension.description.substring(0, 80) + 
                           (tension.description.length > 80 ? '...' : '');
        select.appendChild(option);
    });
}

function setTodayDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('meetingDate').value = today;
}

// Meeting metadata form
document.getElementById('meetingMetadataForm').addEventListener('submit', handleMeetingCreation);

async function handleMeetingCreation(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const meetingData = {
        circle_id: parseInt(formData.get('meetingCircle') || document.getElementById('meetingCircle').value),
        meeting_date: document.getElementById('meetingDate').value,
        facilitator_person_id: document.getElementById('facilitator').value ? 
                              parseInt(document.getElementById('facilitator').value) : null,
        secretary_person_id: document.getElementById('secretary').value ? 
                            parseInt(document.getElementById('secretary').value) : null,
        notes: document.getElementById('meetingNotes').value || null
    };
    
    try {
        const response = await fetch('/api/governance-meetings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(meetingData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create meeting');
        }
        
        const created = await response.json();
        currentMeetingId = created.id;
        
        showMessage('Meeting record created! Now add proposals.', 'success', 'metadataMessage');
        
        // Hide metadata form, show proposal form
        document.getElementById('meetingMetadataForm').style.display = 'none';
        document.getElementById('proposalSection').style.display = 'block';
        
    } catch (error) {
        console.error('Failed to create meeting:', error);
        showMessage(`Error: ${error.message}`, 'error', 'metadataMessage');
    }
}

// Proposal form
document.getElementById('proposalForm').addEventListener('submit', handleProposalCreation);

async function handleProposalCreation(event) {
    event.preventDefault();
    
    if (!currentMeetingId) {
        showMessage('No meeting created yet', 'error', 'proposalMessage');
        return;
    }
    
    const proposalData = {
        tension_id: document.getElementById('proposalTension').value ? 
                   parseInt(document.getElementById('proposalTension').value) : null,
        proposer_person_id: document.getElementById('proposer').value ? 
                           parseInt(document.getElementById('proposer').value) : null,
        proposal_type: document.getElementById('proposalType').value,
        proposal_text: document.getElementById('proposalText').value,
        clarifying_questions: document.getElementById('clarifyingQuestions').value || null,
        reactions: document.getElementById('reactions').value || null,
        objections_raised: document.getElementById('objections').value || null,
        integration_notes: document.getElementById('integration').value || null,
        outcome: document.getElementById('outcome').value
    };
    
    try {
        const response = await fetch(`/api/governance-meetings/${currentMeetingId}/proposals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proposalData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to add proposal');
        }
        
        showMessage('Proposal recorded!', 'success', 'proposalMessage');
        
        // Reset form
        document.getElementById('proposalForm').reset();
        
        // Reload proposals list
        loadProposalsList();
        
        // Mark tension as processed if linked
        if (proposalData.tension_id && proposalData.outcome !== 'withdrawn') {
            await fetch(`/api/tensions/${proposalData.tension_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'processed' })
            });
        }
        
    } catch (error) {
        console.error('Failed to add proposal:', error);
        showMessage(`Error: ${error.message}`, 'error', 'proposalMessage');
    }
}

async function loadProposalsList() {
    if (!currentMeetingId) return;
    
    try {
        const response = await fetch(`/api/governance-meetings/${currentMeetingId}`);
        if (!response.ok) return;
        
        const meeting = await response.json();
        displayProposals(meeting.proposals);
        
    } catch (error) {
        console.error('Failed to load proposals:', error);
    }
}

function displayProposals(proposals) {
    const list = document.getElementById('proposalsList');
    
    if (!proposals || proposals.length === 0) {
        list.innerHTML = '<p style="color: #999; font-style: italic;">No proposals recorded yet</p>';
        return;
    }
    
    list.innerHTML = proposals.map(p => `
        <div class="proposal-card">
            <h4>${formatProposalType(p.proposal_type)} - ${p.outcome}</h4>
            ${p.proposer_name ? `<p><strong>Proposed by:</strong> ${p.proposer_name}</p>` : ''}
            ${p.tension_description ? `<p><strong>From tension:</strong> ${p.tension_description}</p>` : ''}
            <p class="phase-label">Proposal:</p>
            <p>${p.proposal_text}</p>
            ${p.objections_raised ? `
                <p class="phase-label">Objections:</p>
                <p>${p.objections_raised}</p>
            ` : ''}
            ${p.integration_notes ? `
                <p class="phase-label">Integration:</p>
                <p>${p.integration_notes}</p>
            ` : ''}
        </div>
    `).join('');
}

function formatProposalType(type) {
    const typeMap = {
        'create_role': 'Create Role',
        'modify_role': 'Modify Role',
        'add_accountability': 'Add Accountability',
        'add_domain': 'Add Domain',
        'add_policy': 'Add Policy',
        'elect_to_role': 'Election',
        'other': 'Other'
    };
    return typeMap[type] || type;
}

function hideProposalForm() {
    if (confirm('Are you done recording proposals for this meeting?')) {
        window.location.href = 'governance-meetings.html';  // We'll create this list page later
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