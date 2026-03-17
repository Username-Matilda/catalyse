const urlParams = new URLSearchParams(window.location.search);
const meetingId = urlParams.get('id');

if (!meetingId) {
    document.body.innerHTML = '<div class="container"><p>No meeting ID provided</p></div>';
} else {
    loadMeetingDetails();
}

async function loadMeetingDetails() {
    try {
        const response = await fetch(`/api/tactical-meetings/${meetingId}`);
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
        `${meeting.circle_name} Tactical Meeting`;
    
    const metaParts = [
        formatDate(meeting.meeting_date),
        meeting.facilitator_name ? `Facilitated by ${meeting.facilitator_name}` : null
    ].filter(Boolean);
    
    document.getElementById('meetingMeta').textContent = metaParts.join(' • ');
    
    // Display each section if content exists
    displaySection('checkin', meeting.checkin_notes);
    displaySection('checklist', meeting.checklist_review);
    displaySection('metrics', meeting.metrics_review);
    displaySection('projects', meeting.project_updates);
    displaySection('tensions', meeting.tension_processing);
    displaySection('closing', meeting.closing_notes);
}

function displaySection(sectionName, content) {
    if (content && content.trim()) {
        document.getElementById(`${sectionName}Section`).style.display = 'block';
        document.getElementById(`${sectionName}Content`).textContent = content;
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}