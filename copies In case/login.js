document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const usernameInput = document.getElementById('username').value;
    const passwordInput = document.getElementById('password').value;
    const errorMsg = document.getElementById('errorMsg');
    
    // Reset error
    errorMsg.style.display = 'none';
    errorMsg.innerText = '';

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });

        const data = await response.json();

        if (data.success) {
            window.location.href = data.redirect;
        } else {
            errorMsg.innerText = data.message || 'Login failed';
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        errorMsg.innerText = 'Connection error. Please try again.';
        errorMsg.style.display = 'block';
    }
});