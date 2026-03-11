import { createClient } from "https://esm.sh/@libsql/client/web";

// Turso Configuration
const TURSO_URL = 'https://leads-kamranhussainaugment.aws-ap-south-1.turso.io';
const TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzI0NTM2MzMsImlkIjoiMDE5Y2FlNzctY2YwMS03ZTUyLTk3NDEtMzQ0NzBlMTk1YzE5IiwicmlkIjoiYTZkZmE4MDItZmNhMS00ZjQ5LTk3OGEtNTViMzkzNDUxZmYwIn0.mW_HHaGu6BAwtJI76l4YRO97-zUOH_B6zyR1CM4iVVglIndpzasviLKoDL8QXlgxkdT-saNZw3JmNwMMacVqDQ';

const db = createClient({
    url: TURSO_URL,
    authToken: TURSO_AUTH_TOKEN
});

const DEFAULT_SENDER_NAME = 'Zerionix Systems';
const DEFAULT_SENDER_EMAIL = 'hello@zerionixsystems.com';
const LEGACY_EMAIL_TEMPLATE_SETTINGS = {
    badgeText: 'Premium Brand Communication',
    headline: `A polished message from ${DEFAULT_SENDER_NAME}`,
    introText: 'Professionally presented outreach with a refined dark theme, modern brand accents, and clear, readable content designed to leave a strong first impression.',
    footerText: `${DEFAULT_SENDER_NAME} · Strategic systems, modern communication, and premium presentation.`
};
const DEFAULT_EMAIL_TEMPLATE_SETTINGS = {
    logoUrl: '',
    badgeText: 'Agency Partnership Outreach',
    headline: '',
    introText: '',
    footerText: 'zerionixsystems.com'
};

function normalizeEmailTemplateSettings(settings = {}) {
    const normalized = {
        ...DEFAULT_EMAIL_TEMPLATE_SETTINGS,
        ...(settings || {})
    };

    if (normalized.badgeText === LEGACY_EMAIL_TEMPLATE_SETTINGS.badgeText) {
        normalized.badgeText = DEFAULT_EMAIL_TEMPLATE_SETTINGS.badgeText;
    }

    if (normalized.headline === LEGACY_EMAIL_TEMPLATE_SETTINGS.headline) {
        normalized.headline = DEFAULT_EMAIL_TEMPLATE_SETTINGS.headline;
    }

    if (normalized.introText === LEGACY_EMAIL_TEMPLATE_SETTINGS.introText) {
        normalized.introText = DEFAULT_EMAIL_TEMPLATE_SETTINGS.introText;
    }

    if (normalized.footerText === LEGACY_EMAIL_TEMPLATE_SETTINGS.footerText) {
        normalized.footerText = DEFAULT_EMAIL_TEMPLATE_SETTINGS.footerText;
    }

    return normalized;
}

