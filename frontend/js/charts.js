let state = {
  user: null,
  jobs: [],
  allDepartments: []
};
let jobChartInstance = null;

function escapeHtml(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { ...options.headers };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch("/api" + path, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem("token");
    window.location.href = "/login.html";
    return;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API Error");
  return data;
}

function renderJobChart() {
  const ctx = document.getElementById("jobChartCanvas").getContext("2d");
  const tbody = document.querySelector("#jobChartTable tbody");
  tbody.innerHTML = "";

  const stats = {};
  state.allDepartments.forEach(d => {
    stats[d.key] = { name: d.name, total: 0, completed: 0, pending: 0 };
  });

  state.jobs.forEach(job => {
    const dept = job.targetDepartment || "marketing";
    if (stats[dept]) {
      stats[dept].total++;
      if (job.status === "completed") stats[dept].completed++;
      else stats[dept].pending++;
    }
  });

  const labels = [];
  const totalData = [];
  const completedData = [];
  
  Object.values(stats).forEach(s => {
    if (s.total > 0) {
      labels.push(s.name);
      totalData.push(s.total);
      completedData.push(s.completed);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${escapeHtml(s.name)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${s.total}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${s.completed}</td>
        <td style="padding: 12px; border-bottom: 1px solid #ddd;">${s.pending}</td>
      `;
      tbody.appendChild(tr);
    }
  });

  if (jobChartInstance) jobChartInstance.destroy();

  jobChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Total Jobs', data: totalData, backgroundColor: '#007bff' },
        { label: 'Completed Jobs', data: completedData, backgroundColor: '#28a745' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } }
    }
  });
}

function initExports() {
  const pdfBtn = document.getElementById("jobChartPdfBtn");
  const excelBtn = document.getElementById("jobChartExcelBtn");

  pdfBtn.addEventListener("click", () => {
    const element = document.getElementById('jobChartPrintArea');
    const opt = {
      margin:       0.5,
      filename:     'Job_Chart_Dashboard.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(element).save();
  });

  excelBtn.addEventListener("click", () => {
    let csvContent = "data:text/csv;charset=utf-8,Department,Total Jobs,Completed,Pending\n";
    const rows = document.querySelectorAll("#jobChartTable tbody tr");
    rows.forEach(row => {
      const cols = row.querySelectorAll("td");
      const data = Array.from(cols).map(c => '"' + c.innerText + '"').join(",");
      csvContent += data + "\n";
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Job_Chart_Dashboard.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
}

async function boot() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/login.html";
    return;
  }
  
  const payload = JSON.parse(atob(token.split(".")[1]));
  state.user = payload;
  
  // Security Check: Only allow keval v shah
  if (state.user.username !== "keval v shah" && state.user.role !== "admin") {
    alert("Unauthorized access. Only admins can view charts.");
    window.location.href = "/";
    return;
  }

  document.getElementById("userNameDisplay").textContent = state.user.username;
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "/login.html";
  });

  state.allDepartments = await api("/departments");
  state.jobs = await api("/jobs");
  
  renderJobChart();
  initExports();
  
  // Auto-refresh every 30 seconds
  setInterval(async () => {
    state.jobs = await api("/jobs");
    renderJobChart();
  }, 30000);
}

boot().catch(console.error);
