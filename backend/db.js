const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dbPath = process.env.NODE_ENV === 'test'
  ? path.join(__dirname, 'test_aura_cafe.db')
  : path.join(__dirname, 'aura_cafe.db');

// Ensure db file directory exists
if (!fs.existsSync(__dirname)) {
  fs.mkdirSync(__dirname, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database opening error:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Helper wrapper to use async/await with SQLite
const dbQuery = {
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  exec: (sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

// Initialize schema
async function initDb() {
  // Users table for Admin Authentication
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'staff')) DEFAULT 'admin',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Admins table
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_code TEXT,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('Super Admin', 'Admin')) DEFAULT 'Admin',
      status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Trigger to generate admin_code in ADM-1001 format
  await dbQuery.exec(`
    CREATE TRIGGER IF NOT EXISTS generate_admin_code
    AFTER INSERT ON admins
    BEGIN
      UPDATE admins
      SET admin_code = 'ADM-' || (1000 + NEW.id)
      WHERE id = NEW.id;
    END;
  `);

  // Sessions table to persist active login sessions across server restarts
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS active_sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Admin login logs for auditing
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS admin_login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER,
      full_name TEXT,
      username TEXT NOT NULL,
      login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL,
      reason TEXT
    )
  `);

  // Migrate legacy active session roles to new format
  await dbQuery.run("UPDATE active_sessions SET role = 'Super Admin' WHERE role = 'admin'");
  await dbQuery.run("UPDATE active_sessions SET role = 'Admin' WHERE role = 'staff'");



  // Table Bookings
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS hotel_restaurant_table_booking_menu (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      guest_type TEXT CHECK(guest_type IN ('Hotel Guest', 'Walk-in')) NOT NULL,
      room_number TEXT,
      table_number INTEGER,
      booking_date TEXT NOT NULL,
      booking_time TEXT NOT NULL,
      guest_count INTEGER NOT NULL,
      dietary_preference TEXT CHECK(dietary_preference IN ('None', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Nut-Allergy', 'Non-Veg', 'Starters')) DEFAULT 'None',
      status TEXT CHECK(status IN ('Active', 'Completed', 'Cancelled', 'Archived')) DEFAULT 'Active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: Make table_number nullable if it was defined as NOT NULL
  const tableInfo = await dbQuery.all("PRAGMA table_info(hotel_restaurant_table_booking_menu)");
  const tableNumCol = tableInfo.find(c => c.name === 'table_number');
  if (tableNumCol && tableNumCol.notnull === 1) {
    console.log('Migrating hotel_restaurant_table_booking_menu: dropping NOT NULL constraint from table_number...');
    await dbQuery.exec("PRAGMA foreign_keys=OFF;");
    await dbQuery.exec("BEGIN TRANSACTION;");
    await dbQuery.exec("ALTER TABLE hotel_restaurant_table_booking_menu RENAME TO _hotel_restaurant_table_booking_menu_old;");
    await dbQuery.exec(`
      CREATE TABLE hotel_restaurant_table_booking_menu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guest_name TEXT NOT NULL,
        guest_type TEXT CHECK(guest_type IN ('Hotel Guest', 'Walk-in')) NOT NULL,
        room_number TEXT,
        table_number INTEGER,
        booking_date TEXT NOT NULL,
        booking_time TEXT NOT NULL,
        guest_count INTEGER NOT NULL,
        dietary_preference TEXT CHECK(dietary_preference IN ('None', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Nut-Allergy', 'Non-Veg', 'Starters')) DEFAULT 'None',
        status TEXT CHECK(status IN ('Active', 'Completed', 'Cancelled', 'Archived')) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await dbQuery.exec(`
      INSERT INTO hotel_restaurant_table_booking_menu (
        id, guest_name, guest_type, room_number, table_number, booking_date, booking_time, guest_count, dietary_preference, status, created_at, updated_at
      )
      SELECT 
        id, guest_name, guest_type, room_number, table_number, booking_date, booking_time, guest_count, dietary_preference, status, created_at, updated_at
      FROM _hotel_restaurant_table_booking_menu_old;
    `);
    await dbQuery.exec("DROP TABLE _hotel_restaurant_table_booking_menu_old;");
    await dbQuery.exec("COMMIT;");
    await dbQuery.exec("PRAGMA foreign_keys=ON;");
    console.log('Database table_number nullability migration complete.');
  }

  // Migration: Update dietary_preference CHECK constraint to include 'Non-Veg' and 'Starters'
  const masterInfo = await dbQuery.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='hotel_restaurant_table_booking_menu'");
  if (masterInfo && masterInfo.sql && (!masterInfo.sql.includes("'Non-Veg'") || !masterInfo.sql.includes("'Starters'"))) {
    console.log("Migrating hotel_restaurant_table_booking_menu: updating CHECK constraint on dietary_preference to include 'Non-Veg' and 'Starters'...");
    await dbQuery.exec("PRAGMA foreign_keys=OFF;");
    await dbQuery.exec("BEGIN TRANSACTION;");
    await dbQuery.exec("ALTER TABLE hotel_restaurant_table_booking_menu RENAME TO _hotel_restaurant_table_booking_menu_old2;");
    await dbQuery.exec(`
      CREATE TABLE hotel_restaurant_table_booking_menu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guest_name TEXT NOT NULL,
        guest_type TEXT CHECK(guest_type IN ('Hotel Guest', 'Walk-in')) NOT NULL,
        room_number TEXT,
        table_number INTEGER,
        booking_date TEXT NOT NULL,
        booking_time TEXT NOT NULL,
        guest_count INTEGER NOT NULL,
        dietary_preference TEXT CHECK(dietary_preference IN ('None', 'Vegetarian', 'Vegan', 'Gluten-Free', 'Nut-Allergy', 'Non-Veg', 'Starters')) DEFAULT 'None',
        status TEXT CHECK(status IN ('Active', 'Completed', 'Cancelled', 'Archived')) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await dbQuery.exec(`
      INSERT INTO hotel_restaurant_table_booking_menu (
        id, guest_name, guest_type, room_number, table_number, booking_date, booking_time, guest_count, dietary_preference, status, created_at, updated_at
      )
      SELECT 
        id, guest_name, guest_type, room_number, table_number, booking_date, booking_time, guest_count, dietary_preference, status, created_at, updated_at
      FROM _hotel_restaurant_table_booking_menu_old2;
    `);
    await dbQuery.exec("DROP TABLE _hotel_restaurant_table_booking_menu_old2;");
    await dbQuery.exec("COMMIT;");
    await dbQuery.exec("PRAGMA foreign_keys=ON;");
    console.log("Database dietary_preference CHECK constraint migration complete.");
  }

  // Menu items (static list for reference)
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      dietary_tags TEXT NOT NULL,
      image_url TEXT
    )
  `);

  // Migration: Add image_url column to menu_items if it doesn't exist
  const menuInfo = await dbQuery.all("PRAGMA table_info(menu_items)");
  const hasImageUrl = menuInfo.some(c => c.name === 'image_url');
  if (!hasImageUrl) {
    console.log("Migrating menu_items: adding image_url column...");
    await dbQuery.run("ALTER TABLE menu_items ADD COLUMN image_url TEXT");
  }
  const hasIsAvailable = menuInfo.some(c => c.name === 'is_available');
  if (!hasIsAvailable) {
    console.log("Migrating menu_items: adding is_available column...");
    await dbQuery.run("ALTER TABLE menu_items ADD COLUMN is_available INTEGER DEFAULT 1");
  }

  // Orders associated with table bookings
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER REFERENCES hotel_restaurant_table_booking_menu(id) ON DELETE CASCADE,
      item_name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      dietary_tags TEXT NOT NULL,
      status TEXT CHECK(status IN ('Pending', 'Served', 'Cancelled')) DEFAULT 'Pending'
    )
  `);

  // Migration: Update orders foreign key reference if pointing to renamed table
  const ordersMaster = await dbQuery.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'");
  if (ordersMaster && ordersMaster.sql && ordersMaster.sql.includes('_hotel_restaurant_table_booking_menu_old')) {
    console.log("Migrating orders: fixing broken foreign key reference pointing to renamed old table...");
    await dbQuery.exec("PRAGMA foreign_keys=OFF;");
    await dbQuery.exec("BEGIN TRANSACTION;");
    await dbQuery.exec("ALTER TABLE orders RENAME TO _orders_old;");
    await dbQuery.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER REFERENCES hotel_restaurant_table_booking_menu(id) ON DELETE CASCADE,
        item_name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        dietary_tags TEXT NOT NULL,
        status TEXT CHECK(status IN ('Pending', 'Served', 'Cancelled')) DEFAULT 'Pending'
      )
    `);
    await dbQuery.exec(`
      INSERT INTO orders (id, booking_id, item_name, category, price, quantity, dietary_tags, status)
      SELECT id, booking_id, item_name, category, price, quantity, dietary_tags, status
      FROM _orders_old;
    `);
    await dbQuery.exec("DROP TABLE _orders_old;");
    await dbQuery.exec("COMMIT;");
    await dbQuery.exec("PRAGMA foreign_keys=ON;");
    console.log("Database orders foreign key reference migration complete.");
  }

  // Payments integration
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER REFERENCES hotel_restaurant_table_booking_menu(id) ON DELETE CASCADE,
      payment_method TEXT CHECK(payment_method IN ('Card', 'Cash', 'Room Charge', 'Unpaid', 'UPI')) DEFAULT 'Unpaid',
      subtotal REAL DEFAULT 0.0,
      discount REAL DEFAULT 0.0,
      tax REAL DEFAULT 0.0,
      total_amount REAL DEFAULT 0.0,
      status TEXT CHECK(status IN ('Unpaid', 'Paid', 'Refunded')) DEFAULT 'Unpaid',
      payment_date TEXT
    )
  `);

  // Migration: Update payment_method CHECK constraint to include 'UPI'
  const paymentsMaster = await dbQuery.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'");
  if (paymentsMaster && paymentsMaster.sql && !paymentsMaster.sql.includes("'UPI'")) {
    console.log("Migrating payments: updating CHECK constraint on payment_method to include 'UPI'...");
    await dbQuery.exec("PRAGMA foreign_keys=OFF;");
    await dbQuery.exec("BEGIN TRANSACTION;");
    await dbQuery.exec("ALTER TABLE payments RENAME TO _payments_old;");
    await dbQuery.exec(`
      CREATE TABLE payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER REFERENCES hotel_restaurant_table_booking_menu(id) ON DELETE CASCADE,
        payment_method TEXT CHECK(payment_method IN ('Card', 'Cash', 'Room Charge', 'Unpaid', 'UPI')) DEFAULT 'Unpaid',
        subtotal REAL DEFAULT 0.0,
        discount REAL DEFAULT 0.0,
        tax REAL DEFAULT 0.0,
        total_amount REAL DEFAULT 0.0,
        status TEXT CHECK(status IN ('Unpaid', 'Paid', 'Refunded')) DEFAULT 'Unpaid',
        payment_date TEXT
      )
    `);
    await dbQuery.exec(`
      INSERT INTO payments (id, booking_id, payment_method, subtotal, discount, tax, total_amount, status)
      SELECT id, booking_id, payment_method, subtotal, discount, tax, total_amount, status
      FROM _payments_old;
    `);
    await dbQuery.exec("DROP TABLE _payments_old;");
    await dbQuery.exec("COMMIT;");
    await dbQuery.exec("PRAGMA foreign_keys=ON;");
    console.log("Database payments CHECK constraint migration complete.");
  }

  // Migration: Add payment_date column if missing (for existing databases)
  const paymentsInfo = await dbQuery.all("PRAGMA table_info(payments)");
  const hasPaymentDate = paymentsInfo.some(c => c.name === 'payment_date');
  if (!hasPaymentDate) {
    console.log("Migrating payments: adding payment_date column...");
    await dbQuery.run("ALTER TABLE payments ADD COLUMN payment_date TEXT");
    // Backfill payment_date for existing paid payments
    await dbQuery.run(`
      UPDATE payments 
      SET payment_date = (
        SELECT booking_date 
        FROM hotel_restaurant_table_booking_menu 
        WHERE id = payments.booking_id
      ) 
      WHERE status = 'Paid' AND payment_date IS NULL
    `);
    console.log("Database payments payment_date migration complete.");
  }

  // Migration: Add new columns to hotel_restaurant_table_booking_menu for Feature 2 and Feature 4
  const bookingInfo = await dbQuery.all("PRAGMA table_info(hotel_restaurant_table_booking_menu)");
  const addBookingColumnIfMissing = async (colName, colType) => {
    if (!bookingInfo.some(c => c.name === colName)) {
      console.log(`Migrating hotel_restaurant_table_booking_menu: adding ${colName} column...`);
      try {
        await dbQuery.run(`ALTER TABLE hotel_restaurant_table_booking_menu ADD COLUMN ${colName} ${colType}`);
      } catch (err) {
        console.error(`Error adding column ${colName}:`, err.message);
      }
    }
  };
  await addBookingColumnIfMissing('phone', 'TEXT');
  await addBookingColumnIfMissing('email', 'TEXT');
  await addBookingColumnIfMissing('reminder_sent', 'INTEGER DEFAULT 0');
  await addBookingColumnIfMissing('feedback_sent', 'INTEGER DEFAULT 0');
  await addBookingColumnIfMissing('payment_status', "TEXT DEFAULT 'pending'");
  await addBookingColumnIfMissing('payment_id', 'TEXT');
  await addBookingColumnIfMissing('razorpay_order_id', 'TEXT');

  // Create feedback table for Feature 3
  await dbQuery.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER REFERENCES hotel_restaurant_table_booking_menu(id) ON DELETE CASCADE,
      guest_name TEXT NOT NULL,
      overall_rating INTEGER NOT NULL,
      food_rating INTEGER NOT NULL,
      service_rating INTEGER NOT NULL,
      ambience_rating INTEGER NOT NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);




  // Seed Menu Items if empty
  const menuCount = await dbQuery.get('SELECT COUNT(*) as count FROM menu_items');
  if (menuCount.count === 0) {
    const items = [
      // VEG BURGERS
      ['Crispy Veg Burger', 'Veg Burgers', 99.00, 'None', 'https://images.unsplash.com/photo-1571091718767-18b5b1457add'],
      ['Paneer Burger', 'Veg Burgers', 119.00, 'None', 'https://images.unsplash.com/photo-1525059696034-4967a8e1dca2'],
      ['Veg Mini Burger 8Pic', 'Veg Burgers', 79.00, 'None', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd'],

      // EGG
      ['Plain Egg', 'Egg Items', 29.00, 'None', 'https://images.unsplash.com/photo-1587486913049-53fc88980cfc'],
      ['Scrambled Egg', 'Egg Items', 39.00, 'None', 'https://images.unsplash.com/photo-1551183053-bf91a1d81141'],
      ['Bread Omlete', 'Egg Items', 70.00, 'None', 'https://images.unsplash.com/photo-1525351484163-7529414344d8'],
      ['Sunny Side Up', 'Egg Items', 29.00, 'None', 'https://images.unsplash.com/photo-1506084868230-bb9d95c24759'],
      ['Cheese omlete', 'Egg Items', 39.00, 'None', 'https://images.unsplash.com/photo-1600271886742-f049cd451bba'],

      // NON VEG BURGERS
      ['Crispy Chicken Burger', 'Non-Veg Burgers', 119.00, 'None', 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b'],
      ['BBQ Chicken Burger', 'Non-Veg Burgers', 129.00, 'None', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd'],
      ['Chicken Smash Burger', 'Non-Veg Burgers', 139.00, 'None', 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5'],
      ['Chicken Mini Burger 8 Pic', 'Non-Veg Burgers', 99.00, 'None', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd'],

      // FRIED VEG
      ['French Fries', 'Fried Veg', 69.00, 'None', 'https://images.unsplash.com/photo-1576107232684-1279f390859f'],
      ['Peri Peri Fries', 'Fried Veg', 89.00, 'None', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877'],
      ['Veg Fried Chees Balls', 'Fried Veg', 79.00, 'None', 'https://images.unsplash.com/photo-1548340748-6d2b7d7db87d'],
      ['Smiley Fries', 'Fried Veg', 69.00, 'None', 'https://images.unsplash.com/photo-1576107232684-1279f390859f'],
      ['Veg Nuggets', 'Fried Veg', 79.00, 'None', 'https://images.unsplash.com/photo-1562967914-608f82629710'],

      // VEG STARTERS
      ['Chilli Paneer', 'Veg Starters', 79.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Gobi 65', 'Veg Starters', 69.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],
      ['Chilli Mushroom', 'Veg Starters', 95.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Mushroom 65', 'Veg Starters', 89.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],
      ['Paneer Manchurian', 'Veg Starters', 99.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Paneer 65', 'Veg Starters', 89.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],
      ['Baby Corn Starter', 'Veg Starters', 89.00, 'None', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd'],
      ['Gobi Manchurian', 'Veg Starters', 69.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],

      // NON-VEG STARTERS
      ['Chicken 65', 'Non-Veg Starters', 120.00, 'None', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143'],
      ['Chilli Chicken', 'Non-Veg Starters', 139.00, 'None', 'https://images.unsplash.com/photo-1598515214211-89d3e73ae83b'],
      ['Lemon Chicken', 'Non-Veg Starters', 140.00, 'None', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143'],
      ['Pepper Chicken', 'Non-Veg Starters', 140.00, 'None', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143'],
      ['Garlic Chicken', 'Non-Veg Starters', 119.00, 'None', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143'],
      ['Dragon Chicken', 'Non-Veg Starters', 160.00, 'None', 'https://images.unsplash.com/photo-1527324688151-0e627063f2b1'],
      ['Kaju Chicken', 'Non-Veg Starters', 159.00, 'None', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143'],
      ['Juicy Lolipop', 'Non-Veg Starters', 180.00, 'None', 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7'],
      ['Dry Chicken', 'Non-Veg Starters', 139.00, 'None', 'https://images.unsplash.com/photo-1598515214211-89d3e73ae83b'],
      ['Chilly Prawns', 'Non-Veg Starters', 170.00, 'None', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641'],
      ['Prawns 65', 'Non-Veg Starters', 149.00, 'None', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641'],
      ['Prawns Pepper', 'Non-Veg Starters', 190.00, 'None', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641'],
      ['Prawns Manchurian', 'Non-Veg Starters', 190.00, 'None', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641'],

      // BIRYANI
      ['Peddamma Biriyani', 'Biryani', 140.00, 'None', 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8'],

      // VEG FRIED RICE
      ['Veg Fried Rice (Normal)', 'Fried Rice', 69.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],
      ['Veg Fried Rice (Schezwan)', 'Fried Rice', 79.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],
      ['Panner Fried Rice (Normal)', 'Fried Rice', 100.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Panner Fried Rice (Schezwan)', 'Fried Rice', 110.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Mushroom Fried Rice (Normal)', 'Fried Rice', 89.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],
      ['Mushroom Fried Rice (Schezwan)', 'Fried Rice', 99.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],
      ['Mixed Veg Fried Rice (Normal)', 'Fried Rice', 120.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],
      ['Mixed Veg Fried Rice (Schezwan)', 'Fried Rice', 140.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],
      ['Ghee Rice', 'Fried Rice', 79.00, 'None', 'https://images.unsplash.com/photo-1601050690597-df056fb4ce78'],

      // FRIED RICE NON-VEG
      ['Chicken Fried Rice (Normal)', 'Fried Rice', 120.00, 'None', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143'],
      ['Chicken Fried Rice (Schezwan)', 'Fried Rice', 140.00, 'None', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143'],
      ['Chicken Keema Rice (Normal)', 'Fried Rice', 119.00, 'None', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143'],
      ['Chicken Keema Rice (Schezwan)', 'Fried Rice', 119.00, 'None', 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143'],
      ['Egg Rice (Normal)', 'Fried Rice', 100.00, 'None', 'https://images.unsplash.com/photo-1587486913049-53fc88980cfc'],
      ['Egg Rice (Schezwan)', 'Fried Rice', 120.00, 'None', 'https://images.unsplash.com/photo-1587486913049-53fc88980cfc'],
      ['Prawns Rice (Normal)', 'Fried Rice', 150.00, 'None', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641'],
      ['Prawns Rice (Schezwan)', 'Fried Rice', 170.00, 'None', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641'],

      // MOMO'S
      ["Veg Steamed Momo's", 'Momos', 75.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ["Veg Fried Momo's", 'Momos', 85.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ["Chicken Steamed Momo's", 'Momos', 109.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ["Chicken Fried Momo's", 'Momos', 119.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],

      // NOODLES
      ['Veg Fried Noodles (Normal)', 'Noodles', 69.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Veg Fried Noodles (Schezwan)', 'Noodles', 79.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Panner Fried Noodles (Normal)', 'Noodles', 100.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Panner Fried Noodles (Schezwan)', 'Noodles', 110.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Mushroom Noodles (Normal)', 'Noodles', 99.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Mushroom Noodles (Schezwan)', 'Noodles', 109.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Gobi Fried Noodles (Normal)', 'Noodles', 79.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Gobi Fried Noodles (Schezwan)', 'Noodles', 89.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Mixed Veg Noodles (Normal)', 'Noodles', 119.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Mixed Veg Noodles (Schezwan)', 'Noodles', 129.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],

      // NOODLES NON-VEG
      ['Chicken Noodles (Normal)', 'Noodles', 120.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Chicken Noodles (Schezwan)', 'Noodles', 140.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Chicken Keema Noodles (Normal)', 'Noodles', 119.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Chicken Keema Noodles (Schezwan)', 'Noodles', 119.00, 'None', 'https://images.unsplash.com/photo-1585032226651-759b368d7246'],
      ['Prawns Fried Noodles (Normal)', 'Noodles', 139.00, 'None', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641'],
      ['Prawns Fried Noodles (Schezwan)', 'Noodles', 149.00, 'None', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641'],

      // MAGGIE
      ['Maggie', 'Maggi', 39.00, 'None', 'https://images.unsplash.com/photo-1612966608967-312ba599102e'],
      ['Veg Maggie', 'Maggi', 49.00, 'None', 'https://images.unsplash.com/photo-1612966608967-312ba599102e'],
      ['Egg Maggie', 'Maggi', 59.00, 'None', 'https://images.unsplash.com/photo-1612966608967-312ba599102e'],
      ['Paneer Maggie', 'Maggi', 79.00, 'None', 'https://images.unsplash.com/photo-1612966608967-312ba599102e'],
      ['Cheese Maggie', 'Maggi', 79.00, 'None', 'https://images.unsplash.com/photo-1612966608967-312ba599102e'],

      // MILK SHAKE
      ['Strawberry Shake', 'Milkshakes', 99.00, 'None', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699'],
      ['Oreo Shake', 'Milkshakes', 99.00, 'None', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699'],
      ['Vanilla Shake', 'Milkshakes', 79.00, 'None', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699'],
      ['Chocolate Shake', 'Milkshakes', 89.00, 'None', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699'],
      ['Cold Coffee', 'Milkshakes', 139.00, 'None', 'https://images.unsplash.com/photo-1572490122747-3968b75cc699'],

      // FRESH FRUIT JUICE
      ['Lemon', 'Fresh Fruit Juices', 39.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Watermelon', 'Fresh Fruit Juices', 49.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Pomegranate', 'Fresh Fruit Juices', 90.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Pineapple', 'Fresh Fruit Juices', 70.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Orange', 'Fresh Fruit Juices', 69.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Apple', 'Fresh Fruit Juices', 90.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      ['Grapes', 'Fresh Fruit Juices', 49.00, 'None', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb'],
      
      // Test suite required items (for public_orders_test.js and room_service_test.js compatibility)
      ['Veg Biryani', 'Biryani', 250.00, 'None', 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8'],
      ['Tomato Soup', 'Soups', 120.00, 'None', 'https://images.pexels.com/photos/539451/pexels-photo-539451.jpeg'],
      ['Gulab Jamun', 'Desserts', 90.00, 'None', 'https://i.pinimg.com/736x/30/6e/ac/306eac21d95c385ed486ea5da524b8a5.jpg']
    ];

    for (let item of items) {
      await dbQuery.run(
        'INSERT INTO menu_items (name, category, price, dietary_tags, image_url) VALUES (?, ?, ?, ?, ?)',
        item
      );
    }
    console.log('Seeded menu items successfully.');
  }

  // Seed Admin user if empty
  const userCount = await dbQuery.get('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    const passwordHash = crypto.createHash('sha256').update('admin123').digest('hex');
    await dbQuery.run(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      ['admin', passwordHash, 'admin']
    );
    console.log('Seeded default admin user successfully.');
  }

  // Seed default admin in admins table if empty
  const adminCount = await dbQuery.get('SELECT COUNT(*) as count FROM admins');
  if (adminCount.count === 0) {
    const passwordHash = crypto.createHash('sha256').update('admin123').digest('hex');
    await dbQuery.run(
      'INSERT INTO admins (full_name, email, username, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      ['Default Admin', 'admin@auracafe.com', 'admin', passwordHash, 'Super Admin', 'Active']
    );
    console.log('Seeded default Super Admin user successfully.');
  }

  // Seed some initial bookings ONLY in test environment to make test suite pass
  if (process.env.NODE_ENV === 'test') {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const bookingsCount = await dbQuery.get('SELECT COUNT(*) as count FROM hotel_restaurant_table_booking_menu');
    if (bookingsCount.count === 0) {
      const sampleBookings = [
        ['Rajesh Kumar', 'Hotel Guest', '302', 3, '2026-06-08', '19:30', 4, 'None', 'Active'],
        ['Sarah Jenkins', 'Walk-in', null, 5, '2026-06-08', '20:00', 2, 'None', 'Active'],
        ['Amit Sharma', 'Hotel Guest', '104', 1, '2026-06-08', '13:00', 3, 'None', 'Completed'],
        ['Priya Patel', 'Walk-in', null, 8, '2026-06-09', '18:00', 6, 'None', 'Active'],
        ['David Miller', 'Hotel Guest', '405', 2, '2026-06-07', '21:00', 2, 'None', 'Completed'],
        ['Ananya Rao', 'Hotel Guest', '212', 4, '2026-06-08', '19:00', 5, 'None', 'Active'],
        ['John Doe', 'Walk-in', null, 9, '2026-06-08', '12:30', 4, 'None', 'Cancelled'],
        ['Vikram Singh', 'Hotel Guest', '308', 7, '2026-06-08', '20:30', 2, 'None', 'Active'],
        ['Emily Watson', 'Walk-in', null, 10, '2026-06-08', '21:00', 8, 'None', 'Active'],
        ['Karan Johar', 'Walk-in', null, 6, yesterdayStr, '19:00', 4, 'None', 'Completed'],
        ['Emily Watson Yesterday', 'Hotel Guest', '204', null, yesterdayStr, '20:30', 2, 'None', 'Completed']
      ];

      for (let b of sampleBookings) {
        const result = await dbQuery.run(
          `INSERT INTO hotel_restaurant_table_booking_menu 
           (guest_name, guest_type, room_number, table_number, booking_date, booking_time, guest_count, dietary_preference, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          b
        );
        
        const bookingId = result.id;
        
        // Add a payment record
        await dbQuery.run(
          `INSERT INTO payments (booking_id, payment_method, subtotal, discount, tax, total_amount, status) 
           VALUES (?, 'Unpaid', 0, 0, 0, 0, 'Unpaid')`,
          [bookingId]
        );

        // For completed ones, add some orders and pay them
        if (b[8] === 'Completed') {
          // Add orders
          let ordersList = [];
          if (b[0] === 'Amit Sharma') {
            ordersList = [
              ['Paneer Butter Masala', 'Main Course (Veg)', 280.00, 2, 'None'],
              ['Jeera Rice', 'Main Course (Veg)', 180.00, 1, 'None']
            ];
          } else if (b[0] === 'David Miller') {
            ordersList = [
              ['Veg Biryani', 'Main Course (Veg)', 250.00, 2, 'None'],
              ['Kaddu Ki Kheer', 'Desserts', 120.00, 2, 'None']
            ];
          } else if (b[0] === 'Karan Johar') {
            ordersList = [
              ['Chicken 65', 'Starters', 250.00, 2, 'None'],
              ['Chicken Biryani', 'Main Course (Non-Veg)', 320.00, 2, 'None'],
              ['Jeera Rice', 'Main Course (Veg)', 180.00, 1, 'None']
            ];
          } else if (b[0] === 'Emily Watson Yesterday') {
            ordersList = [
              ['Veg Manchuria', 'Starters', 180.00, 1, 'None'],
              ['Paneer Butter Masala', 'Main Course (Veg)', 280.00, 1, 'None'],
              ['Jeera Rice', 'Main Course (Veg)', 180.00, 1, 'None'],
              ['Brownie with Ice Cream', 'Desserts', 180.00, 2, 'None']
            ];
          }

          let subtotal = 0;
          for (let ord of ordersList) {
            await dbQuery.run(
              `INSERT INTO orders (booking_id, item_name, category, price, quantity, dietary_tags, status) 
               VALUES (?, ?, ?, ?, ?, ?, 'Served')`,
              [bookingId, ord[0], ord[1], ord[2], ord[3], ord[4]]
            );
            subtotal += ord[2] * ord[3];
          }

          // Update payment
          const discount = b[1] === 'Hotel Guest' ? subtotal * 0.10 : 0.0;
          const tax = (subtotal - discount) * 0.05; // 5% tax
          const total = subtotal - discount + tax;

          await dbQuery.run(
            `UPDATE payments 
             SET payment_method = ?, subtotal = ?, discount = ?, tax = ?, total_amount = ?, status = 'Paid', payment_date = ? 
             WHERE booking_id = ?`,
            [b[1] === 'Hotel Guest' ? 'Room Charge' : 'Card', subtotal, discount, tax, total, b[4], bookingId]
          );
        }
      }
      console.log('Seeded sample bookings and payments successfully in test environment.');
    }
  }



  // Self-heal: Automatically complete any bookings that are paid but marked as Active, and sync payment_status
  await dbQuery.run(`
    UPDATE hotel_restaurant_table_booking_menu 
    SET payment_status = 'paid'
    WHERE id IN (SELECT booking_id FROM payments WHERE status = 'Paid')
  `);

  await dbQuery.run(`
    UPDATE hotel_restaurant_table_booking_menu 
    SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'Active' AND id IN (SELECT booking_id FROM payments WHERE status = 'Paid')
  `);

  // Self-heal: Create default payments for any orphan bookings
  await dbQuery.run(`
    INSERT INTO payments (booking_id, payment_method, subtotal, discount, tax, total_amount, status)
    SELECT id, 'Unpaid', 0.0, 0.0, 0.0, 0.0, 'Unpaid'
    FROM hotel_restaurant_table_booking_menu
    WHERE id NOT IN (SELECT booking_id FROM payments)
  `);

}

function closeDb() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  db,
  dbQuery,
  initDb,
  closeDb
};
