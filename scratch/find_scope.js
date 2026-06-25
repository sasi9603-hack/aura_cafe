const fs = require('fs');
const content = fs.readFileSync('frontend/app.js', 'utf8');
const lines = content.split('\n');

let openBraces = 0;
let started = false;
let startLine = 0;
let endLine = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes("document.addEventListener('DOMContentLoaded'")) {
    started = true;
    startLine = i + 1;
  }
  if (started) {
    // Count braces
    for (let char of line) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
    }
    if (openBraces === 0) {
      endLine = i + 1;
      break;
    }
  }
}

console.log('DOMContentLoaded starts at line:', startLine);
console.log('DOMContentLoaded ends at line:', endLine);
