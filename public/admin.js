fetch('/api/admin/companies')
  .then(r => r.json())
  .then(companies => {
    const container = document.getElementById('companies');

    companies.forEach(c => {
      const div = document.createElement('div');
      div.className = 'card warning';

      div.innerHTML = `
        <strong>${c.name}</strong>
        <p>${c.industry}</p>
        <button onclick="approve(${c.id})">Approve</button>
      `;

      container.appendChild(div);
    });
  });

function approve(companyId) {
  fetch(`/api/admin/companies/${companyId}/approve`, {
    method: 'POST'
  }).then(() => location.reload());
}
