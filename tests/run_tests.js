/**
 * Automated test suite for Hotel Restaurant Table Booking & Menu Management System
 */
process.env.NODE_ENV = 'test';

const assert = require('assert');
const { 
  getTableCapacity, 
  validateTableCapacity, 
  isTimeOverlapping, 
  hasDietaryConflict, 
  calculateBilling 
} = require('../backend/businessEngine');

async function runTests() {
  console.log('==================================================');
  console.log('Running Aura Cafe System Automated Tests...');
  console.log('==================================================');
  
  let passes = 0;
  let fails = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passes++;
    } catch (err) {
      console.error(`[FAIL] ${name}`);
      console.error(err);
      fails++;
    }
  }

  // ----------------------------------------------------
  // Test 1: Table Capacity & Setup
  // ----------------------------------------------------
  test('Table 1 capacity should be 2', () => {
    assert.strictEqual(getTableCapacity(1), 2);
  });
  test('Table 5 capacity should be 4', () => {
    assert.strictEqual(getTableCapacity(5), 4);
  });
  test('Table 10 capacity should be 8', () => {
    assert.strictEqual(getTableCapacity(10), 8);
  });
  test('Invalid Table 11 capacity should be 0', () => {
    assert.strictEqual(getTableCapacity(11), 0);
  });

  // ----------------------------------------------------
  // Test 2: Table Capacity Validation
  // ----------------------------------------------------
  test('Table 2 capacity validation (1 guest) - Should Pass', () => {
    assert.strictEqual(validateTableCapacity(2, 1), true);
  });
  test('Table 2 capacity validation (2 guests) - Should Pass', () => {
    assert.strictEqual(validateTableCapacity(2, 2), true);
  });
  test('Table 2 capacity validation (3 guests) - Should Fail', () => {
    assert.strictEqual(validateTableCapacity(2, 3), false);
  });
  test('Table 8 capacity validation (6 guests) - Should Pass', () => {
    assert.strictEqual(validateTableCapacity(8, 6), true);
  });
  test('Table 8 capacity validation (7 guests) - Should Fail', () => {
    assert.strictEqual(validateTableCapacity(8, 7), false);
  });

  // ----------------------------------------------------
  // Test 3: Time Overlap Validation (2-Hour Window)
  // ----------------------------------------------------
  test('Same start time overlap - Should overlap', () => {
    assert.strictEqual(isTimeOverlapping('19:00', '19:00'), true);
  });
  test('1 hour difference - Should overlap', () => {
    assert.strictEqual(isTimeOverlapping('19:00', '20:00'), true);
  });
  test('1.5 hour difference - Should overlap', () => {
    assert.strictEqual(isTimeOverlapping('19:00', '20:30'), true);
  });
  test('Exact 2 hour difference - Should NOT overlap', () => {
    assert.strictEqual(isTimeOverlapping('19:00', '21:00'), false);
  });
  test('3 hour difference - Should NOT overlap', () => {
    assert.strictEqual(isTimeOverlapping('19:00', '22:00'), false);
  });

  // ----------------------------------------------------
  // Test 4: Dietary Conflict Verification
  // ----------------------------------------------------
  test('Vegan guest orders non-vegan item - Should Conflict', () => {
    // Calamari tags: 'None'. Guest preference: 'Vegan'
    assert.strictEqual(hasDietaryConflict('Vegan', 'None'), true);
  });
  test('Vegetarian guest orders Vegetarian item - Should NOT Conflict', () => {
    assert.strictEqual(hasDietaryConflict('Vegetarian', 'Vegetarian,Vegan,Gluten-Free'), false);
  });
  test('Gluten-Free guest orders Nut-Allergy only item - Should Conflict', () => {
    assert.strictEqual(hasDietaryConflict('Gluten-Free', 'Vegetarian,Nut-Allergy'), true);
  });
  test('Nut-Allergy guest orders Nut-Allergy safe item - Should NOT Conflict', () => {
    assert.strictEqual(hasDietaryConflict('Nut-Allergy', 'Vegetarian,Nut-Allergy'), false);
  });
  test('No preference guest orders any item - Should NOT Conflict', () => {
    assert.strictEqual(hasDietaryConflict('None', 'None'), false);
  });

  // ----------------------------------------------------
  // Test 5: Billing & In-house Discounts (10% off + 5% Tax)
  // ----------------------------------------------------
  test('Walk-in guest orders billing (No discount)', () => {
    const orders = [
      { price: 10.00, quantity: 2, status: 'Served' },
      { price: 20.00, quantity: 1, status: 'Served' }
    ];
    // Subtotal: 40.00. Discount: 0. Tax: 40.00 * 0.05 = 2.00. Total: 42.00
    const bill = calculateBilling('Walk-in', orders);
    assert.strictEqual(bill.subtotal, 40.00);
    assert.strictEqual(bill.discount, 0.00);
    assert.strictEqual(bill.tax, 2.00);
    assert.strictEqual(bill.totalAmount, 42.00);
  });

  test('Hotel guest orders billing (10% discount + 5% Tax)', () => {
    const orders = [
      { price: 20.00, quantity: 2, status: 'Served' },
      { price: 10.00, quantity: 1, status: 'Served' }
    ];
    // Subtotal: 50.00. Discount: 50.00 * 0.1 = 5.00. Taxable: 45.00. Tax: 45 * 0.05 = 2.25. Total: 47.25
    const bill = calculateBilling('Hotel Guest', orders);
    assert.strictEqual(bill.subtotal, 50.00);
    assert.strictEqual(bill.discount, 5.00);
    assert.strictEqual(bill.tax, 2.25);
    assert.strictEqual(bill.totalAmount, 47.25);
  });

  test('Billing calculation with Cancelled order items (should exclude cost)', () => {
    const orders = [
      { price: 10.00, quantity: 2, status: 'Served' },
      { price: 15.00, quantity: 1, status: 'Cancelled' }
    ];
    // Subtotal: 20.00. Discount: 0. Tax: 20.00 * 0.05 = 1.00. Total: 21.00
    const bill = calculateBilling('Walk-in', orders);
    assert.strictEqual(bill.subtotal, 20.00);
    assert.strictEqual(bill.discount, 0.00);
    assert.strictEqual(bill.tax, 1.00);
    assert.strictEqual(bill.totalAmount, 21.00);
  });

  console.log('\n==================================================');
  console.log(`Test Execution Finished. Passes: ${passes}, Fails: ${fails}`);
  console.log('==================================================');

  // Launch end-to-end API checks using mock local server
  console.log('\nBooting up API test listener on port 3001...');
  process.env.PORT = 3001;
  const server = require('../backend/server');
  
  // Wait for server to load SQLite and boot up
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    console.log('Running API endpoints validation...');

    // API Test 1: GET /health
    const healthRes = await fetch('http://localhost:3001/health');
    const healthData = await healthRes.json();
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthData.status, 'ok');
    console.log('[PASS] API GET /health');

    // API Auth Test: Protected endpoint returns 401 without token
    const menuNoAuthRes = await fetch('http://localhost:3001/api/menu');
    assert.strictEqual(menuNoAuthRes.status, 401);
    console.log('[PASS] API GET /api/menu Access Blocked (No Token)');

    // API Auth Test: Login fails with invalid password
    const loginFailRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    assert.strictEqual(loginFailRes.status, 401);
    console.log('[PASS] API POST /api/auth/login Fails with Invalid Password');

    // API Auth Test: Login succeeds with correct credentials and returns token
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginData.success, true);
    assert.ok(loginData.token);
    let token = loginData.token;
    console.log('[PASS] API POST /api/auth/login Succeeds and Returns Token');

    // API Test 2: GET /api/menu with valid token
    const menuRes = await fetch('http://localhost:3001/api/menu', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const menuData = await menuRes.json();
    assert.strictEqual(menuRes.status, 200);
    assert.ok(menuData.length > 0);
    console.log('[PASS] API GET /api/menu with valid Token');

    // API Test 2.5: Stock Availability Toggling & Order Block Verification
    const testItem = menuData[0];
    const toggleOffRes = await fetch(`http://localhost:3001/api/menu/${testItem.id}/availability`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ is_available: 0 })
    });
    assert.strictEqual(toggleOffRes.status, 200);
    const toggleOffData = await toggleOffRes.json();
    assert.strictEqual(toggleOffData.success, true);
    
    // Verify item is out of stock in menu response
    const menuCheckRes = await fetch('http://localhost:3001/api/menu', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const menuCheckData = await menuCheckRes.json();
    const updatedTestItem = menuCheckData.find(item => item.id === testItem.id);
    assert.strictEqual(updatedTestItem.is_available, 0);
    console.log('[PASS] API PUT /api/menu/:id/availability Marks Item Out of Stock');

    // Attempt to order the out of stock item - Should be blocked
    const orderOutOfStockRes = await fetch('http://localhost:3001/api/bookings/1/orders', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ item_name: testItem.name, quantity: 1 })
    });
    assert.strictEqual(orderOutOfStockRes.status, 400);
    const orderOutOfStockData = await orderOutOfStockRes.json();
    assert.strictEqual(orderOutOfStockData.success, false);
    assert.ok(orderOutOfStockData.message.includes('out of stock'));
    console.log('[PASS] API POST /api/bookings/:id/orders Rejects Out of Stock Item');

    // Toggle back on
    const toggleOnRes = await fetch(`http://localhost:3001/api/menu/${testItem.id}/availability`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ is_available: 1 })
    });
    assert.strictEqual(toggleOnRes.status, 200);
    
    // Verify placing order succeeds now
    const orderInStockRes = await fetch('http://localhost:3001/api/bookings/1/orders', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ item_name: testItem.name, quantity: 1 })
    });
    assert.strictEqual(orderInStockRes.status, 200);
    const orderInStockData = await orderInStockRes.json();
    assert.strictEqual(orderInStockData.success, true);
    console.log('[PASS] API POST /api/bookings/:id/orders Succeeds for In Stock Item');

    // API Auth Test: Change password with incorrect current password - Should Fail
    const changePassFailRes = await fetch('http://localhost:3001/api/auth/change-password', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword: 'wrongpassword', newPassword: 'newAdminPassword123' })
    });
    const changePassFailData = await changePassFailRes.json();
    assert.strictEqual(changePassFailRes.status, 400);
    assert.strictEqual(changePassFailData.success, false);
    console.log('[PASS] API POST /api/auth/change-password Rejects Wrong Current Password');

    // API Auth Test: Change password with correct credentials - Should Succeed
    const changePassSuccessRes = await fetch('http://localhost:3001/api/auth/change-password', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword: 'admin123', newPassword: 'newAdminPassword123' })
    });
    const changePassSuccessData = await changePassSuccessRes.json();
    assert.strictEqual(changePassSuccessRes.status, 200);
    assert.strictEqual(changePassSuccessData.success, true);
    console.log('[PASS] API POST /api/auth/change-password Changes Password Successfully');

    // API Auth Test: Verify old password no longer works
    const oldLoginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.strictEqual(oldLoginRes.status, 401);
    console.log('[PASS] API POST /api/auth/login Rejects Old Password After Change');

    // API Auth Test: Verify new password works and logs in
    const newLoginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'newAdminPassword123' })
    });
    const newLoginData = await newLoginRes.json();
    assert.strictEqual(newLoginRes.status, 200);
    assert.ok(newLoginData.token);
    token = newLoginData.token;
    console.log('[PASS] API POST /api/auth/login Authenticates with New Password');

    // API Test 2.5: GET /api/admins/login-logs (Verify login logs retrieval and record contents)
    const logsRes = await fetch('http://localhost:3001/api/admins/login-logs', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    assert.strictEqual(logsRes.status, 200);
    const logsData = await logsRes.json();
    assert.strictEqual(logsData.success, true);
    assert.ok(Array.isArray(logsData.logs));
    assert.ok(logsData.logs.length >= 4); // There are at least 4 login attempts made so far in tests
    
    // Check that we logged the failed attempt
    const failedAttempt = logsData.logs.find(l => l.status === 'Failed');
    assert.ok(failedAttempt);
    assert.strictEqual(failedAttempt.username, 'admin');
    
    // Check that we logged the successful attempt
    const successAttempt = logsData.logs.find(l => l.status === 'Success');
    assert.ok(successAttempt);
    assert.strictEqual(successAttempt.username, 'admin');
    console.log('[PASS] API GET /api/admins/login-logs Fetches and Validates Login History Logs');


    // API Test 3: POST /api/bookings (Create duplicate booking time overlap - Should fail)
    // There is seeded booking Vikram Singh: Table 7 on 2026-06-08 at 20:30
    const bookingFailRes = await fetch('http://localhost:3001/api/bookings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        guest_name: 'Conflict Guest',
        guest_type: 'Walk-in',
        table_number: 7,
        booking_date: '2026-06-08',
        booking_time: '21:00', // overlaps with 20:30
        guest_count: 2
      })
    });
    const bookingFailData = await bookingFailRes.json();
    assert.strictEqual(bookingFailRes.status, 400);
    assert.strictEqual(bookingFailData.success, false);
    assert.ok(bookingFailData.message.includes('overlaps') || bookingFailData.message.includes('already booked'));
    console.log('[PASS] API POST /api/bookings Double Booking Overlap Blocked');

    // API Test 4: POST /api/bookings (Exceed table capacity - Should fail)
    // Table 1 capacity is 2. Attempt to book for 4.
    const capacityFailRes = await fetch('http://localhost:3001/api/bookings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        guest_name: 'Overpax Guest',
        guest_type: 'Walk-in',
        table_number: 1,
        booking_date: '2026-06-08',
        booking_time: '14:00',
        guest_count: 4
      })
    });
    const capacityFailData = await capacityFailRes.json();
    assert.strictEqual(capacityFailRes.status, 400);
    assert.strictEqual(capacityFailData.success, false);
    assert.ok(capacityFailData.message.includes('capacity'));
    console.log('[PASS] API POST /api/bookings Table Capacity Overrun Blocked');
    
    // API Test 5: GET /api/payments/history (Succeeds and returns payment records)
    const historyRes = await fetch('http://localhost:3001/api/payments/history', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const historyData = await historyRes.json();
    assert.strictEqual(historyRes.status, 200);
    assert.strictEqual(historyData.success, true);
    assert.ok(Array.isArray(historyData.history));
    assert.ok(historyData.history.length > 0);
    console.log('[PASS] API GET /api/payments/history Returns Valid History');

    // API Test 6: Block modifications for already paid bookings
    const paidBookingId = 3;
    
    // Attempt to add order item to a paid booking - Should fail
    const addOrderPaidRes = await fetch(`http://localhost:3001/api/bookings/${paidBookingId}/orders`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ item_name: 'Chicken 65', quantity: 1 })
    });
    assert.strictEqual(addOrderPaidRes.status, 400);
    const addOrderPaidData = await addOrderPaidRes.json();
    assert.strictEqual(addOrderPaidData.success, false);
    assert.ok(addOrderPaidData.message.includes('already settled'));
    console.log('[PASS] API POST /api/bookings/:id/orders Blocked on Paid Bill');

    // Attempt to update booking details of a paid booking - Should fail
    const updateBookingPaidRes = await fetch(`http://localhost:3001/api/bookings/${paidBookingId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        guest_name: 'Modified Name',
        table_number: 1,
        booking_date: '2026-06-08',
        booking_time: '19:00',
        guest_count: 2,
        status: 'Active'
      })
    });
    assert.strictEqual(updateBookingPaidRes.status, 400);
    const updateBookingPaidData = await updateBookingPaidRes.json();
    assert.strictEqual(updateBookingPaidData.success, false);
    assert.ok(updateBookingPaidData.message.includes('already settled'));
    console.log('[PASS] API PUT /api/bookings/:id Blocked on Paid Bill');

    // API Test 7: Record Payment via UPI
    const upiPayRes = await fetch('http://localhost:3001/api/bookings/2/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ payment_method: 'UPI' })
    });
    assert.strictEqual(upiPayRes.status, 200);
    const upiPayData = await upiPayRes.json();
    assert.strictEqual(upiPayData.success, true);
    console.log('[PASS] API POST /api/bookings/:id/payments Succeeds for UPI Method');

    console.log('[PASS] All API verification endpoints completed successfully.');
    
    // Clean shutdown
    const serverInstance = server.getServerInstance();
    if (serverInstance) {
      console.log('Closing test server instance...');
      await new Promise((resolve) => serverInstance.close(resolve));
    }
    
    const { closeDb } = require('../backend/db');
    console.log('Closing SQLite database connection...');
    await closeDb();
    
    // Clean up temporary test database
    const fs = require('fs');
    const path = require('path');
    const testDbFile = path.join(__dirname, '../backend/test_aura_cafe.db');
    if (fs.existsSync(testDbFile)) {
      try {
        fs.unlinkSync(testDbFile);
        console.log('Deleted temporary test database file.');
      } catch (e) {
        console.warn('Could not delete test database file:', e.message);
      }
    }
    
    console.log('All tests completed successfully. Graceful exit.');
    setTimeout(() => {
      process.exit(0);
    }, 200);
  } catch (apiErr) {
    console.error('[FAIL] API endpoint validation failed:', apiErr);
    try {
      const serverInstance = server.getServerInstance();
      if (serverInstance) serverInstance.close();
      const { closeDb } = require('../backend/db');
      await closeDb();
      
      const fs = require('fs');
      const path = require('path');
      const testDbFile = path.join(__dirname, '../backend/test_aura_cafe.db');
      if (fs.existsSync(testDbFile)) {
        fs.unlinkSync(testDbFile);
      }
    } catch (e) {}
    process.exit(1);
  }
}

runTests();
