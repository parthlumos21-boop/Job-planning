const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Determine Backend Port from server/.env
const envPath = path.join(__dirname, 'server', '.env');
let backendPort = 4000;
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const portMatch = envContent.match(/^PORT=(\d+)/m);
    if (portMatch) {
        backendPort = portMatch[1];
    }
}

console.log('\n======================================================');
console.log(`🚀 FULL STACK APP is running on PORT : ${backendPort}`);
console.log(`👉 Access Application at      : http://localhost:${backendPort}`);
console.log('======================================================\n');

// Start Backend (server serves the frontend statically)
const backend = spawn('npm run dev', {
    cwd: path.join(__dirname, 'server'),
    shell: true,
    stdio: 'inherit'
});

process.on('SIGINT', () => {
    backend.kill('SIGINT');
    process.exit();
});
process.on('SIGTERM', () => {
    backend.kill('SIGTERM');
    process.exit();
});