function parseEmailTemplateSettings(rawSettings) {
    if (!rawSettings) return normalizeEmailTemplateSettings();

    if (typeof rawSettings === 'object') {
        return normalizeEmailTemplateSettings(rawSettings);
    }

    try {
        return normalizeEmailTemplateSettings(JSON.parse(rawSettings));
    } catch (error) {
        console.warn('Failed to parse email template settings, using defaults.', error);
        return normalizeEmailTemplateSettings();
    }
}

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
                country TEXT,
                profile_link TEXT,
                socials TEXT,
                nature TEXT,
                work_nature TEXT,
                status TEXT,
                next_follow_up TEXT,
                notes TEXT,
                created_at TEXT
            )
        `);
        
        // Helper to safely add columns
        const addCol = async (table, col) => {
            try { await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`); } 
            catch (e) { if (!e.message?.includes('duplicate column')) console.log(`Migration info (${col}):`, e.message); }
        };

        // Add columns if they don't exist (Migration)
        await addCol('leads', 'country');
        await addCol('leads', 'city');
        await addCol('leads', 'profile_link');

        // Create Settings Table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS settings (
                id TEXT PRIMARY KEY,
                service_id TEXT,
                template_id TEXT,
                public_key TEXT,
                sender_name TEXT,
                api_key TEXT,
                sender_email TEXT,
                smtp_user TEXT,
                smtp_key TEXT,
                imap_host TEXT,
                imap_port TEXT,
                email_template TEXT
            )
        `);
        
        // Migration: Check if we need to drop old settings table or alter it
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN service_id TEXT");
        } catch (e) {}
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN template_id TEXT");
        } catch (e) {}
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN public_key TEXT");
        } catch (e) {}

        // Migration for Brevo
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN api_key TEXT");
        } catch (e) {}
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN sender_email TEXT");
        } catch (e) {}
        
        // Migration for SMTP (User/Pass)
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN smtp_user TEXT");
        } catch(e) {}
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN smtp_key TEXT");
        } catch(e) {}

        // Migration for IMAP
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN imap_host TEXT");
        } catch (e) {}
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN imap_port TEXT");
        } catch (e) {}
        try {
            await db.execute("ALTER TABLE settings ADD COLUMN email_template TEXT");
        } catch (e) {}
 
        console.log("Database initialized");
        await loadSettings(); // Load settings first
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
const importBtn = document.getElementById('importBtn');
const csvInput = document.getElementById('csvInput');
const syncRepliesBtn = document.getElementById('syncRepliesBtn');
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

// Tag Input Elements
const socialsContainer = document.getElementById('socialsContainer');
const socialsInput = document.getElementById('socialsInput');
const addSocialBtn = document.getElementById('addSocialBtn');
const socialsHidden = document.getElementById('socials');
let socialTags = [];

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
const storedEmailSettings = JSON.parse(localStorage.getItem('emailSettings')) || {};
let emailSettings = {
    senderName: DEFAULT_SENDER_NAME,
    senderEmail: DEFAULT_SENDER_EMAIL,
    templateSettings: normalizeEmailTemplateSettings(),
    ...storedEmailSettings,
    templateSettings: parseEmailTemplateSettings(storedEmailSettings.templateSettings)
};
let isEditing = false;
let currentViewLeadId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initDB(); // Initialize DB and load leads/settings
    renderCampaigns();
});

// ... existing code ...

// Event Listeners
addLeadBtn.addEventListener('click', () => openModal());
createCampaignBtn.addEventListener('click', () => openCampaignModal());
exportBtn.addEventListener('click', exportToCSV);
importBtn.addEventListener('click', () => csvInput.click());
csvInput.addEventListener('change', handleCSVImport);
syncRepliesBtn.addEventListener('click', syncReplies);
cancelBtn.addEventListener('click', closeModalFn);
cancelCampaignBtn.addEventListener('click', closeCampaignModalFn);
closeModal.addEventListener('click', closeModalFn);
closeNotesModal.addEventListener('click', closeNotesModalFn);
closeCampaignModal.addEventListener('click', closeCampaignModalFn);

// Helper functions (defined before usage)
function switchView(viewName) {
    // Hide all views
    Object.values(views).forEach(el => el.style.display = 'none');
    // Show selected view
    if (views[viewName]) {
        views[viewName].style.display = 'block';
    }
    
    // Update active state in sidebar
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
    const activeLi = document.querySelector(`.sidebar li[onclick*="'${viewName}'"]`);
    if (activeLi) activeLi.classList.add('active');

    // Update active state in bottom nav
    document.querySelectorAll('.bottom-nav-item').forEach(div => div.classList.remove('active'));
    const activeDiv = document.querySelector(`.bottom-nav-item[onclick*="'${viewName}'"]`);
    if (activeDiv) activeDiv.classList.add('active');
}

// Make global so HTML onclick works
window.switchView = switchView;

function openCampaignModal() {
    campaignModal.style.display = 'block';
    updateRecipientCount(); // Update initial count
}

function closeCampaignModalFn() {
    campaignModal.style.display = 'none';
}

function applyLeadPlaceholders(template, lead) {
    if (!template) return '';

    const values = {
        name: lead?.name?.trim() || 'there',
        company: lead?.company?.trim() || ''
    };

    return Object.entries(values).reduce((output, [key, value]) => {
        return output.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
    }, template);
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildEmailMessageMarkup(message) {
    const safeMessage = escapeHtml(message).trim();

    if (!safeMessage) {
        return '<p style="margin: 0; font-size: 16px; line-height: 1.8; color: #cbd5e1;">We wanted to reach out from Zerionix Systems.</p>';
    }

    return safeMessage
        .split(/\n\s*\n/)
        .map(paragraph => paragraph.replace(/\n/g, '<br>'))
        .map(paragraph => `<p style="margin: 0 0 18px; font-size: 16px; line-height: 1.8; color: #cbd5e1;">${paragraph}</p>`)
        .join('');
}

function buildEmailTextContent(message, senderName, senderEmail) {
    const effectiveSenderName = senderName || DEFAULT_SENDER_NAME;
    const effectiveSenderEmail = senderEmail || DEFAULT_SENDER_EMAIL;
    const footerLines = [
        '',
        'Best regards,',
        effectiveSenderName,
        effectiveSenderEmail,
        'zerionixsystems.com'
    ];

    return `${message.trim()}\n${footerLines.join('\n')}`;
}

function sanitizeHttpUrl(value = '') {
    const trimmed = String(value).trim();
    if (!trimmed) return '';

    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
    } catch {
        return '';
    }
}

function buildZerionixLogoMarkup(logoUrl = '') {
    const safeLogoUrl = sanitizeHttpUrl(logoUrl);

    if (safeLogoUrl) {
        return `
            <img
                src="${escapeHtml(safeLogoUrl)}"
                alt="${DEFAULT_SENDER_NAME} logo"
                style="display: block; max-width: 220px; width: auto; max-height: 56px; height: auto;"
            >
        `;
    }

    return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td style="padding-right: 12px; vertical-align: middle;">
                    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
                        <rect x="4" y="4" width="40" height="40" rx="14" fill="#0f172a" fill-opacity="0.82" stroke="#334155"></rect>
                        <path d="M15.5 16h17L18.5 32h17" fill="none" stroke="#818cf8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>
                        <path d="M34.5 12.5c3.2 1.4 5.5 4.6 5.5 8.3 0 5.1-4.1 9.2-9.2 9.2" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round"></path>
                        <circle cx="35.2" cy="12.8" r="2.8" fill="#22d3ee"></circle>
                    </svg>
                </td>
                <td style="vertical-align: middle;">
                    <div style="font-family: Inter, Segoe UI, Arial, sans-serif; font-size: 24px; font-weight: 700; line-height: 1; color: #f8fafc; letter-spacing: -0.02em;">Zerionix</div>
                    <div style="font-family: Inter, Segoe UI, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; color: #94a3b8; letter-spacing: 0.35em; text-transform: uppercase; margin-top: 8px;">Systems</div>
                </td>
            </tr>
        </table>
    `;
}

