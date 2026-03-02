import { createClient } from "https://esm.sh/@libsql/client/web";

// Turso Configuration
const TURSO_URL = 'https://leads-kamranhussainaugment.aws-ap-south-1.turso.io';
const TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzI0NTM2MzMsImlkIjoiMDE5Y2FlNzctY2YwMS03ZTUyLTk3NDEtMzQ0NzBlMTk1YzE5IiwicmlkIjoiYTZkZmE4MDItZmNhMS00ZjQ5LTk3OGEtNTViMzkzNDUxZmYwIn0.mW_HHaGu6BAwtJI76l4YRO97-zUOH_B6zyR1CM4iVVglIndpzasviLKoDL8QXlgxkdT-saNZw3JmNwMMacVqDQ';

const db = createClient({
    url: TURSO_URL,
    authToken: TURSO_AUTH_TOKEN
});

// Initialize DB
async function initDB() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS leads (
                id TEXT PRIMARY KEY,
                name TEXT,
                email TEXT,
                phone TEXT,
                website TEXT,
                company TEXT,
                socials TEXT,
                nature TEXT,
                work_nature TEXT,
                status TEXT,
                next_follow_up TEXT,
                notes TEXT,
                created_at TEXT
            )
        `);
        console.log("Database initialized");
        renderLeads(); // Load data after DB is ready
    } catch (error) {
        console.error("DB Init Error:", error);
        alert("Failed to connect to database. Check console.");
    }
}

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
let leads = []; // Will be populated from DB
let campaigns = JSON.parse(localStorage.getItem('campaigns')) || [];
let smtpSettings = JSON.parse(localStorage.getItem('smtpSettings')) || {};
let isEditing = false;
let currentViewLeadId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initDB(); // Initialize DB and load leads/settings
    renderCampaigns();
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

// Navigation Function (Exposed to window)
window.switchView = function(viewName) {
    // Update menu active state
    document.querySelectorAll('.sidebar nav li').forEach(li => li.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Show/Hide views
    Object.keys(views).forEach(key => {
        views[key].style.display = key === viewName ? 'block' : 'none';
    });
}

// Expose other functions needed by HTML inline handlers if any
// (Most are now event listeners, but keeping these just in case)
window.editLead = editLead;
window.deleteLead = deleteLead;
window.viewLead = viewLead;
window.deleteCampaign = deleteCampaign;


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

    // Ensure settings are loaded from DB if missing locally
    if (!smtpSettings.smtpUser || !smtpSettings.smtpPass) {
        console.log("Settings missing locally, attempting to fetch from Turso...");
        await loadSettings();
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
            // Use window.Email to ensure we access the global variable from the script tag
            if (typeof window.Email === 'undefined') {
                throw new Error("SmtpJS library not loaded. Check internet connection.");
            }

            const message = await window.Email.send({
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

function deleteCampaign(id) {
    if (confirm('Delete this campaign record?')) {
        campaigns = campaigns.filter(c => c.id !== id);
        localStorage.setItem('campaigns', JSON.stringify(campaigns));
        renderCampaigns();
    }
}

async function loadSettings() {
    try {
        const rs = await db.execute("SELECT * FROM settings WHERE id = 'default'");
        if (rs.rows.length > 0) {
            const row = rs.rows[0];
            smtpSettings = {
                smtpHost: row.smtp_host,
                smtpUser: row.smtp_user,
                smtpPass: row.smtp_pass,
                senderName: row.sender_name
            };
            console.log("SMTP Settings loaded from Turso database");
            
            // Update UI if elements exist
            if (document.getElementById('smtpUser')) {
                document.getElementById('smtpHost').value = smtpSettings.smtpHost || 'smtp-relay.brevo.com';
                document.getElementById('smtpUser').value = smtpSettings.smtpUser || '';
                document.getElementById('smtpPass').value = smtpSettings.smtpPass || '';
                document.getElementById('senderName').value = smtpSettings.senderName || '';
            }
        }
    } catch (error) {
        console.error("Load Settings Error:", error);
    }
}

async function saveSettings() {
    const newSettings = {
        smtpHost: document.getElementById('smtpHost').value,
        smtpUser: document.getElementById('smtpUser').value,
        smtpPass: document.getElementById('smtpPass').value,
        senderName: document.getElementById('senderName').value
    };

    try {
        // Upsert settings (SQLite specific upsert or simple check)
        const check = await db.execute("SELECT id FROM settings WHERE id = 'default'");
        
        if (check.rows.length > 0) {
            await db.execute({
                sql: "UPDATE settings SET smtp_host=?, smtp_user=?, smtp_pass=?, sender_name=? WHERE id='default'",
                args: [newSettings.smtpHost, newSettings.smtpUser, newSettings.smtpPass, newSettings.senderName]
            });
        } else {
            await db.execute({
                sql: "INSERT INTO settings (id, smtp_host, smtp_user, smtp_pass, sender_name) VALUES ('default', ?, ?, ?, ?)",
                args: [newSettings.smtpHost, newSettings.smtpUser, newSettings.smtpPass, newSettings.senderName]
            });
        }

        smtpSettings = newSettings; // Update local state
        localStorage.setItem('smtpSettings', JSON.stringify(smtpSettings)); // Keep backup just in case
        alert('Settings saved to database!');
    } catch (error) {
        console.error("Save Settings Error:", error);
        alert("Failed to save settings: " + error.message);
    }
}

// Lead Functions (Modified for Turso DB)
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

async function saveLead() {
    const id = document.getElementById('leadId').value;
    const isNew = !id;
    const leadId = id || crypto.randomUUID(); // Use standard UUID for new leads
    
    // Get existing notes if editing
    let currentNotes = [];
    if (!isNew) {
        const existingLead = leads.find(l => l.id === id);
        if (existingLead) currentNotes = existingLead.notes || [];
    }

    const leadData = {
        id: leadId,
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
        notes: JSON.stringify(currentNotes), // Store notes as JSON string
        createdAt: isNew ? new Date().toISOString() : (leads.find(l => l.id === id)?.createdAt || new Date().toISOString())
    };

    try {
        if (isNew) {
            await db.execute({
                sql: `INSERT INTO leads (id, name, email, phone, website, company, socials, nature, work_nature, status, next_follow_up, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [leadData.id, leadData.name, leadData.email, leadData.phone, leadData.website, leadData.company, leadData.socials, leadData.nature, leadData.workNature, leadData.status, leadData.nextFollowUp, leadData.notes, leadData.createdAt]
            });
        } else {
            await db.execute({
                sql: `UPDATE leads SET name=?, email=?, phone=?, website=?, company=?, socials=?, nature=?, work_nature=?, status=?, next_follow_up=?, notes=? WHERE id=?`,
                args: [leadData.name, leadData.email, leadData.phone, leadData.website, leadData.company, leadData.socials, leadData.nature, leadData.workNature, leadData.status, leadData.nextFollowUp, leadData.notes, leadData.id]
            });
        }

        await renderLeads(); // Refresh from DB
        updateStats();
        closeModalFn();
    } catch (error) {
        console.error("Save Error:", error);
        alert("Failed to save lead: " + error.message);
    }
}

