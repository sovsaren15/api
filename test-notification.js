const { sendNotificationToUser } = require('./src/config/notification.service');

// Usage: node test-notification.js <userId>
const userId = process.argv[2];

if (!userId) {
    console.log("Please provide a user ID. Example: node test-notification.js 1");
    process.exit(1);
}

async function test() {
    console.log(`Sending test notification to user ${userId}...`);
    const result = await sendNotificationToUser(
        userId, 
        "Test Notification", 
        "This is a test message from the API script.",
        { type: 'test' }
    );
    console.log("Result:", result);
    process.exit();
}

test();