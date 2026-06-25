const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, 'frontend/app.js');

function searchFile(filePath, query) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  console.log(`=== Matches in ${path.basename(filePath)} for "${query}" ===`);
  lines.forEach((line, index) => {
    if (line.toLowerCase().includes(query.toLowerCase())) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  });
}

searchFile(appJsPath, 'recordPayment');
searchFile(appJsPath, 'payment_method');
searchFile(appJsPath, 'payment');
