// replace-env.js
const fs = require('fs');

// Read script.js
let scriptContent = fs.readFileSync('script.js', 'utf8');

// Replace placeholders with environment variable values
scriptContent = scriptContent.replace('FIREBASE_API_KEY_PLACEHOLDER', process.env.FIREBASE_API_KEY);
scriptContent = scriptContent.replace('FIREBASE_AUTH_DOMAIN_PLACEHOLDER', process.env.FIREBASE_AUTH_DOMAIN);
scriptContent = scriptContent.replace('FIREBASE_PROJECT_ID_PLACEHOLDER', process.env.FIREBASE_PROJECT_ID);
scriptContent = scriptContent.replace('FIREBASE_STORAGE_BUCKET_PLACEHOLDER', process.env.FIREBASE_STORAGE_BUCKET);
scriptContent = scriptContent.replace('FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER', process.env.FIREBASE_MESSAGING_SENDER_ID);
scriptContent = scriptContent.replace('FIREBASE_APP_ID_PLACEHOLDER', process.env.FIREBASE_APP_ID);

// Write the updated script.js
fs.writeFileSync('script.js', scriptContent, 'utf8');
console.log('Environment variables replaced in script.js');