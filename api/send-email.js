import nodemailer from 'nodemailer';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { smtpUser, smtpKey, to, subject, htmlContent, textContent, senderName, senderEmail, tag } = req.body;

    if (!smtpUser || !smtpKey || !to || !subject || !htmlContent || !senderEmail) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp-relay.brevo.com',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: smtpUser,
                pass: smtpKey,
            },
        });

        const mailOptions = {
            from: `"${senderName || 'Zerionix Systems'}" <${senderEmail}>`, // sender address
            to: to, // list of receivers
            subject: subject, // Subject line
            html: htmlContent, // html body
            text: textContent || undefined,
        };

        if (tag) {
            mailOptions.headers = {
                'X-Mailin-Tag': tag
            };
        }

        const info = await transporter.sendMail(mailOptions);

        return res.status(200).json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('Email sending error:', error);
        return res.status(500).json({ error: error.message || 'Failed to send email' });
    }
}
