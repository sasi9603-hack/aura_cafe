const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'server.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Searching server.js:');
lines.forEach((line, idx) => {
  if (line.includes('/api/reports/summary') || line.includes('reports/summary')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
