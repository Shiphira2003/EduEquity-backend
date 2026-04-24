import { sendEmail } from './src/services/email.service';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log('Starting email test...');
    try {
        await sendEmail('shiphirawamaitha@gmail.com', 'BursarHub Email Test', '<h1>Test Successful</h1><p>If you see this, email sending is working.</p>');
        console.log('Email test finished.');
    } catch (err) {
        console.error('Email test failed:', err);
    }
}

test();
