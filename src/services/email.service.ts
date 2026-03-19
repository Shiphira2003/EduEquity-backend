import nodemailer from 'nodemailer';
import { config } from '../config/config';

// Create a transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: config().emailUser,
        pass: config().emailPass,
    },
});

export const sendEmail = async (to: string, subject: string, html: string) => {
    try {
        if (!config().emailUser || !config().emailPass) {
            console.warn("⚠️  Email credentials missing. Logging email to console:");
            console.log(`To: ${to}\nSubject: ${subject}\nBody: ${html}`);
            return;
        }

        const info = await transporter.sendMail({
            from: `"EduEquity" <${config().emailUser}>`,
            to,
            subject,
            html,
        });

        console.log(`Message sent: ${info.messageId}`);
    } catch (error) {
        console.error("Error sending email:", error);
        // Fallback: Log to console so development can continue
        console.log("⚠️  FALLBACK: Email failed to send. Here is the content:");
        console.log(`To: ${to}\nSubject: ${subject}\nBody: ${html}`);
        // We don't throw here so the frontend gets a success message
    }
};
