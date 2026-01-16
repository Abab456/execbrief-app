function logout() {
  fetch('/api/logout', { method: 'POST' })
    .then(() => location.href = '/login.html');
}

fetch('/api/company')
  .then(r => {
    if (r.status === 401) location.href = '/login.html';
    return r.json();
  })
  .then(c => {
    document.getElementById('company-name').innerText = c.name;
  });

fetch('/api/summary')
  .then(r => r.json())
  .then(d => summary-content.innerText = d.text);

fetch('/api/signals')
  .then(r => r.json())
  .then(data => {
    signals.innerHTML = data.map(s =>
      `<div class="card ${s.type}">
        <strong>${s.title}</strong>
        <p>${s.description}</p>
      </div>`
    ).join('');
  });

fetch('/api/actions')
  .then(r => r.json())
  .then(data => {
    actions.innerHTML = data.map(a =>
      `<div class="card ${a.type}">
        <strong>${a.title}</strong>
        <p>Impact: ${a.impact}</p>
        <p>Confidence: ${a.confidence}</p>
        <p>${a.reasoning}</p>
        <p><em>${a.consequence}</em></p>
      </div>`
    ).join('');
  });

fetch('/api/scenarios')
  .then(r => r.json())
  .then(data => {
    scenarios.innerHTML = data.map(s =>
      `<div class="card">
        <strong>${s.title}</strong>
        <p>${s.description}</p>
      </div>`
    ).join('');
  });