async function deleteLead(id) {
    if (confirm('Are you sure you want to delete this lead?')) {
        try {
            await db.execute({
                sql: "DELETE FROM leads WHERE id = ?",
                args: [id]
            });
            await renderLeads();
            updateStats();
        } catch (error) {
            console.error("Delete Error:", error);
            alert("Failed to delete lead");
        }
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

async function addNote(leadId, text) {
    const lead = leads.find(l => l.id === leadId);
    const newNote = {
        id: Date.now().toString(),
        text: text,
        date: new Date().toISOString()
    };
    
    if (!lead.notes) lead.notes = [];
    lead.notes.unshift(newNote);
    
    try {
        await db.execute({
            sql: "UPDATE leads SET notes = ? WHERE id = ?",
            args: [JSON.stringify(lead.notes), leadId]
        });
        renderNotes(lead);
    } catch (error) {
        console.error("Add Note Error:", error);
        alert("Failed to add note");
    }
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

async function renderLeads() {
    leadsList.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading leads...</td></tr>';
    
    try {
        const result = await db.execute("SELECT * FROM leads ORDER BY created_at DESC");
        
        // Transform rows to match app structure (parse JSON notes)
        leads = result.rows.map(row => ({
            id: row.id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            website: row.website,
            company: row.company,
            socials: row.socials,
            nature: row.nature,
            workNature: row.work_nature, // Map back to JS property name
            status: row.status,
            nextFollowUp: row.next_follow_up,
            notes: row.notes ? JSON.parse(row.notes) : [],
            createdAt: row.created_at
        }));

        const term = searchInput.value.toLowerCase();
        const status = statusFilter.value;

        const filteredLeads = leads.filter(lead => {
            const matchesTerm = (lead.name || '').toLowerCase().includes(term) || 
                                (lead.company || '').toLowerCase().includes(term) ||
                                (lead.email || '').toLowerCase().includes(term);
            const matchesStatus = status === 'All' || lead.status === status;
            return matchesTerm && matchesStatus;
        });

        leadsList.innerHTML = ''; // Clear loading

        if (filteredLeads.length === 0) {
            leadsList.innerHTML = '<tr><td colspan="7" style="text-align: center;">No leads found</td></tr>';
            updateStats(); // Ensure stats are updated even if empty
            return;
        }

        filteredLeads.forEach(lead => {
            const row = document.createElement('tr');
            
            const natureBadge = lead.nature === 'Client' 
                ? '<span class="badge badge-client">Client</span>' 
                : '<span class="badge badge-agency">Agency</span>';

            const statusClass = `status-${(lead.status || 'new').toLowerCase().replace(' ', '-')}`;
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
        
        updateStats();

    } catch (error) {
        console.error("Render Error:", error);
        leadsList.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Error loading leads</td></tr>';
    }
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
