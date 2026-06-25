const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const prodDbFile = path.join(__dirname, '../backend/aura_cafe.db');
const db = new sqlite3.Database(prodDbFile);

db.all('SELECT id, guest_name, status FROM hotel_restaurant_table_booking_menu', [], (err, bookings) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('Bookings:', bookings);
  
  db.all('SELECT id, booking_id, payment_method, status FROM payments', [], (err, payments) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log('Payments:', payments);
    db.close();
  });
});
