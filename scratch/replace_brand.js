const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'README.md',
  '.env',
  '.env.example',
  'package.json',
  'package-lock.json',
  'backend/businessEngine.js',
  'backend/db.js',
  'backend/notificationService.js',
  'backend/server.js',
  'frontend/index.html',
  'frontend/app.js',
  'frontend/style.css',
  'frontend/booking-portal.html',
  'frontend/feedback.html',
  'frontend/menu.html',
  'frontend/menu.js',
  'docs/api_spec.md',
  'docs/database_design.md',
  'docs/literature_survey.md',
  'docs/objectives.md',
  'docs/problem_statement.md',
  'tests/run_tests.js',
  'tests/public_orders_test.js',
  'tests/room_service_test.js'
];

const projectRoot = path.join(__dirname, '..');

filesToUpdate.forEach(relPath => {
  const fullPath = path.join(projectRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${relPath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');

  // Perform replacements
  let updatedContent = content
    .replace(/Siera Beach Hotel & Resort/g, 'Aura Cafe')
    .replace(/Siera Beach Hotel/g, 'Aura Cafe')
    .replace(/Siera Beach/g, 'Aura')
    .replace(/Siera Dining/g, 'Aura Dining')
    .replace(/Siera Room Service/g, 'Aura Room Service')
    .replace(/sierabeachhotel\.com/g, 'auracafe.com')
    .replace(/sierabeachhotel/g, 'auracafe')
    .replace(/sierabeach\.com/g, 'auracafe.com')
    .replace(/sierabeach/g, 'auracafe')
    .replace(/Siera_Beach_Hotel/g, 'Aura_Cafe')
    .replace(/siera-beach-hotel/g, 'aura-cafe')
    .replace(/siera-invite/g, 'aura-invite');

  if (content !== updatedContent) {
    fs.writeFileSync(fullPath, updatedContent, 'utf8');
    console.log(`Updated: ${relPath}`);
  } else {
    console.log(`No changes needed: ${relPath}`);
  }
});

console.log('Branding replacement completed successfully.');
