import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { smtpUser, smtpKey, imapHost, imapPort, leadsEmails } = req.body;

    if (!smtpUser || !smtpKey || !imapHost) {
        return res.status(400).json({ error: 'Missing IMAP credentials' });
    }

    const config = {
        imap: {
            user: smtpUser,
            password: smtpKey,
            host: imapHost,
            port: imapPort || 993,
            tls: true,
            tlsOptions: { rejectUnauthorized: false }, // Useful for some servers
            authTimeout: 10000
        }
    };

    try {
        const connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        // Search for unseen messages or messages since last sync could be optimized
        // For now, let's fetch recent messages (last 24 hours)
        const delay = 24 * 3600 * 1000; 
        const yesterday = new Date();
        yesterday.setTime(Date.now() - delay);
        
        const searchCriteria = [
            ['SINCE', yesterday.toISOString()]
        ];
        
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT'],
            markSeen: false
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        const replies = [];

        for (const item of messages) {
            const headerPart = item.parts.find(p => p.which === 'HEADER');
            
            if (!headerPart || !headerPart.body.from || !headerPart.body.from.length) continue;

            const fromStr = headerPart.body.from[0]; // e.g., "John Doe <john@example.com>"
            // Extract email address
            const match = fromStr.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi);
            const fromEmail = match ? match[0].toLowerCase() : '';

            // Check if this email matches any of our leads
            if (leadsEmails.includes(fromEmail)) {
                // Get the text body
                const textPart = item.parts.find(p => p.which === 'TEXT');
                const body = textPart ? textPart.body : 'No content';

                replies.push({
                    from: fromEmail,
                    subject: headerPart.body.subject[0],
                    date: headerPart.body.date[0],
                    body: body.substring(0, 500) + '...' // Truncate for display
                });
            }
        }

        connection.end();
        return res.status(200).json({ success: true, replies });

    } catch (error) {
        console.error('IMAP Error:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch emails' });
    }
}
