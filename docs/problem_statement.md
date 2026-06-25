# Problem Statement & Project Abstract

## About the Company
**Aura Cafe** is a premium beachfront hotel located in Rushikonda, Visakhapatnam. The hotel offers sea-view suites, direct beach access, a multi-cuisine restaurant, a pool, and modern amenities.

---

## 1. Problem Statement

### Operational Perspective
Without a digital system, managing in-house restaurant reservations with table availability, menu display, dietary preference capture, and billing integration is handled manually. This manual dependency (phone calls, WhatsApp messages, paper registers, and spreadsheets) leads to:
1. **Double-booking errors** and table allocation disputes.
2. **Failure to capture critical dietary preferences**, causing food safety risks and guest dissatisfaction.
3. **Billing delays and room-ledger discrepancies** due to manual transcription errors.
4. **Lack of operational oversight**, as compiling reports takes hours of manual sheet consolidation.
5. **Reduced table utilization**, because staff lack real-time visibility into table availability and walk-in capacities.

### Technical & Data Perspective
1. **Lack of Transaction Integrity**: Database tables must enforce foreign key references between bookings, orders, and payments to avoid orphaned records.
2. **No Automated Constraint Checkers**: Manual data entry lacks boundary validations (e.g. reserving a 2-seater table for 6 guests, or booking overlapping time slots on the same table).
3. **Disjointed Workflows**: Orders are not synchronized with reservation dietary records, leading to potential allergy compliance risks.

---

## 2. Project Abstract
The **Hotel Restaurant Table Booking & Menu Management System** is a unified digital platform built for Aura Cafe to automate restaurant operations.

The system features:
- **Table Booking Entry Form**: Captures guest details, guest types (walk-in vs. hotel guest), room numbers, allocated tables, and dietary preferences.
- **Interactive Live Table Map**: Displays table status in real-time, preventing double-bookings.
- **Menu Billing Console**: Integrates table reservations with real-time orders, automatically calculates 10% hotel guest discounts, 18% GST tax, and allows room ledger settlements.
- **Operations Dashboard**: Aggregates booking statuses, total revenue, and occupancy rates with dynamic trends using visual charts.

This prototype increases restaurant utilisation, prevents operational errors, and reduces administrative overhead.
