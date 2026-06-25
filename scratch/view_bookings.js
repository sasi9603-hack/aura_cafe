const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../backend/aura_cafe.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, guest_name, booking_date, booking_time, status FROM hotel_restaurant_table_booking_menu", [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log(JSON.stringify(rows, null, 2));
  }
  db.close();
});