function buildCampaignEmailTemplate({ lead, message, senderName, senderEmail, templateSettings }) {
    const normalizedTemplateSettings = normalizeEmailTemplateSettings(templateSettings);
    const badgeText = escapeHtml(applyLeadPlaceholders(normalizedTemplateSettings.badgeText, lead));
    const headline = escapeHtml(applyLeadPlaceholders(normalizedTemplateSettings.headline, lead));
    const introText = escapeHtml(applyLeadPlaceholders(normalizedTemplateSettings.introText, lead));
    const footerText = escapeHtml(applyLeadPlaceholders(normalizedTemplateSettings.footerText, lead));
    const badgeMarkup = badgeText
        ? `<div style="margin-top: 18px; display: inline-block; padding: 6px 12px; border-radius: 999px; background-color: rgba(99, 102, 241, 0.12); color: #c7d2fe; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">${badgeText}</div>`
        : '';
    const headlineMarkup = headline
        ? `<div style="margin-top: 14px; font-size: 24px; line-height: 1.3; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em;">${headline}</div>`
        : '';
    const introMarkup = introText
        ? `<div style="margin-top: 10px; font-size: 15px; line-height: 1.7; color: #cbd5e1; max-width: 520px;">${introText}</div>`
        : '';
    const preheader = escapeHtml(
        message.replace(/\s+/g, ' ').trim().slice(0, 140) || `A message from ${DEFAULT_SENDER_NAME}`
    );
    const messageMarkup = buildEmailMessageMarkup(message);
    const replyFrom = escapeHtml(senderName || DEFAULT_SENDER_NAME);
    const replyEmail = escapeHtml(senderEmail || DEFAULT_SENDER_EMAIL);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${DEFAULT_SENDER_NAME}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: Inter, Segoe UI, Arial, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">${preheader}</div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; background-color: #020617; margin: 0; padding: 0;">
        <tr>
            <td align="center" style="padding: 32px 16px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 640px; width: 100%;">
                    <tr>
                        <td style="padding-bottom: 18px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border: 1px solid #334155; border-radius: 20px; background-color: #0f172a; background-image: linear-gradient(135deg, rgba(99,102,241,0.14), rgba(6,182,212,0.08), rgba(139,92,246,0.08));">
                                <tr>
                                    <td style="padding: 24px 24px 22px;">
                                        ${buildZerionixLogoMarkup(normalizedTemplateSettings.logoUrl)}
                                        <div style="margin-top: 12px; font-size: 12px; line-height: 1.6; color: #94a3b8;">zerionixsystems.com</div>
                                        ${badgeMarkup}
                                        ${headlineMarkup}
                                        ${introMarkup}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td>
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border: 1px solid #334155; border-radius: 20px; background-color: #0f172a;">
                                <tr>
                                    <td style="padding: 28px 24px 12px;">
                                        ${messageMarkup}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 6px 24px 24px;">
                                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border: 1px solid #334155; border-radius: 16px; background-color: #0b1223;">
                                            <tr>
                                                <td style="padding: 18px 20px;">
                                                    <div style="font-size: 14px; line-height: 1.7; font-weight: 600; color: #f1f5f9;">Best regards,</div>
                                                    <div style="margin-top: 6px; font-size: 14px; line-height: 1.7; color: #cbd5e1;">${replyFrom}</div>
                                                    <div style="font-size: 13px; line-height: 1.7; color: #94a3b8;">${replyEmail}</div>
                                                    <div style="font-size: 13px; line-height: 1.7; color: #94a3b8;">zerionixsystems.com</div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 18px 10px 0; text-align: center; font-size: 12px; line-height: 1.7; color: #94a3b8;">
                            ${footerText}
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

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









// Tag Input Logic
socialsContainer.addEventListener('click', (e) => {
    // Only focus input if clicking background, not buttons
    if (e.target === socialsContainer || e.target === socialsInput) {
        socialsInput.focus();
    }
});

// Add button click handler
addSocialBtn.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent form submission
    addSocialTag(socialsInput.value);
    socialsInput.value = '';
    socialsInput.focus();
});

socialsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addSocialTag(socialsInput.value);
        socialsInput.value = '';
    } else if (e.key === 'Backspace' && socialsInput.value === '' && socialTags.length > 0) {
        removeSocialTag(socialTags.length - 1);
    }
});

function addSocialTag(text) {
    const tag = text.trim();
    if (tag && !socialTags.includes(tag)) {
        socialTags.push(tag);
        renderSocialTags();
        updateHiddenSocials();
    }
}

function removeSocialTag(index) {
    socialTags.splice(index, 1);
    renderSocialTags();
    updateHiddenSocials();
}

function renderSocialTags() {
    // Remove existing tags from DOM but keep input
    const tags = socialsContainer.querySelectorAll('.tag-item');
    tags.forEach(t => t.remove());

    socialTags.forEach((tag, index) => {
        const tagEl = document.createElement('div');
        tagEl.className = 'tag-item';
        tagEl.innerHTML = `
            <span>${tag}</span>
            <span class="remove-tag" onclick="removeSocialTag(${index})">&times;</span>
        `;
        socialsContainer.insertBefore(tagEl, socialsInput);
    });
}

function updateHiddenSocials() {
    socialsHidden.value = JSON.stringify(socialTags);
}

function updateRecipientCount() {
    // Get selected values from multi-select
    const selectedOptions = Array.from(targetAudience.selectedOptions).map(opt => opt.value).filter(v => v !== 'All');
    
    // If 'All' is selected or nothing selected, treat as All
    const isAll = targetAudience.selectedOptions[0]?.value === 'All' || selectedOptions.length === 0;

    const count = getRecipients(isAll ? ['All'] : selectedOptions).length;
    recipientCount.textContent = `Will send to approx. ${count} recipients`;
}

function getRecipients(filters) {
    if (filters.includes('All')) {
        return leads.filter(l => l.email);
    }

    return leads.filter(lead => {
        if (!lead.email) return false;
        
        // Match ANY of the selected criteria
        return filters.some(filter => {
            if (filter === 'Client' || filter === 'Agency') return lead.nature === filter;
            return lead.status === filter;
        });
    });
}

async function sendCampaign() {
    const selectedOptions = Array.from(targetAudience.selectedOptions).map(opt => opt.value).filter(v => v !== 'All');
    const isAll = targetAudience.selectedOptions[0]?.value === 'All' || selectedOptions.length === 0;
    
    const recipients = getRecipients(isAll ? ['All'] : selectedOptions);
    if (recipients.length === 0) {
        alert('No recipients selected!');
        return;
    }

    // Ensure settings are loaded from DB if missing locally
    if (!emailSettings.smtpKey) {
        console.log("Settings missing locally, attempting to fetch from Turso...");
        await loadSettings();
    }

    if (!emailSettings.smtpUser || !emailSettings.smtpKey || !emailSettings.senderEmail) {
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
        const subject = applyLeadPlaceholders(campaignData.subjectTemplate, lead);
        const personalizedMessage = applyLeadPlaceholders(document.getElementById('emailBody').value, lead);
        const htmlContent = buildCampaignEmailTemplate({
            lead,
            message: personalizedMessage,
            senderName: emailSettings.senderName,
            senderEmail: emailSettings.senderEmail,
            templateSettings: emailSettings.templateSettings
        });
        const textContent = buildEmailTextContent(
            personalizedMessage,
            emailSettings.senderName,
            emailSettings.senderEmail
        );

        // Call Backend API
        try {
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    smtpUser: emailSettings.smtpUser,
                    smtpKey: emailSettings.smtpKey,
                    to: lead.email,
                    subject: subject,
                    htmlContent: htmlContent,
                    textContent: textContent,
                    senderName: emailSettings.senderName,
                    senderEmail: emailSettings.senderEmail,
                    tag: campaignData.id // Pass Campaign ID as tag for tracking
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                successCount++;
                console.log(`[SMTP] Sent to ${lead.email}`);
                
                // Update Lead Status to "Contacted" if it's currently "New"
                if (lead.status === 'New') {
                    lead.status = 'Contacted';
                    try {
                        await db.execute({
                            sql: "UPDATE leads SET status = ? WHERE id = ?",
                            args: ['Contacted', lead.id]
                        });
                    } catch(e) { console.error("Status Update Error", e); }
                }

            } else {
                failCount++;
                console.error(`[SMTP Error] ${lead.email}:`, result);
            }
        } catch (error) {
            failCount++;
            console.error(`[Network Error] ${lead.email}:`, error);
        }

        // Rate limiting (be gentle)
        await new Promise(resolve => setTimeout(resolve, 300));
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
    const list = document.getElementById('campaignsList');
    list.innerHTML = '';
    
    campaigns.forEach(c => {
        const row = document.createElement('tr');
        
        // Calculate percentages if stats available (default to 0/0)
        let openRate = '0%';
        let clickRate = '0%';
        let statsHtml = '<span class="status-badge status-new">No Data</span>';

        if (c.stats) {
            const delivered = c.stats.delivered || 1; // avoid div by zero
            openRate = Math.round((c.stats.opens / delivered) * 100) + '%';
            clickRate = Math.round((c.stats.clicks / delivered) * 100) + '%';
            
            statsHtml = `
                <div style="font-size: 0.85em; display: flex; gap: 10px;">
                    <span title="Delivered" style="color: var(--success-color);"><i class="fas fa-check-circle"></i> ${c.stats.delivered}</span>
                    <span title="Opened" style="color: var(--warning-color);"><i class="fas fa-envelope-open"></i> ${c.stats.opens} (${openRate})</span>
                    <span title="Clicked" style="color: var(--primary-color);"><i class="fas fa-mouse-pointer"></i> ${c.stats.clicks} (${clickRate})</span>
                </div>
            `;
        }

        row.innerHTML = `
            <td>${c.name}</td>
            <td>${c.subject}</td>
            <td>${c.status}</td>
            <td>${new Date(c.sentDate).toLocaleDateString()}</td>
            <td>${c.recipientCount}</td>
            <td>
                ${statsHtml}
                <button class="btn-secondary btn-sm" onclick="refreshCampaignStats('${c.id}')" title="Refresh Stats"><i class="fas fa-sync-alt"></i></button>
            </td>
        `;
        list.appendChild(row);
    });
}

