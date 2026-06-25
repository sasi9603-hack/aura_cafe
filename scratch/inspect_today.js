const { dbQuery } = require('../backend/db');

async function run() {
  try {
    const bookings = await dbQuery.all("SELECT * FROM hotel_restaurant_table_booking_menu WHERE booking_date = '2026-06-14'");
    console.log("Bookings on 2026-06-14:");
    console.log(JSON.stringify(bookings, null, 2));

    const payments = await dbQuery.all(`
      SELECT p.*, b.guest_name, b.payment_status as b_payment_status, b.status as b_status 
      FROM payments p 
      JOIN hotel_restaurant_table_booking_menu b ON p.booking_id = b.id
      WHERE b.booking_date = '2026-06-14'
    `);
    console.log("\nPayments for 2026-06-14 bookings:");
    console.log(JSON.stringify(payments, null, 2));
    
    // Let's also check all payments in the DB generally
    const allPayments = await dbQuery.all("SELECT * FROM payments ORDER BY id DESC LIMIT 5");
    console.log("\nLast 5 payments overall:");
    console.log(JSON.stringify(allPayments, null, 2));

  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();
