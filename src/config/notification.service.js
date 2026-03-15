const admin = require('firebase-admin');
const db = require('./db');

try {
  // Ensure firebase.json is in src/config/
  const serviceAccount = require('./firebase.json');
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized successfully.");
  }
} catch (error) {
  console.error("Firebase Admin Initialization Error:", error.message);
}

/**
 * Sends a push notification to a specific user
 * @param {number} userId - The ID of the user to receive the notification
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} data - Optional extra payload data (hidden from UI, readable by app)
 */
async function sendNotificationToUser(userId, title, body, data = {}) {
  try {
    // 3. Get the user's FCM token from MySQL
    const [rows] = await db.query(
      'SELECT fcm_token FROM users WHERE id = ?', 
      [userId]
    );

    if (rows.length === 0 || !rows[0].fcm_token) {
      console.log(`No FCM token found for user ${userId}`);
      return { success: false, message: 'User has no device token' };
    }

    const fcmToken = rows[0].fcm_token;

    // 4. Construct the message payload
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: data, // Optional: e.g., { eventId: "123", type: "NEW_EVENT" }
      token: fcmToken,
      android: {
        priority: 'high',
        notification: {
          // This channel_id MUST match the one created in your Flutter app's NotificationService
          channel_id: 'high_importance_channel',
          sound: 'default',
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          }
        }
      }
    };

    // 5. Send the notification via Firebase
    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
    
    return { success: true, response };

  } catch (error) {
    console.error('Error sending push notification:', error);

    // 6. Handle Invalid/Expired Tokens
    if (error.code === 'messaging/invalid-registration-token' || 
        error.code === 'messaging/registration-token-not-registered') {
      
      console.log(`Token for user ${userId} is invalid. Removing from database.`);
      await db.query('UPDATE users SET fcm_token = NULL WHERE id = ?', [userId]);
    }

    return { success: false, error: error.message };
  }
}

module.exports = { sendNotificationToUser };