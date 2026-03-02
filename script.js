// DOM Elements
const leadForm = document.getElementById('leadForm');
const modal = document.getElementById('leadModal');
const notesModal = document.getElementById('notesModal');
const campaignModal = document.getElementById('campaignModal');
const sendingModal = document.getElementById('sendingModal');
const addLeadBtn = document.getElementById('addLeadBtn');
const exportBtn = document.getElementById('exportBtn');
const createCampaignBtn = document.getElementById('createCampaignBtn');
const cancelBtn = document.getElementById('cancelBtn');
const cancelCampaignBtn = document.getElementById('cancelCampaignBtn');
const closeModal = document.querySelector('.close');
const closeNotesModal = document.querySelector('.close-notes');
const closeCampaignModal = document.querySelector('.close-campaign');
const leadsList = document.getElementById('leadsList');
const campaignsList = document.getElementById('campaignsList');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const natureSelect = document.getElementById('nature');
const workNatureGroup = document.getElementById('workNatureGroup');
const modalTitle = document.getElementById('modalTitle');
const addNoteBtn = document.getElementById('addNoteBtn');
const newNoteText = document.getElementById('newNoteText');
const notesList = document.getElementById('notesList');
const leadDetails = document.getElementById('leadDetails');
const campaignForm = document.getElementById('campaignForm');
const targetAudience = document.getElementById('targetAudience');
const recipientCount = document.getElementById('recipientCount');
const settingsForm = document.getElementById('settingsForm');

// Views
const views = {
    dashboard: document.getElementById('dashboard-view'),
    campaigns: document.getElementById('campaigns-view'),
    settings: document.getElementById('settings-view')
};

// Stats Elements
const totalLeadsEl = document.getElementById('totalLeads');
const activeLeadsEl = document.getElementById('activeLeads');
const closedWonEl = document.getElementById('closedWon');

// State
let leads = JSON.parse(localStorage.getItem('leads')) || [];
let campaigns = JSON.parse(localStorage.getItem('campaigns')) || [];
let smtpSettings = JSON.parse(localStorage.getItem('smtpSettings')) || {};
let isEditing = false;
let currentViewLeadId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Migration for old data
    leads = leads.map(lead => ({
        ...lead,
        status: lead.status || 'New',
        nextFollowUp: lead.nextFollowUp || '',
        notes: lead.notes || []
    }));
    
    // Load Settings
    if (smtpSettings.smtpUser) {
        document.getElementById('smtpHost').value = smtpSettings.smtpHost || 'smtp-relay.brevo.com';
        document.getElementById('smtpUser').value = smtpSettings.smtpUser;
        document.getElementById('smtpPass').value = smtpSettings.smtpPass;
        document.getElementById('senderName').value = smtpSettings.senderName || '';
    }

    renderLeads();
    renderCampaigns();
    updateStats();
});

// Event Listeners
addLeadBtn.addEventListener('click', () => openModal());
createCampaignBtn.addEventListener('click', () => openCampaignModal());
exportBtn.addEventListener('click', exportToCSV);
cancelBtn.addEventListener('click', closeModalFn);
cancelCampaignBtn.addEventListener('click', closeCampaignModalFn);
closeModal.addEventListener('click', closeModalFn);
closeNotesModal.addEventListener('click', closeNotesModalFn);
closeCampaignModal.addEventListener('click', closeCampaignModalFn);

window.addEventListener('click', (e) => {
    if (e.target === modal) closeModalFn();
    if (e.target === notesModal) closeNotesModalFn();
    if (e.target === campaignModal) closeCampaignModalFn();
});

natureSelect.addEventListener('change', (e) => {
    if (e.target.value === 'Client') {
        workNatureGroup.style.display = 'block';
    } else {
        workNatureGroup.style.display = 'none';
        document.getElementById('workNature').value = '';
    }
});

leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveLead();
});

campaignForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendCampaign();
});

settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
});

searchInput.addEventListener('input', () => renderLeads());
statusFilter.addEventListener('change', () => renderLeads());

addNoteBtn.addEventListener('click', () => {
    const text = newNoteText.value.trim();
    if (text && currentViewLeadId) {
        addNote(currentViewLeadId, text);
        newNoteText.value = '';
    }
});

