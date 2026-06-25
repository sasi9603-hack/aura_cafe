const { dbQuery } = require('../backend/db');

async function run() {
  try {
    const yesterdayStr = '2026-06-16';
    
    // Find the booking IDs to delete
    const bookings = await dbQuery.all(
      "SELECT id, guest_name FROM hotel_restaurant_table_booking_menu WHERE booking_date = ? AND guest_name IN ('Karan Johar', 'Emily Watson Yesterday')",
      [yesterdayStr]
    );

    if (bookings.length > 0) {
      console.log(`Found ${bookings.length} fake bookings on ${yesterdayStr} to clean up.`);
      const bookingIds = bookings.map(b => b.id);

      // Delete orders
      await dbQuery.run(
        `DELETE FROM orders WHERE booking_id IN (${bookingIds.map(() => '?').join(',')})`,
        bookingIds
      );
      console.log("Deleted associated orders.");

      // Delete payments
      await dbQuery.run(
        `DELETE FROM payments WHERE booking_id IN (${bookingIds.map(() => '?').join(',')})`,
        bookingIds
      );
      console.log("Deleted associated payments.");

      // Delete bookings
      await dbQuery.run(
        `DELETE FROM hotel_restaurant_table_booking_menu WHERE id IN (${bookingIds.map(() => '?').join(',')})`,
        bookingIds
      );
      console.log("Deleted bookings.");
    } else {
      console.log(`No fake bookings found on ${yesterdayStr} to clean up.`);
    }

  } catch (err) {
    console.error("Clean up failed:", err);
  }
  process.exit(0);
}

run();
