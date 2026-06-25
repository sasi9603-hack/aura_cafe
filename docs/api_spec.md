# API Specification

All endpoints are hosted locally under `http://localhost:3000` (or `process.env.PORT`).

---

## 1. Health & Configuration

### Health Check
- **Route**: `GET /health`
- **Response**:
  ```json
  {
    "status": "ok",
    "project": "hotel-restaurant-table-booking"
  }
  ```

### Menu Items Catalog
- **Route**: `GET /api/menu`
- **Response**:
  ```json
  [
    {
      "id": 1,
      "name": "Beachside Bruschetta",
      "category": "Appetizer",
      "price": 10.00,
      "dietary_tags": "Vegetarian,Vegan,Gluten-Free"
    }
  ]
  ```

---

## 2. Table Bookings Management

### Create Booking
- **Route**: `POST /api/bookings`
- **Body Parameters**:
  ```json
  {
    "guest_name": "Rahul Sharma",
    "guest_type": "Hotel Guest",
    "room_number": "304",
    "table_number": 5,
    "booking_date": "2026-06-08",
    "booking_time": "19:00",
    "guest_count": 4,
    "dietary_preference": "Vegetarian"
  }
  ```
- **Validations Enforced**:
  - Restricts overlaps: table cannot be booked within 2 hours of another active booking on the same date.
  - Enforces capacity constraints: table maximum capacity must accommodate the guest count.
  - Enforces hotel guest rules: room number is required if type is "Hotel Guest".
- **Response (214 Success)**:
  ```json
  {
    "success": true,
    "message": "Booking created successfully",
    "bookingId": 12
  }
  ```

### List Bookings
- **Route**: `GET /api/bookings`
- **Query Parameters**:
  - `status` (All, Active, Completed, Cancelled, Archived)
  - `search` (Search by guest name string or exact table number integer)
  - `page` (Defaults to 1)
  - `limit` (Defaults to 20)
- **Response**:
  ```json
  {
    "success": true,
    "bookings": [...],
    "totalCount": 15,
    "page": 1,
    "limit": 20
  }
  ```

### Fetch Booking Detail
- **Route**: `GET /api/bookings/:id`
- **Response**:
  ```json
  {
    "success": true,
    "booking": { "id": 1, ... },
    "orders": [ ... ],
    "payment": { "id": 1, ... },
    "billing": {
      "subtotal": 30.00,
      "discount": 3.00,
      "tax": 4.86,
      "totalAmount": 31.86
    },
    "alerts": []
  }
  ```

### Update Booking
- **Route**: `PUT /api/bookings/:id`
- **Body Parameters**: Same as `POST /api/bookings` plus optional `status`.
- **Response**:
  ```json
  {
    "success": true,
    "message": "Booking updated successfully."
  }
  ```

### Patch Booking Status
- **Route**: `PATCH /api/bookings/:id/status`
- **Body Parameters**:
  ```json
  {
    "status": "Completed"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Booking status updated to Completed."
  }
  ```

---

## 3. Orders & Billing Integration

### Add Order Item
- **Route**: `POST /api/bookings/:id/orders`
- **Body Parameters**:
  ```json
  {
    "item_name": "Paneer Butter Masala with Roti",
    "quantity": 1
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Order item added successfully."
  }
  ```

### Patch Order Item Status
- **Route**: `PATCH /api/bookings/:bookingId/orders/:orderId/status`
- **Body Parameters**:
  ```json
  {
    "status": "Cancelled"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Order item status updated."
  }
  ```

### Record Checkout Payment
- **Route**: `POST /api/bookings/:id/payments`
- **Body Parameters**:
  ```json
  {
    "payment_method": "Room Charge"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Payment recorded and reservation completed."
  }
  ```

---

## 4. Reports & Summary

### Overview Summary
- **Route**: `GET /api/reports/summary`
- **Response**:
  ```json
  {
    "success": true,
    "statusCounts": [
      { "status": "Active", "count": 5 }
    ],
    "totalRevenue": 240.50,
    "occupancyRate": 40.0,
    "alerts": [
      {
        "bookingId": 2,
        "guestName": "Sarah Jenkins",
        "tableNumber": 5,
        "alerts": [
          { "type": "past_due", "message": "Guest is late by 25 minutes.", "severity": "medium" }
        ]
      }
    ],
    "trend": [
      { "date": "2026-06-08", "bookings": 4, "revenue": 120.00 }
    ]
  }
  ```
