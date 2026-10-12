document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorMsg = document.getElementById('error-message');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      errorMsg.style.display = 'block';
      return;
    }

    const data = await res.json();
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.user && data.user.username === 'keval v shah') {
      window.location.href = '/launchpad.html';
    } else {
      window.location.href = '/index.html';
    }
  } catch (err) {
    console.error(err);
    errorMsg.style.display = 'block';
    errorMsg.textContent = 'Server error. Please try again.';
  }
});
