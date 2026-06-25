const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../backend/aura_cafe.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Enable foreign keys for cascade delete
  db.run("PRAGMA foreign_keys = ON;");
  
  db.all("SELECT id, guest_name FROM hotel_restaurant_table_booking_menu WHERE id >= 12", [], (err, rows) => {
    if (err) {
      console.error("Query error:", err);
      db.close();
      return;
    }
    
    if (rows.length === 0) {
      console.log("No user-created reservations found.");
      db.close();
      return;
    }
    
    console.log("Deleting reservations:");
    rows.forEach(r => console.log(`- ID ${r.id}: ${r.guest_name}`));
    
    db.run("DELETE FROM hotel_restaurant_table_booking_menu WHERE id >= 12", [], function(err) {
      if (err) {
        console.error("Delete error:", err.message);
      } else {
        console.log(`Deleted ${this.changes} user reservations.`);
      }
      db.close();
    });
  });
});
