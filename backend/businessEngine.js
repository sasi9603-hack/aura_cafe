/**
 * Core Business Logic Processing Engine for Hotel Restaurant Table Booking & Menu Management System
 */

/**
 * Checks if a table has capacity for the requested guest count.
 * Standard Aura Cafe tables:
 * Tables 1-4: 2-seater (Max 2 guests)
 * Tables 5-7: 4-seater (Max 4 guests)
 * Tables 8-9: 6-seater (Max 6 guests)
 * Table 10: 8-seater (Max 8 guests)
 */
function getTableCapacity(tableNumber) {
  const t = parseInt(tableNumber, 10);
  if (t >= 1 && t <= 4) return 2;
  if (t >= 5 && t <= 7) return 4;
  if (t >= 8 && t <= 9) return 6;
  if (t === 10) return 8;
  return 0; // Invalid table
}

/**
 * Validates if guest count exceeds table capacity
 */
function validateTableCapacity(tableNumber, guestCount) {
  const capacity = getTableCapacity(tableNumber);
  return guestCount <= capacity;
}

/**
 * Checks if two times overlap on the same date.
 * Aura Cafe reservations last 2 hours.
 * Format: time1 and time2 are HH:MM
 */
function isTimeOverlapping(time1, time2) {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);
  
  const date1 = new Date(2020, 0, 1, h1, m1);
  const date2 = new Date(2020, 0, 1, h2, m2);
  
  const diffMinutes = Math.abs(date1 - date2) / (1000 * 60);
  return diffMinutes < 120; // Overlaps if within 120 minutes (2 hours)
}

/**
 * Checks if a menu item conflicts with a guest's dietary preference.
 * Menu tags: 'Vegetarian,Vegan,Gluten-Free,Nut-Allergy' (meaning safe for those preferences)
 */
function hasDietaryConflict(guestPref, itemTagsStr) {
  if (!guestPref || guestPref === 'None' || guestPref === 'Non-Veg') return false;
  if (!itemTagsStr) return true; // No tags means not explicitly safe for any dietary preference
  
  const tags = itemTagsStr.split(',').map(t => t.trim().toLowerCase());
  const pref = guestPref.trim().toLowerCase();
  
  // The tag must exist in the menu item's safe list.
  return !tags.includes(pref);
}

/**
 * Calculates billing summary for a reservation based on orders.
 * Rules:
 * - Hotel Guests get 10% discount on food subtotal
 * - 5% GST Tax applies on the discounted subtotal
 */
function calculateBilling(guestType, ordersList, gstRate = 0.05) {
  let subtotal = 0;
  
  for (const order of ordersList) {
    if (order.status !== 'Cancelled') {
      subtotal += order.price * order.quantity;
    }
  }
  
  const discountRate = guestType === 'Hotel Guest' ? 0.10 : 0.0;
  const discount = subtotal * discountRate;
  const taxableAmount = subtotal - discount;
  const tax = taxableAmount * gstRate; // Use dynamic GST rate
  const totalAmount = taxableAmount + tax;
  
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discount: parseFloat(discount.toFixed(2)),
    tax: parseFloat(tax.toFixed(2)),
    totalAmount: parseFloat(totalAmount.toFixed(2))
  };
}

/**
 * Evaluates alerts for active reservations.
 * Rules:
 * - Alert if reservation is Unpaid and the booking time is in the past (threshold reached).
 * - Alert if there are active dietary conflicts in the orders.
 */
function evaluateAlerts(booking, ordersList, payment) {
  const alerts = [];
  const now = new Date();
  
  // Format current date and time
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDate = String(now.getDate()).padStart(2, '0');
  const currentHour = String(now.getHours()).padStart(2, '0');
  const currentMin = String(now.getMinutes()).padStart(2, '0');
  
  const todayStr = `${currentYear}-${currentMonth}-${currentDate}`;
  const timeStr = `${currentHour}:${currentMin}`;
  
  const hasActiveOrders = ordersList && ordersList.some(o => o.status !== 'Cancelled');
  
  if (booking.status === 'Active' && hasActiveOrders) {
    alerts.push({
      type: 'running',
      message: booking.table_number ? `Table is running.` : `Room service is running.`,
      severity: 'low'
    });
  }
  
  // Check if booking is today and past due
  if (booking.status === 'Active' && payment && payment.status === 'Unpaid' && !hasActiveOrders) {
    if (booking.booking_date < todayStr || (booking.booking_date === todayStr && booking.booking_time < timeStr)) {
      // Find out how many minutes past due
      const [bh, bm] = booking.booking_time.split(':').map(Number);
      const bDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bh, bm);
      const diffMin = Math.floor((now - bDate) / (1000 * 60));
      
      if (diffMin >= 60) {
        alerts.push({
          type: 'cancellation_warning',
          message: `Booking has been unpaid for over 1 hour. Consider cancelling.`,
          severity: 'high'
        });
      } else {
        alerts.push({
          type: 'past_due',
          message: `Guest is late by ${diffMin} minutes.`,
          severity: 'medium'
        });
      }
    }
  }
  
  // Check for dietary conflicts in orders
  if (booking.dietary_preference && booking.dietary_preference !== 'None') {
    for (const order of ordersList) {
      if (order.status !== 'Cancelled' && hasDietaryConflict(booking.dietary_preference, order.dietary_tags)) {
        alerts.push({
          type: 'dietary_conflict',
          message: `Order item "${order.item_name}" conflicts with guest's dietary preference (${booking.dietary_preference}).`,
          severity: 'high'
        });
      }
    }
  }
  
  return alerts;
}

module.exports = {
  getTableCapacity,
  validateTableCapacity,
  isTimeOverlapping,
  hasDietaryConflict,
  calculateBilling,
  evaluateAlerts
};
