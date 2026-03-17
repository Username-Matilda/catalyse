let allMeetings = [];
let allCircles = [];

loadCircles();
loadMeetings();

async function loadCircles() {
    try {
        const response = await fetch('/api/circles');
        if (!response.ok) return;
        
        allCircles = await response.json();
        
        const select = document.getElementById('circleFilter');
        allCircles.forEach(circle => {
            const option = document.createElement('option');
            option.value = circle.id;
            option.textContent = circle.name;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('Failed to load circles:', error);
    }
}

async function loadMeetings() {
    try {
        const response = await fetch('/api/tactical-meetings');
        if (!response.ok) throw new Error('Failed to load meetings');
        
        allMeetings = await response.json();
        displayMeetings(allMeetings);
        
    } catch (error) {
        console.error('Failed to load meetings:', error);
        document.getElementById('meetingsList').innerHTML = 
            '<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>Failed to load meetings</p></div>';
    }
}

function filterMeetings() {
    const circleId = document.getElementById('circleFilter').value;
    
    if (!circleId) {
        displayMeetings(allMeetings);
        return;
    }
    
    const filtered = allMeetings.filter(m => m.circle_id === parseInt(circleId));
    displayMeetings(filtered);
}

function displayMeetings(meetings) {
    const container = document.getElementById('meetingsList');
    
    if (meetings.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔄</div>
                <p>No tactical meetings recorded yet.</p>
                <p style="margin-top: 10px; color: #999;">Capture your first operational sync meeting.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = meetings.map(meeting => `
        <div class="meeting-card" onclick="viewMeeting(${meeting.id})">
            <div class="meeting-header">
                <div>
                    <div class="meeting-title">${meeting.circle_name} Tactical</div>
                    <div class="meeting-date">${formatDate(meeting.meeting_date)}</div>
                </div>
            </div>
            <div class="meeting-meta">
                ${meeting.facilitator_name ? `<span>🎯 Facilitated by ${meeting.facilitator_name}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function viewMeeting(meetingId) {
    window.location.href = `tactical-meeting-detail.html?id=${meetingId}`;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}