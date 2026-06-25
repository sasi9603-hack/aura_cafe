/**
 * Automated test suite for Aura Cafe Guest-Facing Digital Menu & Table Ordering APIs
 */
process.env.NODE_ENV = 'test';
process.env.PORT = 3004; // Use a different port to avoid conflicts

const assert = require('assert');
const server = require('../backend/server');

async function runPublicTests() {
  console.log('==================================================');
  console.log('Running Aura Cafe Public Dining API Tests...');
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
    // 1. GET /api/public/menu (should fetch menu publicly)
    const menuRes = await fetch('http://localhost:3004/api/public/menu');
    const menuData = await menuRes.json();
    assertTest('GET /api/public/menu should return 200 status', () => {
      assert.strictEqual(menuRes.status, 200);
    });
    assertTest('GET /api/public/menu should contain menu items', () => {
      assert.ok(Array.isArray(menuData));
      assert.ok(menuData.length > 0);
      assert.ok(menuData[0].hasOwnProperty('name'));
      assert.ok(menuData[0].hasOwnProperty('price'));
    });

    // 2. GET /api/public/active-booking?table=5 (no booking initially)
    const activeBookingEmptyRes = await fetch('http://localhost:3004/api/public/active-booking?table=5');
    const activeBookingEmptyData = await activeBookingEmptyRes.json();
    assertTest('GET /api/public/active-booking initially returns null', () => {
      assert.strictEqual(activeBookingEmptyRes.status, 200);
      assert.strictEqual(activeBookingEmptyData.success, true);
      assert.strictEqual(activeBookingEmptyData.booking, null);
    });

    // 3. POST /api/public/orders (place order on empty Table 5 -> should auto-create booking)
    const orderRes1 = await fetch('http://localhost:3004/api/public/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_number: 5,
        items: [
          { item_name: 'Veg Biryani', quantity: 2 },
          { item_name: 'Tomato Soup', quantity: 1 }
        ]
      })
    });
    const orderData1 = await orderRes1.json();
    assertTest('POST /api/public/orders should succeed and auto-create booking', () => {
      assert.strictEqual(orderRes1.status, 200);
      assert.strictEqual(orderData1.success, true);
      assert.ok(orderData1.bookingId);
    });

    const createdBookingId = orderData1.bookingId;

    // 4. GET /api/public/active-booking?table=5 (should now show the auto-created booking)
    const activeBookingRes = await fetch('http://localhost:3004/api/public/active-booking?table=5');
    const activeBookingData = await activeBookingRes.json();
    assertTest('GET /api/public/active-booking returns newly created booking details', () => {
      assert.strictEqual(activeBookingRes.status, 200);
      assert.strictEqual(activeBookingData.success, true);
      assert.strictEqual(activeBookingData.booking.id, createdBookingId);
      assert.strictEqual(activeBookingData.booking.guest_name, 'Table 5 Diner');
      assert.strictEqual(activeBookingData.booking.guest_type, 'Walk-in');
    });

    // 5. GET /api/public/orders?table=5 (should return active orders for Table 5)
    const ordersTrackRes = await fetch('http://localhost:3004/api/public/orders?table=5');
    const ordersTrackData = await ordersTrackRes.json();
    assertTest('GET /api/public/orders lists active dishes for Table 5', () => {
      assert.strictEqual(ordersTrackRes.status, 200);
      assert.strictEqual(ordersTrackData.success, true);
      assert.strictEqual(ordersTrackData.orders.length, 2);
      assert.strictEqual(ordersTrackData.orders[0].item_name, 'Veg Biryani');
      assert.strictEqual(ordersTrackData.orders[0].quantity, 2);
    });

    // 6. POST /api/public/orders (place another order on Table 5 -> should append to same booking)
    const orderRes2 = await fetch('http://localhost:3004/api/public/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_number: 5,
        items: [
          { item_name: 'Gulab Jamun', quantity: 1 }
        ]
      })
    });
    const orderData2 = await orderRes2.json();
    assertTest('POST /api/public/orders appends to existing booking ID', () => {
      assert.strictEqual(orderRes2.status, 200);
      assert.strictEqual(orderData2.success, true);
      assert.strictEqual(orderData2.bookingId, createdBookingId); // matches same id
    });

    // 7. Check final order items count and status
    const finalOrdersRes = await fetch('http://localhost:3004/api/public/orders?table=5');
    const finalOrdersData = await finalOrdersRes.json();
    assertTest('GET /api/public/orders has total of 3 items ordered', () => {
      assert.strictEqual(finalOrdersData.orders.length, 3);
      assert.ok(finalOrdersData.orders.find(o => o.item_name === 'Gulab Jamun'));
    });

    console.log('\n==================================================');
    console.log(`Public API Test Execution Finished. Passes: ${passes}, Fails: ${fails}`);
    console.log('==================================================');

    // Shutdown test server gracefully
    const serverInstance = server.getServerInstance();
    if (serverInstance) {
      console.log('Closing public API test server...');
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
    console.error('[FAIL] API endpoint verification failed:', err);
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

runPublicTests();
