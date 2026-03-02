export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { apiKey, to, subject, htmlContent, senderName, senderEmail } = req.body;

    if (!apiKey || !to || !subject || !htmlContent || !senderEmail) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: {
                    name: senderName || 'Lead Manager',
                    email: senderEmail
                },
                to: [{ email: to }],
                subject: subject,
                htmlContent: htmlContent
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.message || 'Failed to send email' });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Email sending error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
