import nodemailer from 'nodemailer';
import { config } from '../config/config';
import { emailQueue } from './queue.service';

// Create transporter lazily so that credentials are picked up after dotenv loads
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
    if (!_transporter) {
        const cfg = config();
        _transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: cfg.emailUser,
                pass: cfg.emailPass,
            },
        });
    }
    return _transporter;
}

export const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
    const cfg = config();

    if (!cfg.emailUser || !cfg.emailPass) {
        console.warn('⚠️  Email credentials missing. Logging email to console:');
        console.log(`To: ${to}\nSubject: ${subject}\nBody: ${html}`);
        return;
    }

    try {
        const transporter = getTransporter();
        const info = await transporter.sendMail({
            from: `"BursarHub" <${cfg.emailUser}>`,
            to,
            subject,
            html,
        });
        console.log(`✅  Email sent: ${info.messageId} → ${to}`);
    } catch (error: any) {
        console.error('❌  Error sending email:', error.message || error);
        // Log content so development can continue without a crash
        console.log('⚠️  FALLBACK – email content:');
        console.log(`To: ${to}\nSubject: ${subject}`);
    }
};

// ─── Email Templates ────────────────────────────────────────────────────────

const BRAND_BLUE = '#2563eb';

const baseLayout = (bodyContent: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>BursarHub</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:${BRAND_BLUE};padding:28px 40px;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">BursarHub</span>
            <span style="color:#bfdbfe;font-size:14px;margin-left:10px;">Student Bursary Platform</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;color:#1f2937;font-size:15px;line-height:1.7;">
            ${bodyContent}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              © ${new Date().getFullYear()} BursarHub · Kenya NG-CDF Bursary Platform<br/>
              This is an automated message. Please do not reply directly to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// 1. Application Submitted
export const sendApplicationSubmittedEmail = (
    to: string,
    studentName: string,
    cycleYear: number
): void => {
    const subject = `Application Received – BursarHub ${cycleYear} Cycle`;
    const html = baseLayout(`
        <h2 style="color:${BRAND_BLUE};margin-top:0;">Application Received ✅</h2>
        <p>Dear <strong>${studentName}</strong>,</p>
        <p>We have successfully received your bursary application for the <strong>${cycleYear}</strong> funding cycle.</p>
        <p>Our vetting committee will review your submission. You can track your real-time status by logging into your student dashboard:</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="http://localhost:5173/student/track-status"
             style="background:${BRAND_BLUE};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Track My Application
          </a>
        </p>
        <p>Best Regards,<br/><strong>The BursarHub Team</strong></p>
    `);
    emailQueue.enqueue({ to, subject, html });
};

// 2. Application Approved
export const sendApplicationApprovedEmail = (
    to: string,
    studentName: string,
    cycleYear: number,
    amountAllocated: number | string
): void => {
    const subject = `Congratulations! Your Application is Approved – BursarHub ${cycleYear}`;
    const html = baseLayout(`
        <h2 style="color:#16a34a;margin-top:0;">Application Approved 🎉</h2>
        <p>Dear <strong>${studentName}</strong>,</p>
        <p>We are pleased to inform you that your bursary application for the <strong>${cycleYear}</strong> cycle has been <strong>approved</strong>.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
          <p style="margin:0;font-size:13px;color:#15803d;text-transform:uppercase;letter-spacing:1px;">Allocated Amount</p>
          <p style="margin:8px 0 0;font-size:32px;font-weight:800;color:#15803d;">KES ${Number(amountAllocated).toLocaleString()}</p>
        </div>
        <p>The funds will be scheduled for disbursement to your institution shortly. You will receive another email confirmation when your payment has been processed.</p>
        <p>Congratulations,<br/><strong>The BursarHub Team</strong></p>
    `);
    emailQueue.enqueue({ to, subject, html });
};

// 3. Application Rejected
export const sendApplicationRejectedEmail = (
    to: string,
    studentName: string,
    cycleYear: number,
    reason: string | null
): void => {
    const subject = `Update on Your Application – BursarHub ${cycleYear} Cycle`;
    const html = baseLayout(`
        <h2 style="color:#dc2626;margin-top:0;">Application Outcome</h2>
        <p>Dear <strong>${studentName}</strong>,</p>
        <p>Thank you for applying for the <strong>${cycleYear}</strong> funding cycle. After careful review by the vetting committee, we regret to inform you that your application was <strong>not successful</strong> at this time.</p>
        ${reason
            ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;padding:16px;margin:20px 0;">
                 <p style="margin:0;font-size:14px;color:#991b1b;"><strong>Reason for decision:</strong> ${reason}</p>
               </div>`
            : `<p>We received many applications and funds are limited – we could only prioritise the most critical cases this cycle.</p>`
        }
        <p>We encourage you to apply again in the next funding cycle and ensure all required supporting documents are submitted.</p>
        <p>Sincerely,<br/><strong>The BursarHub Team</strong></p>
    `);
    emailQueue.enqueue({ to, subject, html });
};

// 4. Disbursement Completed
export const sendDisbursementCompletedEmail = (
    to: string,
    studentName: string,
    amount: number | string,
    refNumber: string | null
): void => {
    const subject = `Payment Disbursed – BursarHub Bursary`;
    const html = baseLayout(`
        <h2 style="color:${BRAND_BLUE};margin-top:0;">Funds Successfully Disbursed 💳</h2>
        <p>Dear <strong>${studentName}</strong>,</p>
        <p>Your approved bursary funds have been successfully disbursed to your institution's bank account.</p>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
          <p style="margin:0;font-size:13px;color:#1d4ed8;text-transform:uppercase;letter-spacing:1px;">Amount Disbursed</p>
          <p style="margin:8px 0 4px;font-size:32px;font-weight:800;color:#1d4ed8;">KES ${Number(amount).toLocaleString()}</p>
          ${refNumber
              ? `<p style="margin:8px 0 0;font-size:13px;color:#3b82f6;"><strong>Reference:</strong> ${refNumber}</p>`
              : ''}
        </div>
        <p>Please allow <strong>2–5 working days</strong> for the payment to reflect in your tuition/school fees account, depending on your institution's internal processing times.</p>
        <p>Best of luck in your studies!<br/><strong>The BursarHub Team</strong></p>
    `);
    emailQueue.enqueue({ to, subject, html });
};

// 5. Welcome / Account Created
export const sendWelcomeEmail = (
    to: string,
    studentName: string,
    institution: string
): void => {
    const subject = `Welcome to BursarHub — Account Created Successfully`;
    const html = baseLayout(`
        <h2 style="color:${BRAND_BLUE};margin-top:0;">Welcome to BursarHub! 🎓</h2>
        <p>Dear <strong>${studentName}</strong>,</p>
        <p>Your student account has been successfully created on the <strong>BursarHub Bursary Platform</strong>. We're glad to have you on board.</p>

        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin:24px 0;">
          <p style="margin:0 0 8px;font-size:13px;color:#1d4ed8;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your Account Details</p>
          <table style="width:100%;font-size:14px;color:#374151;">
            <tr><td style="padding:4px 0;color:#6b7280;width:40%;">Name</td><td><strong>${studentName}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Institution</td><td><strong>${institution}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Email</td><td><strong>${to}</strong></td></tr>
          </table>
        </div>

        <p>You can now log in to your dashboard and apply for the current bursary funding cycle.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="http://localhost:5173/auth/login"
             style="background:${BRAND_BLUE};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
            Log In to Dashboard
          </a>
        </p>
        <p style="font-size:13px;color:#6b7280;">If you did not create this account, please ignore this email or contact our support team immediately.</p>
        <p>Best Regards,<br/><strong>The BursarHub Team</strong></p>
    `);
    emailQueue.enqueue({ to, subject, html });
};

// 6. Account Deactivated / Discontinued
export const sendAccountDeactivatedEmail = (
    to: string,
    userName: string
): void => {
    const subject = `Account Status Update – BursarHub`;
    const html = baseLayout(`
        <h2 style="color:#dc2626;margin-top:0;">Account Discontinued</h2>
        <p>Dear <strong>${userName}</strong>,</p>
        <p>This is to inform you that your administrative access to the <strong>BursarHub Platform</strong> has been <strong>discontinued</strong> by a system administrator.</p>
        
        <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;padding:16px;margin:24px 0;">
          <p style="margin:0;font-size:14px;color:#991b1b;">
            Your account is now inactive. You will no longer be able to log in or perform administrative actions.
          </p>
        </div>

        <p>If you believe this is an error, please contact the system Super Admin or your department head immediately.</p>
        <p>Thank you for your service.<br/><strong>The BursarHub Team</strong></p>
    `);
    emailQueue.enqueue({ to, subject, html });
};

// 7. Admin Welcome / Credentials
export const sendAdminWelcomeEmail = (
    to: string,
    adminName: string,
    systemId: string,
    password: string
): void => {
    const subject = `Your Administrative Access — BursarHub`;
    const html = baseLayout(`
        <h2 style="color:${BRAND_BLUE};margin-top:0;">Administrative Access Granted 🛡️</h2>
        <p>Dear <strong>${adminName}</strong>,</p>
        <p>An administrative account has been created for you on the <strong>BursarHub Platform</strong>. You can now log in and begin managing bursary applications.</p>

        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:24px;margin:24px 0;">
          <p style="margin:0 0 12px;font-size:13px;color:#1d4ed8;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Your Credentials</p>
          <table style="width:100%;font-size:14px;color:#374151;">
            <tr><td style="padding:6px 0;color:#6b7280;width:40%;">System ID</td><td><strong style="color:${BRAND_BLUE};">${systemId}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Login Email</td><td><strong>${to}</strong></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Password</td><td><code style="background:#dbeafe;padding:2px 6px;border-radius:4px;color:#1e40af;">${password}</code></td></tr>
          </table>
        </div>

        <p><strong>Next Steps:</strong></p>
        <ol style="font-size:14px;color:#4b5563;line-height:1.6;">
          <li>Log in to the Admin Portal using the link below.</li>
          <li>For security, we recommend changing your password from your profile settings after your first login.</li>
        </ol>

        <p style="text-align:center;margin:32px 0;">
          <a href="http://localhost:5173/auth/login"
             style="background:${BRAND_BLUE};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;box-shadow:0 4px 12px rgba(37,99,235,0.2);">
            Admin Portal Login
          </a>
        </p>
        <p style="font-size:12px;color:#9ca3af;text-align:center;">
          If you did not expect this account, please contact your System Super Admin.
        </p>
        <p>Regards,<br/><strong>The BursarHub Team</strong></p>
    `);
    emailQueue.enqueue({ to, subject, html });
};

// 8. OTP Verification
export const sendOTPEmail = (
    to: string,
    otp: string
): void => {
    const subject = `Your Verification Code – BursarHub`;
    const html = baseLayout(`
        <h2 style="color:${BRAND_BLUE};margin-top:0;">Verification Code 🔑</h2>
        <p>You have requested a verification code to access your account.</p>
        <div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
          <p style="margin:0;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:2px;">Your Code</p>
          <p style="margin:12px 0 0;font-size:42px;font-weight:800;color:${BRAND_BLUE};letter-spacing:8px;font-family:monospace;">${otp}</p>
        </div>
        <p style="text-align:center;color:#64748b;font-size:14px;">This code will expire in <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
        <p>Regards,<br/><strong>The BursarHub Team</strong></p>
    `);
    emailQueue.enqueue({ to, subject, html });
};

// 9. Password Reset
export const sendPasswordResetEmail = (
    to: string,
    resetLink: string
): void => {
    const subject = "Password Reset Request – BursarHub";
    const html = baseLayout(`
        <h2 style="color:${BRAND_BLUE};margin-top:0;">Reset Your Password 🔐</h2>
        <p>We received a request to reset the password for your account.</p>
        <p>Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.</p>
        <p style="text-align:center;margin:32px 0;">
          <a href="${resetLink}"
             style="background:${BRAND_BLUE};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
            Reset Password
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;line-height:1.6;">
          If the button above doesn't work, copy and paste this link into your browser:<br/>
          <span style="color:${BRAND_BLUE};word-break:break-all;">${resetLink}</span>
        </p>
        <p style="font-size:14px;color:#94a3b8;margin-top:24px;">If you did not request a password reset, no further action is required.</p>
        <p>Regards,<br/><strong>The BursarHub Team</strong></p>
    `);
    emailQueue.enqueue({ to, subject, html });
};