// Add function to global scope so onclick works
window.refreshCampaignStats = async function(campaignId) {
    if (!emailSettings.apiKey) {
        alert("Please configure your Brevo API Key in Settings to fetch statistics.");
        return;
    }
    
    const btn = event.currentTarget;
    const icon = btn.querySelector('i');
    icon.classList.add('fa-spin');

    try {
        // 1. Fetch Aggregated Stats
        const statsResponse = await fetch('/api/get-stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: emailSettings.apiKey,
                tag: campaignId
            })
        });

        const statsResult = await statsResponse.json();

        if (statsResponse.ok && statsResult.success) {
            // Update campaign stats in local storage
            const campaignIndex = campaigns.findIndex(c => c.id === campaignId);
            if (campaignIndex !== -1) {
                campaigns[campaignIndex].stats = statsResult.stats;
                localStorage.setItem('campaigns', JSON.stringify(campaigns));
            }
        }

        // 2. Fetch Granular Events to Update Lead Status
        const eventsResponse = await fetch('/api/get-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: emailSettings.apiKey,
                tag: campaignId
            })
        });

        const eventsResult = await eventsResponse.json();

        if (eventsResponse.ok && eventsResult.success && eventsResult.events.length > 0) {
            let updatedLeads = 0;
            
            // Process events
            // Priority: Clicked > Opened > Bounced > Contacted
            for (const event of eventsResult.events) {
                const lead = leads.find(l => l.email.toLowerCase() === event.email.toLowerCase());
                
                if (lead) {
                    let newStatus = null;
                    
                    if (event.event === 'clicks') {
                        if (lead.status !== 'Lead Clicked' && lead.status !== 'Qualified' && lead.status !== 'Proposal' && lead.status !== 'Won') {
                            newStatus = 'Lead Clicked';
                        }
                    } else if (event.event === 'opened') {
                        if (lead.status !== 'Lead Clicked' && lead.status !== 'Email Opened' && lead.status !== 'Qualified' && lead.status !== 'Proposal' && lead.status !== 'Won') {
                            newStatus = 'Email Opened';
                        }
                    } else if (event.event === 'hardBounce' || event.event === 'softBounce' || event.event === 'blocked') {
                        if (lead.status !== 'Bounced') {
                            newStatus = 'Bounced';
                        }
                    }

                    if (newStatus) {
                        lead.status = newStatus;
                        await db.execute({
                            sql: "UPDATE leads SET status = ? WHERE id = ?",
                            args: [newStatus, lead.id]
                        });
                        updatedLeads++;
                    }
                }
            }
            
            if (updatedLeads > 0) {
                alert(`Stats Updated. Also updated status for ${updatedLeads} leads based on interactions!`);
            }
        }

        renderCampaigns();
        renderLeads(); // Refresh leads table to show new statuses

    } catch (error) {
        console.error("Network Error:", error);
        alert("Network error while fetching stats.");
    } finally {
        icon.classList.remove('fa-spin');
    }
};

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
            emailSettings = {
                ...emailSettings,
                apiKey: row.api_key,
                smtpUser: row.smtp_user,
                smtpKey: row.smtp_key,
                imapHost: row.imap_host,
                imapPort: row.imap_port,
                senderEmail: row.sender_email || DEFAULT_SENDER_EMAIL,
                senderName: row.sender_name || DEFAULT_SENDER_NAME,
                templateSettings: parseEmailTemplateSettings(row.email_template)
            };
            console.log("Email Settings loaded from Turso database");
        }

        // Update UI if elements exist
        if (document.getElementById('smtpUser')) {
            document.getElementById('apiKey').value = emailSettings.apiKey || '';
            document.getElementById('smtpUser').value = emailSettings.smtpUser || '';
            document.getElementById('smtpKey').value = emailSettings.smtpKey || '';
            document.getElementById('imapHost').value = emailSettings.imapHost || 'imap.brevo.com';
            document.getElementById('imapPort').value = emailSettings.imapPort || '993';
            document.getElementById('senderEmail').value = emailSettings.senderEmail || DEFAULT_SENDER_EMAIL;
            document.getElementById('senderName').value = emailSettings.senderName || DEFAULT_SENDER_NAME;
            document.getElementById('templateLogoUrl').value = emailSettings.templateSettings.logoUrl || '';
            document.getElementById('templateBadgeText').value = emailSettings.templateSettings.badgeText || DEFAULT_EMAIL_TEMPLATE_SETTINGS.badgeText;
            document.getElementById('templateHeadline').value = emailSettings.templateSettings.headline || DEFAULT_EMAIL_TEMPLATE_SETTINGS.headline;
            document.getElementById('templateIntroText').value = emailSettings.templateSettings.introText || DEFAULT_EMAIL_TEMPLATE_SETTINGS.introText;
            document.getElementById('templateFooterText').value = emailSettings.templateSettings.footerText || DEFAULT_EMAIL_TEMPLATE_SETTINGS.footerText;
        }
    } catch (error) {
        console.error("Load Settings Error:", error);
    }
}

