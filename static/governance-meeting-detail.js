// Get meeting ID from URL
const urlParams = new URLSearchParams(window.location.search);
const meetingId = urlParams.get('id');

if (!meetingId) {
    document.body.innerHTML = '<div class="container"><p>No meeting ID provided</p></div>';
} else {
    loadMeetingDetails();
}

async function loadMeetingDetails() {
    try {
        const response = await fetch(`/api/governance-meetings/${meetingId}`);
        if (!response.ok) throw new Error('Meeting not found');
        
        const meeting = await response.json();
        displayMeeting(meeting);
        
    } catch (error) {
        console.error('Failed to load meeting:', error);
        document.body.innerHTML = '<div class="container"><p>Failed to load meeting details</p></div>';
    }
}

function displayMeeting(meeting) {
    document.getElementById('meetingTitle').textContent = 
        `${meeting.circle_name} Governance Meeting`;
    
    const metaParts = [
        formatDate(meeting.meeting_date),
        meeting.facilitator_name ? `Facilitated by ${meeting.facilitator_name}` : null,
        meeting.secretary_name ? `Documented by ${meeting.secretary_name}` : null
    ].filter(Boolean);
    
    document.getElementById('meetingMeta').textContent = metaParts.join(' • ');
    
    displayProposals(meeting.proposals);
    
    if (meeting.notes) {
        document.getElementById('notesSection').style.display = 'block';
        document.getElementById('meetingNotes').textContent = meeting.notes;
    }
}

function displayProposals(proposals) {
    const container = document.getElementById('proposalsList');
    
    if (!proposals || proposals.length === 0) {
        container.innerHTML = '<div class="empty-state">No proposals were recorded for this meeting</div>';
        return;
    }
    
    container.innerHTML = proposals.map(proposal => `
        <div class="proposal-card">
            <h3>
                <span>${formatProposalType(proposal.proposal_type)}</span>
                <span class="outcome-badge outcome-${proposal.outcome.replace('_', '-')}">${formatOutcome(proposal.outcome)}</span>
            </h3>
            
            ${proposal.proposer_name ? `<p style="color: #666; margin-bottom: 10px;">Proposed by <strong>${proposal.proposer_name}</strong></p>` : ''}
            ${proposal.tension_description ? `<p style="color: #666; margin-bottom: 15px; font-style: italic;">From tension: "${proposal.tension_description}"</p>` : ''}
            
            <div class="phase-section">
                <div class="phase-label">Proposal:</div>
                <div class="phase-content">${proposal.proposal_text}</div>
            </div>
            
            ${proposal.clarifying_questions ? `
                <div class="phase-section">
                    <div class="phase-label">Clarifying Questions:</div>
                    <div class="phase-content">${proposal.clarifying_questions}</div>
                </div>
            ` : ''}
            
            ${proposal.reactions ? `
                <div class="phase-section">
                    <div class="phase-label">Reactions:</div>
                    <div class="phase-content">${proposal.reactions}</div>
                </div>
            ` : ''}
            
            ${proposal.objections_raised ? `
                <div class="phase-section">
                    <div class="phase-label">Objections:</div>
                    <div class="phase-content">${proposal.objections_raised}</div>
                </div>
            ` : ''}
            
            ${proposal.integration_notes ? `
                <div class="phase-section">
                    <div class="phase-label">Integration:</div>
                    <div class="phase-content">${proposal.integration_notes}</div>
                </div>
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
        'other': 'Other Structural Change'
    };
    return typeMap[type] || type;
}

function formatOutcome(outcome) {
    const outcomeMap = {
        'adopted': 'Adopted',
        'amended_and_adopted': 'Amended & Adopted',
        'withdrawn': 'Withdrawn'
    };
    return outcomeMap[outcome] || outcome;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}