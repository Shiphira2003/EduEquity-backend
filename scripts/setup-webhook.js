#!/usr/bin/env node

/**
 * Payment Webhook Configuration Helper
 *
 * This script helps configure Stripe webhooks for local development
 * and provides instructions for production setup.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 BursarHub Payment Webhook Configuration\n');

// Check if Stripe CLI is installed
try {
    execSync('stripe --version', { stdio: 'pipe' });
    console.log('✅ Stripe CLI is installed');
} catch (error) {
    console.log('❌ Stripe CLI is not installed');
    console.log('📦 Install it with: npm install -g stripe');
    console.log('   Or visit: https://stripe.com/docs/stripe-cli\n');
    process.exit(1);
}

// Check for .env file
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    console.log('❌ .env file not found');
    console.log('📝 Create .env file with your Stripe credentials\n');
    process.exit(1);
}

console.log('🔧 Setting up webhook for local development...\n');

// Start Stripe webhook listener
try {
    console.log('🎧 Starting Stripe webhook listener...');
    console.log('📡 Forwarding to: http://localhost:5000/api/payments/webhook\n');

    console.log('📋 Instructions:');
    console.log('1. Copy the webhook signing secret from the CLI output');
    console.log('2. Add it to your .env file as STRIPE_WEBHOOK_SECRET');
    console.log('3. Restart your backend server');
    console.log('4. Test payments in your application\n');

    console.log('💡 For production deployment:');
    console.log('1. Deploy your backend to a public URL');
    console.log('2. Create webhook endpoint in Stripe Dashboard');
    console.log('3. Set URL to: https://yourdomain.com/api/payments/webhook');
    console.log('4. Select event: checkout.session.completed');
    console.log('5. Copy the webhook secret to your production .env\n');

    // Note: We can't actually run the stripe listen command here
    // because it runs indefinitely. Instead, provide instructions.
    console.log('🔄 Run this command in a separate terminal:');
    console.log('stripe listen --forward-to localhost:5000/api/payments/webhook\n');

} catch (error) {
    console.error('❌ Error setting up webhook:', error.message);
}