async function saveSettings() {
    const newSettings = {
        apiKey: document.getElementById('apiKey').value,
        smtpUser: document.getElementById('smtpUser').value,
        smtpKey: document.getElementById('smtpKey').value,
        imapHost: document.getElementById('imapHost').value,
        imapPort: document.getElementById('imapPort').value,
        senderEmail: document.getElementById('senderEmail').value.trim() || DEFAULT_SENDER_EMAIL,
        senderName: document.getElementById('senderName').value.trim() || DEFAULT_SENDER_NAME,
        templateSettings: normalizeEmailTemplateSettings({
            logoUrl: document.getElementById('templateLogoUrl').value.trim(),
            badgeText: document.getElementById('templateBadgeText').value.trim() || DEFAULT_EMAIL_TEMPLATE_SETTINGS.badgeText,
            headline: document.getElementById('templateHeadline').value.trim() || DEFAULT_EMAIL_TEMPLATE_SETTINGS.headline,
            introText: document.getElementById('templateIntroText').value.trim() || DEFAULT_EMAIL_TEMPLATE_SETTINGS.introText,
            footerText: document.getElementById('templateFooterText').value.trim() || DEFAULT_EMAIL_TEMPLATE_SETTINGS.footerText
        })
    };

    try {
        const check = await db.execute("SELECT id FROM settings WHERE id = 'default'");
        
        if (check.rows.length > 0) {
            try {
                await db.execute({
                    sql: "UPDATE settings SET api_key=?, smtp_user=?, smtp_key=?, imap_host=?, imap_port=?, sender_email=?, sender_name=?, email_template=? WHERE id='default'",
                    args: [newSettings.apiKey, newSettings.smtpUser, newSettings.smtpKey, newSettings.imapHost, newSettings.imapPort, newSettings.senderEmail, newSettings.senderName, JSON.stringify(newSettings.templateSettings)]
                });
            } catch (updateError) {
                // If update fails due to missing column, try to migrate and retry
                if (updateError.message.includes("no such column")) {
                    console.log("Missing columns detected during save, attempting repair...");
                    try { await db.execute("ALTER TABLE settings ADD COLUMN smtp_user TEXT"); } catch(e) {}
                    try { await db.execute("ALTER TABLE settings ADD COLUMN smtp_key TEXT"); } catch(e) {}
                    try { await db.execute("ALTER TABLE settings ADD COLUMN imap_host TEXT"); } catch(e) {}
                    try { await db.execute("ALTER TABLE settings ADD COLUMN imap_port TEXT"); } catch(e) {}
                    try { await db.execute("ALTER TABLE settings ADD COLUMN email_template TEXT"); } catch(e) {}
                    
                    // Retry update
                    await db.execute({
                        sql: "UPDATE settings SET api_key=?, smtp_user=?, smtp_key=?, imap_host=?, imap_port=?, sender_email=?, sender_name=?, email_template=? WHERE id='default'",
                        args: [newSettings.apiKey, newSettings.smtpUser, newSettings.smtpKey, newSettings.imapHost, newSettings.imapPort, newSettings.senderEmail, newSettings.senderName, JSON.stringify(newSettings.templateSettings)]
                    });
                } else {
                    throw updateError;
                }
            }
        } else {
            // Same check for INSERT
             try {
                await db.execute({
                    sql: "INSERT INTO settings (id, api_key, smtp_user, smtp_key, imap_host, imap_port, sender_email, sender_name, email_template) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)",
                    args: [newSettings.apiKey, newSettings.smtpUser, newSettings.smtpKey, newSettings.imapHost, newSettings.imapPort, newSettings.senderEmail, newSettings.senderName, JSON.stringify(newSettings.templateSettings)]
                });
            } catch (insertError) {
                if (insertError.message.includes("no such column")) {
                    console.log("Missing columns detected during insert, attempting repair...");
                    try { await db.execute("ALTER TABLE settings ADD COLUMN api_key TEXT"); } catch(e) {}
                    try { await db.execute("ALTER TABLE settings ADD COLUMN smtp_user TEXT"); } catch(e) {}
                    try { await db.execute("ALTER TABLE settings ADD COLUMN smtp_key TEXT"); } catch(e) {}
                    try { await db.execute("ALTER TABLE settings ADD COLUMN imap_host TEXT"); } catch(e) {}
                    try { await db.execute("ALTER TABLE settings ADD COLUMN imap_port TEXT"); } catch(e) {}
                    try { await db.execute("ALTER TABLE settings ADD COLUMN email_template TEXT"); } catch(e) {}
                    
                    // Retry insert
                    await db.execute({
                        sql: "INSERT INTO settings (id, api_key, smtp_user, smtp_key, imap_host, imap_port, sender_email, sender_name, email_template) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)",
                        args: [newSettings.apiKey, newSettings.smtpUser, newSettings.smtpKey, newSettings.imapHost, newSettings.imapPort, newSettings.senderEmail, newSettings.senderName, JSON.stringify(newSettings.templateSettings)]
                    });
                } else {
                    throw insertError;
                }
            }
        }

        emailSettings = newSettings; // Update local state
        localStorage.setItem('emailSettings', JSON.stringify(emailSettings));
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
        document.getElementById('company').value = '';
        document.getElementById('city').value = '';
        document.getElementById('country').value = '';
        document.getElementById('status').value = 'New';
        
        // Reset tags
        socialTags = [];
        renderSocialTags();
        updateHiddenSocials();
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
        country: document.getElementById('country').value,
        city: document.getElementById('city').value,
        socials: document.getElementById('socials').value, // Use the hidden input which contains JSON string
        nature: document.getElementById('nature').value,
        workNature: document.getElementById('workNature').value,
        status: document.getElementById('status').value,
        nextFollowUp: document.getElementById('nextFollowUp').value,
        notes: JSON.stringify(currentNotes), // Store notes as JSON string
        createdAt: isNew ? new Date().toISOString() : (leads.find(l => l.id === id)?.createdAt || new Date().toISOString())
    };

    // Check for duplicates
    if (isNew) {
        const existingEmail = leads.find(l => l.email && l.email.toLowerCase() === leadData.email.toLowerCase());
        const existingCompany = leadData.company ? leads.find(l => l.company && l.company.toLowerCase() === leadData.company.toLowerCase()) : null;

        if (existingEmail) {
            alert(`Duplicate Error: A lead with email "${leadData.email}" already exists.`);
            return;
        }
        if (existingCompany) {
            alert(`Duplicate Error: A lead with company "${leadData.company}" already exists.`);
            return;
        }
    }

    try {
        if (isNew) {
            await db.execute({
                sql: `INSERT INTO leads (id, name, email, phone, website, company, country, city, socials, nature, work_nature, status, next_follow_up, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [leadData.id, leadData.name, leadData.email, leadData.phone, leadData.website, leadData.company, leadData.country, leadData.city, leadData.socials, leadData.nature, leadData.workNature, leadData.status, leadData.nextFollowUp, leadData.notes, leadData.createdAt]
            });
        } else {
            await db.execute({
                sql: `UPDATE leads SET name=?, email=?, phone=?, website=?, company=?, country=?, city=?, socials=?, nature=?, work_nature=?, status=?, next_follow_up=?, notes=? WHERE id=?`,
                args: [leadData.name, leadData.email, leadData.phone, leadData.website, leadData.company, leadData.country, leadData.city, leadData.socials, leadData.nature, leadData.workNature, leadData.status, leadData.nextFollowUp, leadData.notes, leadData.id]
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

// Make functions global so HTML onclick works
window.viewLead = viewLead;
window.editLead = editLead;
window.deleteLead = deleteLead;
window.switchView = switchView;

function viewLead(id) {
    const lead = leads.find(l => l.id === id);
    currentViewLeadId = id;
    
    // Format socials for display
    let socialsHtml = '-';
    try {
        const tags = lead.socials ? JSON.parse(lead.socials) : [];
        if (Array.isArray(tags) && tags.length > 0) {
            socialsHtml = tags.map(t => {
                const url = t.startsWith('http') ? t : `https://${t}`;
                return `<a href="${url}" target="_blank" class="badge badge-agency" style="margin-right: 5px; text-decoration: none;">${new URL(url).hostname.replace('www.','')}</a>`;
            }).join('');
        } else if (typeof tags === 'string' && tags) {
             // Legacy fallback
             socialsHtml = tags;
        }
    } catch (e) {
        socialsHtml = lead.socials || '-';
    }

    // Populate details
    leadDetails.innerHTML = `
        <div class="lead-detail-row"><span class="lead-detail-label">Name:</span> ${lead.name}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Company:</span> ${lead.company}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Email:</span> <a href="mailto:${lead.email}">${lead.email}</a></div>
        <div class="lead-detail-row"><span class="lead-detail-label">Phone:</span> ${lead.phone}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Location:</span> ${lead.city ? lead.city + ', ' : ''}${lead.country || '-'}</div>
        <div class="lead-detail-row"><span class="lead-detail-label">Website:</span> <a href="${lead.website}" target="_blank">${lead.website}</a></div>
        <div class="lead-detail-row"><span class="lead-detail-label">Socials:</span> ${socialsHtml}</div>
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

            // Added data-label attributes for mobile card layout
            row.innerHTML = `
                <td data-label="Name">${lead.name}</td>
                <td data-label="Company">${lead.company}</td>
                <td data-label="Status">${statusBadge}</td>
                <td data-label="Follow-up">${lead.nextFollowUp || '-'}</td>
                <td data-label="Type">${natureBadge}</td>
                <td data-label="Actions">
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

async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split('\n').map(row => row.split(','));
        
        // Remove header row if present (assuming first row is header)
        if (rows.length > 0 && rows[0][0].toLowerCase().includes('name')) {
            rows.shift();
        }

        let successCount = 0;
        let failCount = 0;

        for (const row of rows) {
            if (row.length < 2) continue; // Skip empty rows

            // Simple CSV parsing (this assumes standard CSV without complex quoting)
            // Mapping: Name, Email, Phone, Website, Company, Country, City, Nature
            const [name, email, phone, website, company, country, city, nature] = row.map(cell => cell ? cell.trim().replace(/^"|"$/g, '') : '');

            if (!name || !email) {
                console.warn("Skipping invalid row:", row);
                failCount++;
                continue;
            }

            // Check duplicate email locally first
            if (leads.some(l => l.email.toLowerCase() === email.toLowerCase())) {
                console.warn("Duplicate email:", email);
                failCount++;
                continue;
            }

            const leadData = {
                id: crypto.randomUUID(),
                name: name,
                email: email,
                phone: phone || '',
                website: website || '',
                company: company || '',
                country: country || '',
                city: city || '',
                socials: '[]',
                nature: nature || 'Client',
                workNature: '',
                status: 'New',
                nextFollowUp: '',
                notes: '[]',
                createdAt: new Date().toISOString()
            };

            try {
                await db.execute({
                    sql: `INSERT INTO leads (id, name, email, phone, website, company, country, city, socials, nature, work_nature, status, next_follow_up, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [leadData.id, leadData.name, leadData.email, leadData.phone, leadData.website, leadData.company, leadData.country, leadData.city, leadData.socials, leadData.nature, leadData.workNature, leadData.status, leadData.nextFollowUp, leadData.notes, leadData.createdAt]
                });
                successCount++;
            } catch (error) {
                console.error("Import Error:", error);
                failCount++;
            }
        }

        alert(`Import Complete!\nSuccess: ${successCount}\nFailed/Duplicate: ${failCount}`);
        csvInput.value = ''; // Reset input
        await renderLeads();
        updateStats();
    };
    reader.readAsText(file);
}

async function syncReplies() {
    if (!emailSettings.smtpUser || !emailSettings.smtpKey) {
        alert('Please configure SMTP settings first to check for replies.');
        switchView('settings');
        return;
    }

    const btn = document.getElementById('syncRepliesBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
    btn.disabled = true;

    try {
        // Collect all lead emails to filter relevant replies
        const leadEmails = leads.map(l => l.email).filter(e => e);
        
        const response = await fetch('/api/check-replies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                smtpUser: emailSettings.smtpUser,
                smtpKey: emailSettings.smtpKey,
                imapHost: emailSettings.imapHost || 'imap.brevo.com',
                imapPort: emailSettings.imapPort || 993,
                leadsEmails: leadEmails
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            let newRepliesCount = 0;
            
            for (const reply of result.replies) {
                // Find the lead
                const lead = leads.find(l => l.email.toLowerCase() === reply.from.toLowerCase());
                
                if (lead) {
                    // Check if note already exists (simple check by date/subject to avoid dupes)
                    const noteExists = lead.notes && lead.notes.some(n => 
                        n.text.includes(reply.subject) && n.date === reply.date
                    );

                    if (!noteExists) {
                        const noteText = `[Email Reply] Subject: ${reply.subject}\n\n${reply.body}`;
                        await addNote(lead.id, noteText);
                        
                        // Optionally update status to "Contacted" or "Negotiation" if it was "New"
                        if (lead.status === 'New' || lead.status === 'Contacted') {
                             // We could auto-update status here
                        }
                        newRepliesCount++;
                    }
                }
            }

            if (newRepliesCount > 0) {
                alert(`Sync Complete! Found ${newRepliesCount} new replies from leads.`);
                renderLeads(); // Refresh UI
            } else {
                alert('Sync Complete. No new replies found from existing leads.');
            }

        } else {
            console.error("Sync Error:", result);
            alert(`Sync Failed: ${result.error}`);
        }

    } catch (error) {
        console.error("Sync Network Error:", error);
        alert("Failed to sync replies. Check console.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
