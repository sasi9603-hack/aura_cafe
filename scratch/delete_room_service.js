const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../backend/aura_cafe.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Enable foreign keys for cascade delete
  db.run("PRAGMA foreign_keys = ON;");
  
  db.all("SELECT id, guest_name, room_number FROM hotel_restaurant_table_booking_menu WHERE table_number IS NULL", [], (err, rows) => {
    if (err) {
      console.error("Query error:", err);
      db.close();
      return;
    }
    
    if (rows.length === 0) {
      console.log("No room service bookings found.");
      db.close();
      return;
    }
    
    console.log("Found room service bookings to delete:");
    rows.forEach(r => console.log(`- ID ${r.id}: ${r.guest_name} (Room ${r.room_number})`));
    
    db.run("DELETE FROM hotel_restaurant_table_booking_menu WHERE table_number IS NULL", [], function(err) {
      if (err) {
        console.error("Delete error:", err.message);
      } else {
        console.log(`Deleted ${this.changes} room service bookings.`);
      }
      db.close();
    });
  });
});
