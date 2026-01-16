const nodemailer = require('nodemailer');

async function testEmail() {
    console.log("--- Starting Direct Email Test ---");

    let transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false, 
        auth: {
            // 👇 THIS MUST MATCH THE 'LOGIN' IN YOUR SCREENSHOT
            user: '9fd0cc001@smtp-brevo.com', 
            
            // 👇 THIS MUST MATCH THE 'PASSWORD' IN YOUR SCREENSHOT
            pass: 'W6DyPgwaRpYzZLA4', 
        }
    });

    try {
        console.log("Attempting to connect with credentials from screenshot...");
        await transporter.verify();
        console.log("✅ SUCCESS! The credentials work.");
        
        // Let's try to send a real email now to verify delivery
        let info = await transporter.sendMail({
            from: '"ExecBrief Test" <support@execbrief.io>', 
            to: 'abnetwork@gmail.com', // Sending to your personal email
            subject: "It Works!",
            text: "If you see this, your SMTP connection is finally fixed.",
        });
        console.log("✅ Email sent! Message ID: " + info.messageId);

    } catch (error) {
        console.error("❌ STILL FAILING. Error details:");
        console.error(error);
    }
}

testEmail();