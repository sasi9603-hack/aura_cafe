const fs = require('fs');
const content = fs.readFileSync('frontend/index.html', 'utf8');

const idMatches = content.match(/id=["']modal-detail["']/g);
console.log('Occurrences of id="modal-detail":', idMatches ? idMatches.length : 0);

const bodyMatches = content.match(/<body[\s\S]*?<\/body>/gi);
console.log('Body tag matches:', bodyMatches ? bodyMatches.length : 0);