targetAudience.addEventListener('change', updateRecipientCount);

// Navigation Function
window.switchView = function(viewName) {
    // Update menu active state
    document.querySelectorAll('.sidebar nav li').forEach(li => li.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Show/Hide views
    Object.keys(views).forEach(key => {
        views[key].style.display = key === viewName ? 'block' : 'none';
    });
}

// Campaign Functions
function openCampaignModal() {
    campaignModal.style.display = 'block';
    campaignForm.reset();
    updateRecipientCount();
}

function closeCampaignModalFn() {
    campaignModal.style.display = 'none';
}

function updateRecipientCount() {
    const audience = targetAudience.value;
    const count = getRecipients(audience).length;
    recipientCount.textContent = `Will send to approx. ${count} recipients`;
}

function getRecipients(audience) {
    return leads.filter(lead => {
        if (!lead.email) return false;
        if (audience === 'All') return true;
        if (audience === 'Client') return lead.nature === 'Client';
        if (audience === 'Agency') return lead.nature === 'Agency';
        return lead.status === audience;
    });
}

async function sendCampaign() {
    const recipients = getRecipients(targetAudience.value);
    if (recipients.length === 0) {
        alert('No recipients selected!');
        return;
    }

    if (!smtpSettings.smtpUser || !smtpSettings.smtpPass) {
        alert('Please configure SMTP settings first!');
        switchView('settings');
        closeCampaignModalFn();
        return;
    }

    // Start Sending
    sendingModal.style.display = 'block';
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('sendingStatus');
    
    const campaignData = {
        id: Date.now().toString(),
        name: document.getElementById('campaignName').value,
        subjectTemplate: document.getElementById('emailSubject').value,
        status: 'Sent',
        sentDate: new Date().toISOString(),
        recipientCount: recipients.length
    };

    let successCount = 0;
    let failCount = 0;

    // Sending loop
    for (let i = 0; i < recipients.length; i++) {
        const lead = recipients[i];
        const percent = Math.round(((i + 1) / recipients.length) * 100);
        progressBar.style.width = `${percent}%`;
        statusText.textContent = `Sending to ${lead.email} (${i + 1}/${recipients.length})...`;
        
        // Prepare content
        const subject = campaignData.subjectTemplate
            .replace('{name}', lead.name)
            .replace('{company}', lead.company);
            
        const body = document.getElementById('emailBody').value
            .replace('{name}', lead.name)
            .replace('{company}', lead.company)
            .replace(/\n/g, '<br>');

        // Call SmtpJS
        try {
            const message = await Email.send({
                Host: smtpSettings.smtpHost || "smtp-relay.brevo.com",
                Username: smtpSettings.smtpUser,
                Password: smtpSettings.smtpPass,
                To: lead.email,
                From: `${smtpSettings.senderName ? `"${smtpSettings.senderName}"` : ""} <${smtpSettings.smtpUser}>`,
                Subject: subject,
                Body: body
            });

            if (message === "OK") {
                successCount++;
                console.log(`[SMTP] Sent to ${lead.email}`);
            } else {
                failCount++;
                console.error(`[SMTP Error] ${lead.email}:`, message);
            }
        } catch (error) {
            failCount++;
            console.error(`[Network Error] ${lead.email}:`, error);
        }

        // Rate limiting (be gentle)
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Finish
    campaignData.subject = campaignData.subjectTemplate;
    campaignData.successCount = successCount;
    campaignData.failCount = failCount;
    
    campaigns.unshift(campaignData);
    localStorage.setItem('campaigns', JSON.stringify(campaigns));
    renderCampaigns();
    
    setTimeout(() => {
        sendingModal.style.display = 'none';
        closeCampaignModalFn();
        alert(`Campaign finished!\nSent: ${successCount}\nFailed: ${failCount}\n(Check console for error details)`);
    }, 500);
}

function renderCampaigns() {
    campaignsList.innerHTML = '';
    if (campaigns.length === 0) {
        campaignsList.innerHTML = '<tr><td colspan="6" style="text-align: center;">No campaigns yet</td></tr>';
        return;
    }

    campaigns.forEach(camp => {
        const row = document.createElement('tr');
        const date = new Date(camp.sentDate).toLocaleDateString();
        row.innerHTML = `
            <td>${camp.name}</td>
            <td>${camp.subject}</td>
            <td><span class="badge status-won">Sent</span></td>
            <td>${date}</td>
            <td>${camp.successCount !== undefined ? `${camp.successCount}/${camp.recipientCount}` : camp.recipientCount}</td>
            <td>
                <button class="action-btn delete-btn" onclick="deleteCampaign('${camp.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        campaignsList.appendChild(row);
    });
}

window.deleteCampaign = function(id) {
    if (confirm('Delete this campaign record?')) {
        campaigns = campaigns.filter(c => c.id !== id);
        localStorage.setItem('campaigns', JSON.stringify(campaigns));
        renderCampaigns();
    }
}

function saveSettings() {
    smtpSettings = {
        smtpHost: document.getElementById('smtpHost').value,
        smtpUser: document.getElementById('smtpUser').value,
        smtpPass: document.getElementById('smtpPass').value,
        senderName: document.getElementById('senderName').value
    };
    localStorage.setItem('smtpSettings', JSON.stringify(smtpSettings));
    alert('Settings saved!');
}

// Lead Functions (Existing)
function openModal(lead = null) {
    modal.style.display = 'block';
    if (lead) {
        isEditing = true;
        modalTitle.textContent = 'Edit Lead';
        document.getElementById('leadId').value = lead.id;
        document.getElementById('name').value = lead.name;
        document.getElementById('email').value = lead.email;
        document.getElementById('phone').value = lead.phone;
        document.getElementById('website').value = lead.website;
        document.getElementById('company').value = lead.company;
        document.getElementById('socials').value = lead.socials;
        document.getElementById('nature').value = lead.nature;
        document.getElementById('status').value = lead.status || 'New';
        document.getElementById('nextFollowUp').value = lead.nextFollowUp || '';
        
        if (lead.nature === 'Client') {
            workNatureGroup.style.display = 'block';
            document.getElementById('workNature').value = lead.workNature;
        } else {
            workNatureGroup.style.display = 'none';
        }
    } else {
        isEditing = false;
        modalTitle.textContent = 'Add New Lead';
        leadForm.reset();
        workNatureGroup.style.display = 'none';
        document.getElementById('leadId').value = '';
        document.getElementById('status').value = 'New';
    }
}

function closeModalFn() {
    modal.style.display = 'none';
}

function closeNotesModalFn() {
    notesModal.style.display = 'none';
    currentViewLeadId = null;
}

function saveLead() {
    const id = document.getElementById('leadId').value;
    const leadData = {
        id: id || Date.now().toString(),
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        website: document.getElementById('website').value,
        company: document.getElementById('company').value,
        socials: document.getElementById('socials').value,
        nature: document.getElementById('nature').value,
        workNature: document.getElementById('workNature').value,
        status: document.getElementById('status').value,
        nextFollowUp: document.getElementById('nextFollowUp').value,
        notes: isEditing ? leads.find(l => l.id === id).notes : [],
        createdAt: isEditing ? leads.find(l => l.id === id).createdAt : new Date().toISOString()
    };

    if (isEditing) {
        const index = leads.findIndex(l => l.id === id);
        leads[index] = leadData;
    } else {
        leads.unshift(leadData);
    }

    saveToLocalStorage();
    renderLeads();
    updateStats();
    closeModalFn();
}

function deleteLead(id) {
    if (confirm('Are you sure you want to delete this lead?')) {
        leads = leads.filter(l => l.id !== id);
        saveToLocalStorage();
        renderLeads();
        updateStats();
    }
}

function editLead(id) {
    const lead = leads.find(l => l.id === id);
    openModal(lead);
}

function viewLead(id) {
    const lead = leads.find(l => l.id === id);
    currentViewLeadId = id;
    
    // Populate details
    leadDetails.innerHTML = `
        <div class="lead-detail-row"><span class="lead-detail-label">Name:</span> ${lead.name}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Company:</span> ${lead.company}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Email:</span> <a href="mailto:${lead.email}">${lead.email}</a></div>
        <div class="lead-detail-row"><span class="lead-detail-label">Phone:</span> ${lead.phone}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Website:</span> <a href="${lead.website}" target="_blank">${lead.website}</a></div>
        <div class="lead-detail-row"><span class="lead-detail-label">Socials:</span> ${lead.socials}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Type:</span> ${lead.nature} ${lead.workNature ? `(${lead.workNature})` : ''}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Status:</span> ${lead.status}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Next Follow-up:</span> ${lead.nextFollowUp || 'Not scheduled'}</div>
    `;

    renderNotes(lead);
    notesModal.style.display = 'block';
}

function addNote(leadId, text) {
    const lead = leads.find(l => l.id === leadId);
    const newNote = {
        id: Date.now().toString(),
        text: text,
        date: new Date().toISOString()
    };
    
    if (!lead.notes) lead.notes = [];
    lead.notes.unshift(newNote);
    
    saveToLocalStorage();
    renderNotes(lead);
}

function renderNotes(lead) {
    notesList.innerHTML = '';
    if (!lead.notes || lead.notes.length === 0) {
        notesList.innerHTML = '<div>No notes yet.</div>';
        return;
    }

    lead.notes.forEach(note => {
        const div = document.createElement('div');
        div.className = 'note-item';
        const date = new Date(note.date).toLocaleString();
        div.innerHTML = `
            <div class="note-date">${date}</div>
            <div>${note.text}</div>
        `;
        notesList.appendChild(div);
    });
}

function saveToLocalStorage() {
    localStorage.setItem('leads', JSON.stringify(leads));
}

function renderLeads() {
    leadsList.innerHTML = '';
    const term = searchInput.value.toLowerCase();
    const status = statusFilter.value;

    const filteredLeads = leads.filter(lead => {
        const matchesTerm = lead.name.toLowerCase().includes(term) || 
                            lead.company.toLowerCase().includes(term) ||
                            lead.email.toLowerCase().includes(term);
        const matchesStatus = status === 'All' || lead.status === status;
        return matchesTerm && matchesStatus;
    });

    if (filteredLeads.length === 0) {
        leadsList.innerHTML = '<tr><td colspan="7" style="text-align: center;">No leads found</td></tr>';
        return;
    }

    filteredLeads.forEach(lead => {
        const row = document.createElement('tr');
        
        const natureBadge = lead.nature === 'Client' 
            ? '<span class="badge badge-client">Client</span>' 
            : '<span class="badge badge-agency">Agency</span>';

        const statusClass = `status-${lead.status.toLowerCase().replace(' ', '-')}`;
        const statusBadge = `<span class="badge ${statusClass}">${lead.status}</span>`;

        row.innerHTML = `
            <td>${lead.name}</td>
            <td>${lead.company}</td>
            <td>${statusBadge}</td>
            <td>${lead.nextFollowUp || '-'}</td>
            <td>${natureBadge}</td>
            <td>
                <button class="action-btn view-btn" onclick="viewLead('${lead.id}')" title="View & Notes"><i class="fas fa-eye"></i></button>
                <button class="action-btn edit-btn" onclick="editLead('${lead.id}')" title="Edit"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete-btn" onclick="deleteLead('${lead.id}')" title="Delete"><i class="fas fa-trash"></i></button>
            </td>
        `;
        leadsList.appendChild(row);
    });
}

function updateStats() {
    totalLeadsEl.textContent = leads.length;
    // Active leads are those not Won or Lost
    activeLeadsEl.textContent = leads.filter(l => !['Won', 'Lost'].includes(l.status)).length;
    closedWonEl.textContent = leads.filter(l => l.status === 'Won').length;
}

function exportToCSV() {
    if (leads.length === 0) {
        alert('No data to export');
        return;
    }

    const headers = ['ID', 'Name', 'Email', 'Phone', 'Website', 'Company', 'Socials', 'Nature', 'Work Nature', 'Status', 'Next Follow Up', 'Created At'];
    const csvContent = [
        headers.join(','),
        ...leads.map(lead => {
            return [
                lead.id,
                `"${lead.name}"`,
                `"${lead.email}"`,
                `"${lead.phone}"`,
                `"${lead.website}"`,
                `"${lead.company}"`,
                `"${lead.socials}"`,
                lead.nature,
                lead.workNature,
                lead.status,
                lead.nextFollowUp,
                lead.createdAt
            ].join(',');
        })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
