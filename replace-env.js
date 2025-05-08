const fs = require('fs');

function replaceEnvVariables(filePath) {
    // Read the script file
    let scriptContent = fs.readFileSync(filePath, 'utf8');

    // Replace placeholders with environment variable values
    scriptContent = scriptContent.replace('FIREBASE_API_KEY_PLACEHOLDER', process.env.FIREBASE_API_KEY);
    scriptContent = scriptContent.replace('FIREBASE_AUTH_DOMAIN_PLACEHOLDER', process.env.FIREBASE_AUTH_DOMAIN);
    scriptContent = scriptContent.replace('FIREBASE_DATABASE_URL_PLACEHOLDER', process.env.FIREBASE_DATABASE_URL);
    scriptContent = scriptContent.replace('FIREBASE_PROJECT_ID_PLACEHOLDER', process.env.FIREBASE_PROJECT_ID);
    scriptContent = scriptContent.replace('FIREBASE_STORAGE_BUCKET_PLACEHOLDER', process.env.FIREBASE_STORAGE_BUCKET);
    scriptContent = scriptContent.replace('FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER', process.env.FIREBASE_MESSAGING_SENDER_ID);
    scriptContent = scriptContent.replace('FIREBASE_APP_ID_PLACEHOLDER', process.env.FIREBASE_APP_ID);
    scriptContent = scriptContent.replace('FIREBASE_MEASUREMENT_ID_PLACEHOLDER', process.env.FIREBASE_MEASUREMENT_ID);

    // Write the updated script file
    fs.writeFileSync(filePath, scriptContent, 'utf8');
    console.log(`Environment variables replaced in ${filePath}`);
}

// Replace environment variables in both script.js and script2.js
replaceEnvVariables('script.js');
replaceEnvVariables('mode2/script2.js');