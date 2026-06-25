const nodemailer = require('nodemailer');
const twilio = require('twilio');
const cron = require('node-cron');
const { db, dbQuery } = require('./db');

// Load environment variables
require('dotenv').config();

// Create SMTP Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// Configure Twilio SMS client safely
let twilioClient = null;
try {
  const hasTwilioConfig = process.env.TWILIO_ACCOUNT_SID && 
                          process.env.TWILIO_ACCOUNT_SID.startsWith('AC') && 
                          process.env.TWILIO_AUTH_TOKEN;
  if (hasTwilioConfig) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (err) {
  console.error('[Twilio Init Failed]:', err.message);
}


/**
 * Utility helper to get user-friendly slot name from start time
 */
function getSlotName(time) {
  if (time === '07:00') return 'Breakfast 7–10am';
  if (time === '12:00') return 'Lunch 12–3pm';
  if (time === '19:00') return 'Dinner 7–10pm';
  return time;
}

/**
 * Generate iCalendar (.ics) event string for booking confirmation attachment
 */
function generateICS(booking) {
  const id = booking.id;
  const dateStr = booking.booking_date.replace(/-/g, ''); // YYYYMMDD
  
  let startHour = '07', endHour = '10';
  if (booking.booking_time === '12:00') {
    startHour = '12';
    endHour = '15';
  } else if (booking.booking_time === '19:00') {
    startHour = '19';
    endHour = '22';
  } else {
    const [h] = booking.booking_time.split(':');
    const startH = parseInt(h, 10);
    startHour = String(startH).padStart(2, '0');
    endHour = String((startH + 2) % 24).padStart(2, '0');
  }

  const dtStart = `${dateStr}T${startHour}0000Z`;
  const dtEnd = `${dateStr}T${endHour}0000Z`;
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Aura Cafe//Restaurant Booking//EN',
    'BEGIN:VEVENT',
    `UID:booking-${id}@auracafe.com`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    'SUMMARY:Table Reservation at Aura Cafe',
    `DESCRIPTION:Reservation for ${booking.guest_count} guests. Table ${booking.table_number || 'Room Service'}. Dietary Preference: ${booking.dietary_preference || 'None'}.`,
    'LOCATION:Aura Cafe Restaurant, Coastal Road',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

/**
 * Sends SMS via Fast2SMS (Indian numbers) or Twilio fallback
 */
async function sendSMS(phone, message) {
  if (!phone) return;
  console.log(`[SMS Notification] Queue to: ${phone} | Content: "${message}"`);
  
  const isIndian = phone.startsWith('+91') || (/^\d{10}$/.test(phone));
  const formattedPhone = (isIndian && !phone.startsWith('+91')) ? '+91' + phone : phone;

  // 1. Fast2SMS API Trigger for Indian numbers
  if (process.env.FAST2SMS_API_KEY && isIndian) {
    try {
      const rawNumber = formattedPhone.replace('+91', '');
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'q',
          message: message,
          language: 'english',
          numbers: rawNumber
        })
      });
      const result = await response.json();
      console.log('[SMS Fast2SMS Output]:', result);
      return;
    } catch (err) {
      console.error('Fast2SMS failed:', err.message);
    }
  }

  // 2. Twilio API Fallback Trigger
  if (twilioClient && process.env.TWILIO_PHONE_NUMBER) {
    try {
      const res = await twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: formattedPhone
      });
      console.log('[SMS Twilio Output SID]:', res.sid);
    } catch (err) {
      console.error('Twilio SMS failed:', err.message);
    }
  }
}

/**
 * Email & SMS Confirmation Immediately on POST /api/bookings Success
 */
