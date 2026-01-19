document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // CHANGED: Grab email instead of username
    const emailInput = document.getElementById('email').value;
    const passwordInput = document.getElementById('password').value;
    const errorMsg = document.getElementById('errorMsg');
    
    // Reset error
    errorMsg.style.display = 'none';
    errorMsg.innerText = '';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // CHANGED: Payload uses 'email' key to match server.js
            body: JSON.stringify({ email: emailInput, password: passwordInput })
        });

        const bodyText = await response.text();
        let data = {};
        try {
            data = bodyText ? JSON.parse(bodyText) : {};
        } catch (parseError) {
            data = {};
        }

        if (data.success) {
            window.location.href = data.redirect;
        } else {
            errorMsg.innerText = data.message || data.error || bodyText || 'Login failed';
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        errorMsg.innerText = 'Unable to reach the login service. Please try again.';
        errorMsg.style.display = 'block';
    }
});

async function requestReset() {
    const email = prompt("Please enter your email address to receive a reset link:");
    
    if (email) {
        const link = document.querySelector('a[onclick="requestReset()"]');
        const originalText = link.innerText;
        link.innerText = "Sending...";
        
        try {
            const res = await fetch('/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            alert(data.message || "Request processed.");
        } catch (err) {
            alert("Could not connect to email server.");
        } finally {
            link.innerText = originalText;
        }
    }
}
