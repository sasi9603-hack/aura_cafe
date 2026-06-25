/**
 * Automated test suite for Aura Cafe Room Service ordering and billing APIs
 */
process.env.NODE_ENV = 'test';
process.env.PORT = 3005; // Use a different port to avoid conflicts

const assert = require('assert');
const server = require('../backend/server');

async function runRoomServiceTests() {
  console.log('==================================================');
  console.log('Running Aura Cafe Room Service API Tests...');
  console.log('==================================================');

  // Wait for SQLite database to boot up and seed
  await new Promise(resolve => setTimeout(resolve, 2000));

  let passes = 0;
  let fails = 0;

  function assertTest(name, condition) {
    try {
      condition();
      console.log(`[PASS] ${name}`);
      passes++;
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(err);
      fails++;
    }
  }

  try {
    // 1. GET /api/public/active-booking?room=305 (no booking initially)
    const activeBookingEmptyRes = await fetch('http://localhost:3005/api/public/active-booking?room=305');
    const activeBookingEmptyData = await activeBookingEmptyRes.json();
    assertTest('GET /api/public/active-booking for room initially returns null', () => {
      assert.strictEqual(activeBookingEmptyRes.status, 200);
      assert.strictEqual(activeBookingEmptyData.success, true);
      assert.strictEqual(activeBookingEmptyData.booking, null);
    });

    // 2. POST /api/public/orders (place room service order on Room 305 -> should auto-create booking)
    const orderRes1 = await fetch('http://localhost:3005/api/public/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_number: '305',
        items: [
          { item_name: 'Veg Biryani', quantity: 2 }, // 250.00 * 2 = 500.00
          { item_name: 'Tomato Soup', quantity: 1 }      // 120.00 * 1 = 120.00
        ]
      })
    });
    const orderData1 = await orderRes1.json();
    assertTest('POST /api/public/orders for Room Service should succeed and auto-create booking', () => {
      assert.strictEqual(orderRes1.status, 200);
      assert.strictEqual(orderData1.success, true);
      assert.ok(orderData1.bookingId);
    });

    const createdBookingId = orderData1.bookingId;

    // 3. GET /api/public/active-booking?room=305 (should now show the auto-created booking)
    const activeBookingRes = await fetch('http://localhost:3005/api/public/active-booking?room=305');
    const activeBookingData = await activeBookingRes.json();
    assertTest('GET /api/public/active-booking returns newly created room service booking details', () => {
      assert.strictEqual(activeBookingRes.status, 200);
      assert.strictEqual(activeBookingData.success, true);
      assert.strictEqual(activeBookingData.booking.id, createdBookingId);
      assert.strictEqual(activeBookingData.booking.guest_name, 'Room 305 Service');
      assert.strictEqual(activeBookingData.booking.guest_type, 'Hotel Guest');
    });

    // 4. GET /api/public/orders?room=305 (should return active orders for Room 305)
    const ordersTrackRes = await fetch('http://localhost:3005/api/public/orders?room=305');
    const ordersTrackData = await ordersTrackRes.json();
    assertTest('GET /api/public/orders lists active dishes for Room 305', () => {
      assert.strictEqual(ordersTrackRes.status, 200);
      assert.strictEqual(ordersTrackData.success, true);
      assert.strictEqual(ordersTrackData.orders.length, 2);
      assert.strictEqual(ordersTrackData.orders[0].item_name, 'Veg Biryani');
      assert.strictEqual(ordersTrackData.orders[0].quantity, 2);
    });

    // 5. POST /api/public/orders (place another order on Room 305 -> should append to same booking)
    const orderRes2 = await fetch('http://localhost:3005/api/public/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_number: '305',
        items: [
          { item_name: 'Gulab Jamun', quantity: 1 } // 90.00
        ]
      })
    });
    const orderData2 = await orderRes2.json();
    assertTest('POST /api/public/orders for Room Service appends to existing booking ID', () => {
      assert.strictEqual(orderRes2.status, 200);
      assert.strictEqual(orderData2.success, true);
      assert.strictEqual(orderData2.bookingId, createdBookingId); // matches same id
    });

    // 6. Verify 10% Hotel Guest discount on Room Service bill in payments
    const { dbQuery } = require('../backend/db');
    const payment = await dbQuery.get('SELECT * FROM payments WHERE booking_id = ?', [createdBookingId]);
    assertTest('Payments record has 10% discount for Room Service (Hotel Guest)', () => {
      // Subtotal = 500.00 + 120.00 + 90.00 = 710.00
      // Discount = 710.00 * 0.10 = 71.00
      // Taxable = 710.00 - 71.00 = 639.00
      // Tax = 639.00 * 0.05 = 31.95
      // Total = 639.00 + 31.95 = 670.95
      assert.strictEqual(payment.subtotal, 710.00);
      assert.strictEqual(payment.discount, 71.00);
      assert.strictEqual(payment.tax, 31.95);
      assert.strictEqual(payment.total_amount, 670.95);
    });

    console.log('\n==================================================');
    console.log(`Room Service API Test Execution Finished. Passes: ${passes}, Fails: ${fails}`);
    console.log('==================================================');

    // Shutdown test server gracefully
    const serverInstance = server.getServerInstance();
    if (serverInstance) {
      console.log('Closing Room Service API test server...');
      await new Promise(resolve => serverInstance.close(resolve));
    }
    
    const { closeDb } = require('../backend/db');
    console.log('Closing SQLite connection...');
    await closeDb();

    // Clean up temporary database
    const fs = require('fs');
    const path = require('path');
    const testDbFile = path.join(__dirname, '../backend/test_aura_cafe.db');
    if (fs.existsSync(testDbFile)) {
      fs.unlinkSync(testDbFile);
      console.log('Deleted temporary test database file.');
    }

    setTimeout(() => {
      if (fails > 0) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    }, 200);
  } catch (err) {
    console.error('[FAIL] Room Service API verification failed:', err);
    try {
      const serverInstance = server.getServerInstance();
      if (serverInstance) serverInstance.close();
      const { closeDb } = require('../backend/db');
      await closeDb();
      const fs = require('fs');
      const path = require('path');
      const testDbFile = path.join(__dirname, '../backend/test_aura_cafe.db');
      if (fs.existsSync(testDbFile)) fs.unlinkSync(testDbFile);
    } catch (e) {}
    process.exit(1);
  }
}

runRoomServiceTests();
