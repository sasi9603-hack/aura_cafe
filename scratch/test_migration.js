const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../backend/aura_cafe.db');
console.log('Opening database at:', dbPath);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening db:', err.message);
    process.exit(1);
  }
});

const run = (sql) => new Promise((resolve, reject) => {
  db.run(sql, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

const all = (sql) => new Promise((resolve, reject) => {
  db.all(sql, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

async function testMigration() {
  try {
    const tableInfo = await all("PRAGMA table_info(hotel_restaurant_table_booking_menu)");
    const tableNumCol = tableInfo.find(c => c.name === 'table_number');
    console.log('Current table_number nullability (notnull):', tableNumCol.notnull);
    
    if (tableNumCol.notnull === 1) {
      console.log('Running migration...');
      await run("PRAGMA foreign_keys=OFF;");
      await run("BEGIN TRANSACTION;");
      await run("ALTER TABLE hotel_restaurant_table_booking_menu RENAME TO _hotel_restaurant_table_booking_menu_old;");
      await run(`
        CREATE TABLE hotel_restaurant_table_booking_menu (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guest_name TEXT NOT NULL,
          guest_type TEXT CHECK(guest_type IN ('Hotel Guest', 'Walk-in')) NOT NULL,
          room_number TEXT,
          table_number INTEGER,
          booking_date TEXT NOT NULL,
          booking_time TEXT NOT NULL,
          guest_count INTEGER NOT NULL,
          dietary_preference TEXT CHECK(dietary_preference IN ('None', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Nut-Allergy')) DEFAULT 'None',
          status TEXT CHECK(status IN ('Active', 'Completed', 'Cancelled', 'Archived')) DEFAULT 'Active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await run(`
        INSERT INTO hotel_restaurant_table_booking_menu (
          id, guest_name, guest_type, room_number, table_number, booking_date, booking_time, guest_count, dietary_preference, status, created_at, updated_at
        )
        SELECT 
          id, guest_name, guest_type, room_number, table_number, booking_date, booking_time, guest_count, dietary_preference, status, created_at, updated_at
        FROM _hotel_restaurant_table_booking_menu_old;
      `);
      await run("DROP TABLE _hotel_restaurant_table_booking_menu_old;");
      await run("COMMIT;");
      await run("PRAGMA foreign_keys=ON;");
      console.log('Migration completed successfully.');
      
      const newTableInfo = await all("PRAGMA table_info(hotel_restaurant_table_booking_menu)");
      const newTableNumCol = newTableInfo.find(c => c.name === 'table_number');
      console.log('New table_number nullability (notnull):', newTableNumCol.notnull);
    } else {
      console.log('Already migrated.');
    }
  } catch (err) {
    console.error('Error during migration test:', err.message);
  } finally {
    db.close();
  }
}

testMigration();
