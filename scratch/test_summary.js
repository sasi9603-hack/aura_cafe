const { dbQuery } = require('../backend/db');

async function run() {
  try {
    const now = new Date();
    const todayStrLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayStrISO = now.toISOString().split('T')[0];

    console.log("Date info:");
    console.log("Local todayStr:", todayStrLocal);
    console.log("ISO todayStr:", todayStrISO);

    // Let's check counts of all payments in the DB grouped by payment_date
    const stats = await dbQuery.all(`
      SELECT p.payment_date, SUM(p.total_amount) as total, COUNT(*) as count 
      FROM payments p
      JOIN hotel_restaurant_table_booking_menu b ON p.booking_id = b.id
      WHERE b.payment_status = 'paid'
      GROUP BY p.payment_date
    `);
    console.log("\nPayment Stats Grouped by Date (where booking payment_status = 'paid'):");
    console.log(stats);

    // Check with todayStrLocal
    const revLocal = await dbQuery.get(
      `SELECT SUM(p.total_amount) as total 
       FROM payments p
       JOIN hotel_restaurant_table_booking_menu b ON p.booking_id = b.id
       WHERE b.payment_status = 'paid' AND p.payment_date = ?`,
      [todayStrLocal]
    );
    console.log(`\nQuery result for local todayStr (${todayStrLocal}):`, revLocal);

    // Check with '2026-06-14' specifically
    const revSpecific = await dbQuery.get(
      `SELECT SUM(p.total_amount) as total 
       FROM payments p
       JOIN hotel_restaurant_table_booking_menu b ON p.booking_id = b.id
       WHERE b.payment_status = 'paid' AND p.payment_date = ?`,
      ['2026-06-14']
    );
    console.log(`\nQuery result for '2026-06-14':`, revSpecific);

    // Check Vignesh's booking specifically
    const vignesh = await dbQuery.get(`
      SELECT p.*, b.guest_name, b.payment_status, b.booking_date 
      FROM payments p
      JOIN hotel_restaurant_table_booking_menu b ON p.booking_id = b.id
      WHERE b.guest_name = 'vignesh'
    `);
    console.log("\nVignesh's joined details:");
    console.log(vignesh);

  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();
