# Hotel Restaurant Table Booking & Menu Management System - Aura Cafe

An interactive, premium web application built for **Aura Cafe** to manage in-house restaurant reservations, table availability, menu ordering, dietary preference compliance, and billing integrations.

---

## 🚀 Key Features

1. **Operations Dashboard**:
   - Live metrics: Paid Revenue, Table Occupancy Rate, Active Bookings, Active Operations Warnings.
   - Interactive **Live Table Map**: 10 tables color-coded by real-time occupancy. Click to view booking or check out.
   - **Category Food Images**: Contextual, premium illustrations (Appetizers, Main Courses, Desserts, Beverages) inside the menu catalog.
   - **Analytics Charts**: Dynamic trends (total bookings, daily revenue generation, status distributions) rendered with Chart.js.
2. **Table Seating & Reservation Forms**:
   - Checks guest counts against table sizes (2, 4, 6, or 8 seats).
   - Prompts for Room Number if guest is an in-house hotel diner.
3. **Core Business Logic Engine**:
   - Checks and blocks overlaps (prevents booking a table within 2 hours of an active slot).
   - Checks menu orders against guest dietary preferences (e.g. Vegetarian, Vegan, Gluten-Free, Nut-Allergy) and flags conflicts.
   - Applies 10% discount for hotel guest room charges, 18% GST tax, and processes payments.
4. **Data Exports**:
   - One-click export of booking ledger into standard CSV formatting.
   - Printable billing receipts.

---

## 📁 Directory Structure

```
sasi-hotel/
├── backend/
│   ├── db.js                 # SQLite database helper and seeder
│   ├── server.js             # Express API server configuration
│   └── businessEngine.js     # Core business logic processing rules
├── frontend/
│   ├── index.html            # Single Page Application HTML shell
│   ├── app.js                # Frontend state and API controllers
│   └── style.css             # Premium glassmorphic styling
├── docs/
│   ├── problem_statement.md  # Business case and abstract
│   ├── objectives.md         # Specific testable goals
│   ├── database_design.md    # Schema descriptions and ER diagrams
│   ├── api_spec.md           # API request/response contracts
│   └── literature_survey.md  # Research reviews
├── tests/
│   └── run_tests.js          # Automated validation test runner
├── package.json              # App manifest & commands
└── README.md                 # Running instructions
```

---

## 🛠️ Installation & Setup

1. **Verify Environment**:
   Ensure Node.js (v18+) is installed on your system.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Start the Application**:
   ```bash
   npm start
   ```
   *Note: To run on a custom port (e.g. 3002) if port 3000 is occupied, run:*
   ```powershell
   $env:PORT=3002; npm start
   ```

---

## 🧪 Running Automated Tests

To verify double-booking engines, table capacities, billing calculations, and API routes:
```bash
npm test
```
Outputs list of 22+ successful logical assertions and end-to-end API validations.