async function sendBookingConfirmation(booking) {
  if (!booking.email) {
    console.log('[NotificationService] Skipping email confirmation (no email address).');
  } else {
    try {
      const ics = generateICS(booking);
      const mailOptions = {
        from: process.env.SMTP_FROM || '"Aura Cafe" <reception@auracafe.com>',
        to: booking.email,
        subject: `Your table at Aura Cafe is confirmed — Booking #${booking.id}`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background: #ffffff; color: #1e293b; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #0ea5e9; font-weight: 700; margin: 0; font-size: 1.8rem;">Aura Cafe</h2>
              <p style="color: #64748b; font-size: 0.95rem; margin-top: 4px;">Restaurant Reservation Confirmed</p>
            </div>
            <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #f1f5f9;">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px 0; font-weight: 600; color: #475569;">Booking Ref:</td>
                  <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #0f172a;">#${booking.id}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px 0; font-weight: 600; color: #475569;">Guest Name:</td>
                  <td style="padding: 10px 0; text-align: right; color: #0f172a;">${booking.guest_name}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px 0; font-weight: 600; color: #475569;">Date:</td>
                  <td style="padding: 10px 0; text-align: right; color: #0f172a;">${booking.booking_date}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px 0; font-weight: 600; color: #475569;">Time Slot:</td>
                  <td style="padding: 10px 0; text-align: right; color: #0f172a;">${getSlotName(booking.booking_time)}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px 0; font-weight: 600; color: #475569;">Table Assigned:</td>
                  <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #0ea5e9;">Table ${booking.table_number || 'Room Service'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px 0; font-weight: 600; color: #475569;">Guests count:</td>
                  <td style="padding: 10px 0; text-align: right; color: #0f172a;">${booking.guest_count} seats</td>
                </tr>
                <tr>
                  <td style="padding: 10px 0; font-weight: 600; color: #475569;">Dietary Preference:</td>
                  <td style="padding: 10px 0; text-align: right; color: #dc2626; font-weight: 600;">${booking.dietary_preference || 'None'}</td>
                </tr>
              </table>
            </div>
            <p style="font-size: 0.85rem; color: #64748b; text-align: center; margin-top: 20px; line-height: 1.4;">
              We have attached a calendar invite (.ics) file so you can easily add this booking to your calendar application.
            </p>
            <div style="text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
              <p style="font-size: 0.8rem; color: #94a3b8; margin: 0;">Aura Cafe, Coastal Highway Road. Thank you!</p>
            </div>
          </div>
        `,
        attachments: [
          {
            filename: 'aura-invite.ics',
            content: ics,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST'
          }
        ]
      };
      const info = await transporter.sendMail(mailOptions);
      console.log('[SMTP Confirmation Email Sent]:', info.messageId);
    } catch (err) {
      console.error('[SMTP Confirmation Email Failed]:', err.message);
    }
  }

  // Send SMS confirmation
  if (booking.phone) {
    const slotStr = getSlotName(booking.booking_time);
    const smsMessage = `Hi ${booking.guest_name}, your table for ${booking.guest_count} at Aura Cafe is confirmed for ${booking.booking_date} (${slotStr}). Booking #${booking.id}.`;
    await sendSMS(booking.phone, smsMessage);
  }
}

/**
 * Send Reminder Email + SMS 1 Hour Before Reservation Time
 */
async function sendReminder(booking) {
  if (booking.email) {
    try {
      const slotStr = getSlotName(booking.booking_time);
      const mailOptions = {
        from: process.env.SMTP_FROM || '"Aura Cafe" <reception@auracafe.com>',
        to: booking.email,
        subject: `Upcoming reservation at Aura Cafe — Booking #${booking.id}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
            <h3 style="color: #0ea5e9; font-weight: 700;">Reservation Reminder</h3>
            <p>Dear ${booking.guest_name},</p>
            <p>This is a friendly reminder that your table at Aura Cafe restaurant is reserved for today in exactly 1 hour.</p>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
              <p style="margin: 4px 0;"><strong>Date:</strong> ${booking.booking_date}</p>
              <p style="margin: 4px 0;"><strong>Time Slot:</strong> ${slotStr}</p>
              <p style="margin: 4px 0;"><strong>Assigned:</strong> Table ${booking.table_number || 'Room Service'}</p>
            </div>
            <p>We look forward to welcoming you soon!</p>
            <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 20px;">Aura Cafe Team</p>
          </div>
        `
      };
      await transporter.sendMail(mailOptions);
      console.log(`[SMTP Reminder Email Sent] to booking #${booking.id}`);
    } catch (err) {
      console.error(`[SMTP Reminder Email Failed] for booking #${booking.id}:`, err.message);
    }
  }

  if (booking.phone) {
    const slotStr = getSlotName(booking.booking_time);
    const smsMessage = `Reminder: Your Aura Cafe table is in 1 hour. Table ${booking.table_number || 'Room Service'}, ${slotStr}.`;
    await sendSMS(booking.phone, smsMessage);
  }
}

/**
 * Send Feedback Link Email 30 minutes after Checkout
 */
async function sendFeedbackRequest(booking) {
  if (!booking.email) {
    console.log(`[NotificationService] Skipping feedback request email for booking #${booking.id} (no email).`);
    return;
  }
  
  try {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3002';
    const feedbackUrl = `${baseUrl}/feedback.html?booking_id=${booking.id}`;
    
    const mailOptions = {
      from: process.env.SMTP_FROM || '"Aura Cafe" <reception@auracafe.com>',
      to: booking.email,
      subject: `How was your dining experience at Aura Cafe? — Booking #${booking.id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; text-align: center;">
          <h2 style="color: #0ea5e9; margin: 0 0 10px 0;">Aura Cafe</h2>
          <h4 style="color: #475569; margin: 0 0 20px 0;">Thank You for Dining With Us</h4>
          <p style="color: #334155; line-height: 1.5; font-size: 1rem; margin-bottom: 24px;">
            Dear ${booking.guest_name}, we hope you enjoyed your meal and experience at our restaurant. We would love to hear your feedback to help us serve you better.
          </p>
          <div style="margin: 30px 0;">
            <a href="${feedbackUrl}" style="background: #0ea5e9; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 0.95rem; box-shadow: 0 4px 6px -1px rgba(14, 165, 233, 0.4);">
              Share Your Feedback
            </a>
          </div>
          <p style="color: #64748b; font-size: 0.85rem; margin-top: 30px;">
            If the button doesn't work, you can copy and paste the following link in your browser:<br/>
            <a href="${feedbackUrl}" style="color: #0ea5e9;">${feedbackUrl}</a>
          </p>
        </div>
      `
    };

    // Since feedback request needs to be sent 30 minutes after checkout,
    // we send the email. The prompt says "containing the feedback URL /feedback?booking_id=[ID]".
    // Wait, the prompt says "email 30 minutes after checkout, containing the feedback URL /feedback?booking_id=[ID]"
    // and also "/feedback.html?booking_id=123" under feedback.html.
    // In our implementation, we'll route to /feedback.html?booking_id=[ID] which is the public feedback page! That's correct.
    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP Feedback Request Email Sent] to booking #${booking.id}:`, info.messageId);
  } catch (err) {
    console.error(`[SMTP Feedback Request Email Failed] for booking #${booking.id}:`, err.message);
  }
}

/**
 * CRON Reminder Job: Runs every 5 minutes
 * Finds bookings scheduled today starting within 60 minutes where reminder_sent = 0
 */
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('*/5 * * * *', async () => {
    console.log('[Cron Scheduler] Running 5-minute reminder scanner...');
    try {
      const now = new Date();
      
      // Format local date today as YYYY-MM-DD
      const todayStr = now.toLocaleDateString('en-CA'); // Outputs YYYY-MM-DD
      
      // Find active bookings today where reminder_sent = 0
      const bookings = await dbQuery.all(
        `SELECT * FROM hotel_restaurant_table_booking_menu 
         WHERE booking_date = ? AND status = 'Active' AND reminder_sent = 0`,
        [todayStr]
      );

      for (const booking of bookings) {
        const [bHour, bMin] = booking.booking_time.split(':').map(Number);
        const bookingDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), bHour, bMin);
        
        // Calculate difference in minutes
        const diffMs = bookingDateTime - now;
        const diffMin = diffMs / (1000 * 60);
        
        // If booking starts within 60 minutes (and hasn't already passed or starting in less than 0 minutes)
        if (diffMin > 0 && diffMin <= 60) {
          console.log(`[Cron Scheduler] Triggering reminder for Booking #${booking.id} (starts in ${Math.round(diffMin)} minutes)`);
          
          // Send reminder
          await sendReminder(booking);
          
          // Mark as sent
          await dbQuery.run(
            `UPDATE hotel_restaurant_table_booking_menu SET reminder_sent = 1 WHERE id = ?`,
            [booking.id]
          );
        }
      }
    } catch (err) {
      console.error('[Cron Scheduler] Error running reminders:', err.message);
    }
  });
}

module.exports = {
  sendBookingConfirmation,
  sendReminder,
  sendFeedbackRequest
};
