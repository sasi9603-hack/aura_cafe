# Project Objectives

This document lists the 5 core objectives for each role in the project.

---

## 1. Frontend Objectives (Student 1)
1. **Glassmorphic Layout**: Implement a premium, responsive beachfront-themed user interface using CSS variables, flexbox/grid, and Outfit typography.
2. **Zero-Error Data Input**: Build a Table Booking Entry Form that performs real-time client-side validation (e.g. email, guest counts, room number requirements for hotel guests).
3. **Live Availability Visualizer**: Render a grid of 10 tables showing live color-coded status badges (Available vs. Reserved) using real-time API integrations.
4. **Interactive Billing Settle Console**: Create a receipt panel showing itemized orders, automatic discount subtractions (10% off for room charge), and tax rates.
5. **Menu Catalog Images Component**: Integrate high-quality food illustrations for each category (Appetizers, Mains, Desserts, Beverages) in the billing menu catalog.

---

## 2. Backend Objectives (Student 2)
1. **RESTful API Core**: Develop backend endpoints (`POST`, `GET`, `PUT`, `PATCH`) for bookings, orders, and payments with clean parameter handling.
2. **Double-Booking Overlap Engine**: Implement a core processing routine that flags and blocks overlapping reservations (within 2 hours) on the same table.
3. **Data Integrity Constraints**: Enforce foreign keys and check constraints in SQLite tables to block inconsistent records.
4. **Dietary Constraint Check**: Build a matching algorithm that compares reservation dietary preferences against ordered item tags, generating alerts on mismatch.
5. **Analytics Data Aggregator**: Implement summary routines that calculate total paid revenue, table occupancy rates, and time-series trends for charts.

---

## 3. Testing & Deployment Objectives (Student 3)
1. **Automated Logic Assertions**: Implement a test suite (`run_tests.js`) that runs 22+ checks validating table capacities, overlaps, and billing calculations.
2. **API Endpoint Testing**: Verify response status codes (e.g. 200, 400, 404) and JSON bodies under normal and error inputs.
3. **Empty-State Validation**: Ensure the system works cleanly from an empty database, successfully bootstrap-seeding default menu items.
4. **Cross-Platform Responsiveness**: Verify layout rendering and actions on desktop (1280px), tablet (768px), and mobile (375px) viewports.
5. **Clean Deployment Pipeline**: Configure the Node environment variables and database pathways to ensure the project runs with zero setup.
