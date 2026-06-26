// Aura Cafe Booking & Menu Management App State
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? window.location.origin
  : CONFIG.API_BASE;


let authToken = sessionStorage.getItem('authToken') || null;

// Global Image Error Handler to prevent blank spots and log missing images
window.handleImageError = function(imgElement, itemName, errorUrl) {
  const failedUrl = imgElement.src;
  console.warn(`[Image Load Failed] Menu Item: "${itemName}". Failed URL: ${failedUrl}`);
  imgElement.onerror = null; // Prevent infinite loop if fallback image also fails
  imgElement.src = errorUrl;
};

// Global Fetch Interceptor for Authentication
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  if (url.toString().includes('/api/') && !url.toString().includes('/api/auth/login')) {
    options.headers = options.headers || {};
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }
  }
  
  const response = await originalFetch(url, options);
  
  // Handle session expiration globally
  if (response.status === 401 && !url.toString().includes('/api/auth/login')) {
    authToken = null;
    sessionStorage.removeItem('authToken');
    document.body.classList.add('logged-out');
  }
  
  return response;
};

let currentScreen = 'dashboard';
let bookingsList = [];
let menuItems = [];
let selectedBooking = null; // Currently selected booking for billing/orders
let orderEntrySelectedRoom = null;
let orderEntryMode = 'table';
let bookingsPage = 1;
const bookingsLimit = 10;
let bookingsFilter = 'All';
let historyPage = 1;
const historyLimit = 30;
let latestRevenueTrend = [];

// Admin Menu Filter States
let adminSearchQuery = '';
let adminDietFilter = 'ALL';
let adminMaxPriceLimit = 500;
let adminSortBy = 'name-asc';
let adminSelectedCategory = 'All';



function isVegItem(item) {
  const name = item.name.toLowerCase();
  const cat = item.category.toLowerCase();
  
  if (name.includes('chicken') || 
      name.includes('egg') || 
      name.includes('prawn') || 
      name.includes('mutton') || 
      name.includes('fish') || 
      name.includes('paya') || 
      name.includes('omlete') || 
      name.includes('omelette') || 
      name.includes('peddamma') ||
      cat.includes('non-veg') || 
      cat.includes('non veg') ||
      cat.includes('egg')) {
    return false;
  }
  return true;
}

// Time Formatter helper: converts "19:30" or "09:15" to "7:30 PM" or "9:15 AM"
function formatTime12H(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  return `${hours}:${minutes} ${ampm}`;
}

// Combine native time input value (24h) with the AM/PM select value to produce a correct 24-hour HH:MM time
function combineTimeInputWithAmpm(timeVal, ampmVal) {
  if (!timeVal) return '';
  const parts = timeVal.split(':');
  if (parts.length < 2) return timeVal;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeVal;
  
  const h12 = hours % 12;
  const h24 = ampmVal === 'PM' ? h12 + 12 : h12;
  return `${String(h24).padStart(2, '0')}:${minutes}`;
}

// Admin Management State & Logic
let currentAdmin = null;
let adminsPage = 1;
const adminsLimit = 10;
let logsPage = 1;
const logsLimit = 10;

async function fetchCurrentAdmin() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`);
    const data = await res.json();
    if (data.success) {
      currentAdmin = data.admin;
      document.getElementById('logged-in-admin-name').innerText = currentAdmin.full_name;
      document.getElementById('logged-in-admin-role-badge').innerText = currentAdmin.role;
      
      let lastLoginText = 'Never';
      if (currentAdmin.last_login) {
        const dateStr = currentAdmin.last_login;
        const d = (!dateStr.includes('T') && !dateStr.endsWith('Z')) ? new Date(dateStr.replace(' ', 'T') + 'Z') : new Date(dateStr);
        lastLoginText = d.toLocaleString();
      }
      document.getElementById('logged-in-admin-last-login').innerText = lastLoginText;
      
      const sidebarAdminLi = document.getElementById('sidebar-admin-management-li');
      if (sidebarAdminLi) {
        if (currentAdmin.role === 'Super Admin') {
          sidebarAdminLi.style.display = 'block';
        } else {
          sidebarAdminLi.style.display = 'none';
        }
      }
    }
  } catch (err) {
    console.error('Error fetching current admin profile:', err);
  }
}

async function loadAdmins() {
  if (!authToken) return;
  if (currentAdmin && currentAdmin.role !== 'Super Admin') return;
  
  const search = document.getElementById('admin-search-input').value;
  const role = document.getElementById('admin-filter-role').value;
  const status = document.getElementById('admin-filter-status').value;
  
  const url = new URL(`${API_BASE}/api/admins`);
  url.searchParams.append('page', adminsPage);
  url.searchParams.append('limit', adminsLimit);
  if (search) url.searchParams.append('search', search);
  if (role) url.searchParams.append('role', role);
  if (status) url.searchParams.append('status', status);
  
  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to load admins');
    }
    
    document.getElementById('admin-stat-total').innerText = data.stats.totalAdmins;
    document.getElementById('admin-stat-active').innerText = data.stats.activeAdmins;
    document.getElementById('admin-stat-super').innerText = data.stats.superAdmins;
    document.getElementById('admin-stat-last-login').innerText = data.stats.lastLoginCount;
    
    const tbody = document.getElementById('admins-table-body');
    tbody.innerHTML = '';
    
    if (data.admins.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
            No administrators found.
          </td>
        </tr>
      `;
    } else {
      data.admins.forEach(admin => {
        let lastLoginStr = 'Never';
        if (admin.last_login) {
          const dateStr = admin.last_login;
          const d = (!dateStr.includes('T') && !dateStr.endsWith('Z')) ? new Date(dateStr.replace(' ', 'T') + 'Z') : new Date(dateStr);
          lastLoginStr = d.toLocaleString();
        }
        
        const statusStyle = admin.status === 'Active'
          ? 'background: rgba(16, 185, 129, 0.1); color: var(--accent); padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight:600;'
          : 'background: rgba(220, 38, 38, 0.1); color: var(--danger); padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight:600;';
        
        const roleStyle = admin.role === 'Super Admin'
          ? 'background: var(--primary-glow); color: var(--primary); padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight:600;'
          : 'background: rgba(2, 132, 199, 0.1); color: var(--secondary); padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight:600;';
           
        const isSelf = currentAdmin && currentAdmin.username === admin.username;
        const deleteButton = isSelf 
          ? `<button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; opacity: 0.5;" title="Cannot delete your logged-in profile" disabled>Delete</button>`
          : `<button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.75rem; background: var(--danger); color: white;" onclick="openDeleteAdminModal(${admin.id}, '${admin.full_name}')">Delete</button>`;
           
        tbody.innerHTML += `
          <tr>
            <td style="font-weight: 700; color: var(--primary);">${admin.admin_code || '-'}</td>
            <td style="font-weight: 600;">${admin.full_name}</td>
            <td>${admin.email}</td>
            <td>${admin.username}</td>
            <td><span style="${roleStyle}">${admin.role}</span></td>
            <td><span style="${statusStyle}">${admin.status}</span></td>
            <td>${lastLoginStr}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; margin-right: 4px;" onclick="openEditAdminModal(${JSON.stringify(admin).replace(/"/g, '&quot;')})">Edit</button>
              ${deleteButton}
            </td>
          </tr>
        `;
      });
    }
    
    const totalCount = data.totalCount;
    const startItem = totalCount === 0 ? 0 : (adminsPage - 1) * adminsLimit + 1;
    const endItem = Math.min(adminsPage * adminsLimit, totalCount);
    document.getElementById('admins-pagination-text').innerText = `Showing ${startItem}-${endItem} of ${totalCount} admins`;
    
    document.getElementById('btn-prev-admins-page').disabled = (adminsPage === 1);
    document.getElementById('btn-next-admins-page').disabled = (adminsPage * adminsLimit >= totalCount);
    
  } catch (err) {
    console.error('Error loading administrators:', err);
  }
}

async function loadAdminLoginLogs() {
  if (!authToken) return;
  if (currentAdmin && currentAdmin.role !== 'Super Admin') return;
  
  const searchInput = document.getElementById('logs-search-input');
  const search = searchInput ? searchInput.value : '';
  
  const url = new URL(`${API_BASE}/api/admins/login-logs`);
  url.searchParams.append('page', logsPage);
  url.searchParams.append('limit', logsLimit);
  if (search) url.searchParams.append('search', search);
  
  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to load login logs');
    }
    
    const tbody = document.getElementById('logs-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (data.logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
            No login logs found.
          </td>
        </tr>
      `;
    } else {
      data.logs.forEach(log => {
        let loginTimeStr = '-';
        if (log.login_time) {
          const dateStr = log.login_time;
          const d = (!dateStr.includes('T') && !dateStr.endsWith('Z')) ? new Date(dateStr.replace(' ', 'T') + 'Z') : new Date(dateStr);
          loginTimeStr = d.toLocaleString();
        }
        
        const statusStyle = log.status === 'Success'
          ? 'background: rgba(16, 185, 129, 0.1); color: var(--accent); padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight:600;'
          : 'background: rgba(220, 38, 38, 0.1); color: var(--danger); padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight:600;';
        
        let uaShort = log.user_agent || '-';
        if (uaShort.includes('Chrome')) {
          uaShort = 'Chrome (Browser)';
        } else if (uaShort.includes('Firefox')) {
          uaShort = 'Firefox (Browser)';
        } else if (uaShort.includes('Safari') && !uaShort.includes('Chrome')) {
          uaShort = 'Safari (Browser)';
        } else if (uaShort.includes('Edge')) {
          uaShort = 'Edge (Browser)';
        } else if (uaShort.length > 30) {
          uaShort = uaShort.substring(0, 30) + '...';
        }

        tbody.innerHTML += `
          <tr>
            <td style="font-weight: 700; color: var(--primary);">LOG-${10000 + log.id}</td>
            <td>${loginTimeStr}</td>
            <td style="font-weight: 600;">${log.username}</td>
            <td>${log.full_name || '-'}</td>
            <td><code>${log.ip_address || '-'}</code></td>
            <td title="${log.user_agent || ''}">${uaShort}</td>
            <td><span style="${statusStyle}">${log.status}</span></td>
            <td style="font-size: 0.85rem; color: var(--text-muted);">${log.reason || '-'}</td>
          </tr>
        `;
      });
    }
    
    const totalCount = data.totalCount;
    const startItem = totalCount === 0 ? 0 : (logsPage - 1) * logsLimit + 1;
    const endItem = Math.min(logsPage * logsLimit, totalCount);
    const textEl = document.getElementById('logs-pagination-text');
    if (textEl) {
      textEl.innerText = `Showing ${startItem}-${endItem} of ${totalCount} logs`;
    }
    
    const prevBtn = document.getElementById('btn-prev-logs-page');
    if (prevBtn) prevBtn.disabled = (logsPage === 1);
    
    const nextBtn = document.getElementById('btn-next-logs-page');
    if (nextBtn) nextBtn.disabled = (logsPage * logsLimit >= totalCount);
    
  } catch (err) {
    console.error('Error loading login logs:', err);
  }
}

function openAddAdminModal() {
  document.getElementById('modal-admin-title').innerText = 'Add Administrator';
  document.getElementById('form-admin').reset();
  document.getElementById('admin-id-field').value = '';
  document.getElementById('admin-password-row').style.display = 'flex';
  document.getElementById('admin-password').required = true;
  document.getElementById('admin-confirm-password').required = true;
  document.getElementById('admin-error-msg').style.display = 'none';
  document.getElementById('modal-admin').classList.add('active');
}

function openEditAdminModal(admin) {
  document.getElementById('modal-admin-title').innerText = 'Edit Administrator';
  document.getElementById('admin-id-field').value = admin.id;
  document.getElementById('admin-full-name').value = admin.full_name;
  document.getElementById('admin-email').value = admin.email;
  document.getElementById('admin-username').value = admin.username;
  
  document.getElementById('admin-password-row').style.display = 'none';
  document.getElementById('admin-password').required = false;
  document.getElementById('admin-confirm-password').required = false;
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-confirm-password').value = '';
  
  document.getElementById('admin-role').value = admin.role;
  document.getElementById('admin-status').value = admin.status;
  document.getElementById('admin-error-msg').style.display = 'none';
  document.getElementById('modal-admin').classList.add('active');
}

function closeAdminModal() {
  document.getElementById('modal-admin').classList.remove('active');
}

function openDeleteAdminModal(id, name) {
  document.getElementById('delete-admin-id-field').value = id;
  document.getElementById('delete-admin-name').innerText = name;
  document.getElementById('modal-delete-confirm').classList.add('active');
}

function closeDeleteAdminModal() {
  document.getElementById('modal-delete-confirm').classList.remove('active');
}

function initAdminForm() {
  const form = document.getElementById('form-admin');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('admin-error-msg');
    errorDiv.style.display = 'none';
    
    const id = document.getElementById('admin-id-field').value;
    const full_name = document.getElementById('admin-full-name').value;
    const email = document.getElementById('admin-email').value;
    const username = document.getElementById('admin-username').value;
    const role = document.getElementById('admin-role').value;
    const status = document.getElementById('admin-status').value;
    
    const isEdit = !!id;
    let payload = { full_name, email, username, role, status };
    
    if (!isEdit) {
      const password = document.getElementById('admin-password').value;
      const confirmPassword = document.getElementById('admin-confirm-password').value;
      
      if (password !== confirmPassword) {
        errorDiv.innerText = 'Passwords do not match.';
        errorDiv.style.display = 'block';
        return;
      }
      if (password.length < 8) {
        errorDiv.innerText = 'Password must be at least 8 characters long.';
        errorDiv.style.display = 'block';
        return;
      }
      payload.password = password;
      payload.confirmPassword = confirmPassword;
    }
    
    const url = isEdit ? `${API_BASE}/api/admins/${id}` : `${API_BASE}/api/admins`;
    const method = isEdit ? 'PUT' : 'POST';
    
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Operation failed.');
      }
      
      closeAdminModal();
      loadAdmins();
      if (isEdit && currentAdmin && currentAdmin.id === parseInt(id, 10)) {
        await fetchCurrentAdmin();
      }
    } catch (err) {
      errorDiv.innerText = err.message;
      errorDiv.style.display = 'block';
    }
  });
  
  const closeBtn = document.getElementById('modal-admin-close');
  if (closeBtn) closeBtn.addEventListener('click', closeAdminModal);
  
  const cancelBtn = document.getElementById('btn-cancel-admin-modal');
  if (cancelBtn) cancelBtn.addEventListener('click', closeAdminModal);
  
  const addBtn = document.getElementById('btn-add-admin');
  if (addBtn) addBtn.addEventListener('click', openAddAdminModal);
}

function initDeleteAdmin() {
  const cancelBtn = document.getElementById('btn-cancel-delete-confirm');
  if (cancelBtn) cancelBtn.addEventListener('click', closeDeleteAdminModal);
  
  const confirmBtn = document.getElementById('btn-confirm-delete-admin');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const id = document.getElementById('delete-admin-id-field').value;
      try {
        const res = await fetch(`${API_BASE}/api/admins/${id}`, {
          method: 'DELETE'
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'Failed to delete admin');
        }
        closeDeleteAdminModal();
        loadAdmins();
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

function initAdminFilters() {
  const searchInput = document.getElementById('admin-search-input');
  const roleFilter = document.getElementById('admin-filter-role');
  const statusFilter = document.getElementById('admin-filter-status');
  
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        adminsPage = 1;
        loadAdmins();
      }, 400);
    });
  }
  
  if (roleFilter) {
    roleFilter.addEventListener('change', () => {
      adminsPage = 1;
      loadAdmins();
    });
  }
  
  if (statusFilter) {
    statusFilter.addEventListener('change', () => {
      adminsPage = 1;
      loadAdmins();
    });
  }
  
  const prevBtn = document.getElementById('btn-prev-admins-page');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (adminsPage > 1) {
        adminsPage--;
        loadAdmins();
      }
    });
  }
  
  const nextBtn = document.getElementById('btn-next-admins-page');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      adminsPage++;
      loadAdmins();
    });
  }
}

function initLogsFilters() {
  const searchInput = document.getElementById('logs-search-input');
  
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        logsPage = 1;
        loadAdminLoginLogs();
      }, 400);
    });
  }
  
  const prevBtn = document.getElementById('btn-prev-logs-page');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (logsPage > 1) {
        logsPage--;
        loadAdminLoginLogs();
      }
    });
  }
  
  const nextBtn = document.getElementById('btn-next-logs-page');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      logsPage++;
      loadAdminLoginLogs();
    });
  }
}

window.openEditAdminModal = openEditAdminModal;
window.openDeleteAdminModal = openDeleteAdminModal;

// Theme Manager
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  
  // Default to light if no theme is saved
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    // Reload charts to update label and grid colors
    if (currentScreen === 'reports') {
      loadReports();
    }
  });
  
  function setTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      // Set to Sun icon
      themeToggleIcon.innerHTML = `
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      `;
      themeToggle.title = 'Switch to Bright Mode';
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
      // Set to Moon icon
      themeToggleIcon.innerHTML = `
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      `;
      themeToggle.title = 'Switch to Dark Mode';
    }
  }
}

// Daily Revenue Breakdown Modal
function initRevenueModal() {
  const modalRevenue = document.getElementById('modal-revenue');
  const cardRevenue = document.getElementById('metric-card-revenue');
  const closeBtn1 = document.getElementById('modal-revenue-close');
  const closeBtn2 = document.getElementById('btn-close-revenue-modal');
  const historyBody = document.getElementById('revenue-history-body');

  cardRevenue.addEventListener('click', () => {
    historyBody.innerHTML = '';
    
    if (!latestRevenueTrend || latestRevenueTrend.length === 0) {
      historyBody.innerHTML = `
        <div class="empty-state">
          <p>No revenue history available.</p>
        </div>
      `;
    } else {
      let html = `
        <table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th style="padding: 12px 8px;">Date</th>
              <th style="padding: 12px 8px; text-align: center;">Bookings</th>
              <th style="padding: 12px 8px; text-align: right;">Total Revenue</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      const sortedTrend = [...latestRevenueTrend].reverse();
      
      sortedTrend.forEach(t => {
        html += `
          <tr>
            <td style="padding: 12px 8px; font-weight: 500;">${t.date}</td>
            <td style="padding: 12px 8px; text-align: center;">${t.bookings}</td>
            <td style="padding: 12px 8px; text-align: right; font-weight: 700; color: var(--accent);">₹${t.revenue.toFixed(2)}</td>
          </tr>
        `;
      });
      
      html += `
          </tbody>
        </table>
      `;
      historyBody.innerHTML = html;
    }
    
    modalRevenue.classList.add('active');
  });

  const closeAction = () => {
    modalRevenue.classList.remove('active');
  };

  closeBtn1.addEventListener('click', closeAction);
  closeBtn2.addEventListener('click', closeAction);
}

// Currently Active Bookings Modal
function initActiveBookingsModal() {
  const modalActive = document.getElementById('modal-active-bookings');
  const cardActive = document.getElementById('metric-card-bookings');
  const closeBtn1 = document.getElementById('modal-active-bookings-close');
  const closeBtn2 = document.getElementById('btn-close-active-bookings-modal');
  const activeBody = document.getElementById('active-bookings-body');

  cardActive.addEventListener('click', async () => {
    activeBody.innerHTML = `
      <div style="display:flex; justify-content:center; padding:30px;">
        <div class="loading-spinner"></div>
      </div>
    `;
    modalActive.classList.add('active');

    try {
      const res = await fetch(`${API_BASE}/api/bookings?status=Active&limit=100`);
      const data = await res.json();
      
      if (!data.success || data.bookings.length === 0) {
        activeBody.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;margin-bottom:12px;opacity:0.5;">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>There are no active bookings.</p>
          </div>
        `;
        return;
      }

      let html = `
        <table class="data-table" style="width:100%;">
          <thead>
            <tr>
              <th style="padding: 12px 8px;">Table</th>
              <th style="padding: 12px 8px;">Guest Name</th>
              <th style="padding: 12px 8px;">Date & Time</th>
              <th style="padding: 12px 8px; text-align: center;">Guests</th>
              <th style="padding: 12px 8px; text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
      `;

      data.bookings.forEach(b => {
        html += `
          <tr>
            <td style="padding: 12px 8px; font-weight: 700; color: var(--primary);">Table ${b.table_number}</td>
            <td style="padding: 12px 8px; font-weight: 600;">${b.guest_name}</td>
            <td style="padding: 12px 8px;">${b.booking_date} @ ${formatTime12H(b.booking_time)}</td>
            <td style="padding: 12px 8px; text-align: center;">${b.guest_count}</td>
            <td style="padding: 12px 8px; text-align: right;">
              <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="viewBookingDetails(${b.id})">Details</button>
            </td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
      activeBody.innerHTML = html;
    } catch (err) {
      activeBody.innerHTML = `
        <div style="color:var(--danger); text-align:center; padding:20px;">
          Failed to load active bookings list.
        </div>
      `;
    }
  });

  const closeAction = () => {
    modalActive.classList.remove('active');
  };

  closeBtn1.addEventListener('click', closeAction);
  closeBtn2.addEventListener('click', closeAction);
}

// Login Screen Slideshow logic
function initLoginSlideshow() {
  const slides = document.querySelectorAll('.gallery-slide');
  if (!slides.length) return;
  
  let currentSlide = 0;
  const slideInterval = 5000; // rotate every 5 seconds
  
  function nextSlide() {
    slides[currentSlide].classList.remove('active');
    currentSlide = (currentSlide + 1) % slides.length;
    slides[currentSlide].classList.add('active');
  }
  
  setInterval(nextSlide, slideInterval);
}

// Login Card 3D Tilt & Cursor Glow Interaction
function initLoginCardTilt() {
  const card = document.querySelector('.login-screen-container .login-card');
  if (!card) return;

  let ticking = false;

  card.addEventListener('mousemove', (e) => {
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    if (!ticking) {
      window.requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const x = mouseX - rect.left;
        const y = mouseY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Dynamic 3D tilt calculation (max 8 degrees tilt)
        const maxTilt = 8;
        const rotateX = -((y - centerY) / centerY) * maxTilt;
        const rotateY = ((x - centerX) / centerX) * maxTilt;

        // Apply interactive 3D rotation, scale up, and slight lift
        card.style.setProperty(
          'transform',
          `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-6px) scale3d(1.02, 1.02, 1.02)`,
          'important'
        );
        
        // Fast responsive transition during mouse tracking for ultra-smoothness
        card.style.setProperty(
          'transition',
          'transform 0.08s ease-out, background-color 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease',
          'important'
        );

        // Shifting spotlight radial overlay following the cursor position
        const percentX = ((x / rect.width) * 100).toFixed(2);
        const percentY = ((y / rect.height) * 100).toFixed(2);
        card.style.setProperty(
          'background-image',
          `radial-gradient(circle at ${percentX}% ${percentY}%, rgba(255, 255, 255, 0.22) 0%, transparent 65%)`,
          'important'
        );

        ticking = false;
      });
      ticking = true;
    }
  });

  card.addEventListener('mouseleave', () => {
    // Reset to stylesheet styles (which uses default 0.4s transition back to normal)
    card.style.removeProperty('transform');
    card.style.removeProperty('transition');
    card.style.removeProperty('background-image');
  });
}

// Interactive Live Cartoon Background Parallax & Reactions
function initLoginBackgroundParallax() {
  const container = document.getElementById('login-screen');
  const items = document.querySelectorAll('.login-cartoon-bg .floating-cartoon-wrapper');
  if (!container || !items.length) return;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let targetX = mouseX;
  let targetY = mouseY;
  let mouseActive = false;

  container.addEventListener('mouseenter', () => {
    mouseActive = true;
  });

  container.addEventListener('mousemove', (e) => {
    mouseActive = true;
    targetX = e.clientX;
    targetY = e.clientY;
  });

  container.addEventListener('mouseleave', () => {
    mouseActive = false;
    targetX = window.innerWidth / 2;
    targetY = window.innerHeight / 2;
  });

  function update() {
    // Only process frame if login screen is active and visible
    if (!document.body.classList.contains('logged-out')) {
      requestAnimationFrame(update);
      return;
    }

    // Apply linear interpolation for smooth lagging momentum
    mouseX += (targetX - mouseX) * 0.08;
    mouseY += (targetY - mouseY) * 0.08;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width / 2;
    const centerY = height / 2;

    // Center offset factor (-1 to 1)
    const pctX = (mouseX - centerX) / centerX;
    const pctY = (mouseY - centerY) / centerY;

    items.forEach((item) => {
      const factor = parseFloat(item.style.getPropertyValue('--parallax-factor')) || 20;
      
      // Dynamic parallax translations (opposite direction of cursor)
      const px = -pctX * factor;
      const py = -pctY * factor;
      
      item.style.setProperty('--parallax-x', `${px.toFixed(2)}px`);
      item.style.setProperty('--parallax-y', `${py.toFixed(2)}px`);

      // Eye tracking & proximity reaction
      const rect = item.getBoundingClientRect();
      if (rect.width > 0) {
        const itemCenterX = rect.left + rect.width / 2;
        const itemCenterY = rect.top + rect.height / 2;

        let dx = 0;
        let dy = 0;
        let distance = 9999;

        if (mouseActive) {
          dx = targetX - itemCenterX;
          dy = targetY - itemCenterY;
          distance = Math.hypot(dx, dy);
        }

        // 1. Eye tracking looking direction (max shift 2.5px inside SVG viewbox)
        let eyeX = 0;
        let eyeY = 0;
        if (mouseActive && distance > 0) {
          const angle = Math.atan2(dy, dx);
          const maxEyeShift = 2.5;
          const shiftMagnitude = Math.min(distance / 200, 1) * maxEyeShift;
          eyeX = Math.cos(angle) * shiftMagnitude;
          eyeY = Math.sin(angle) * shiftMagnitude;
        }

        item.style.setProperty('--eye-x', `${eyeX.toFixed(2)}px`);
        item.style.setProperty('--eye-y', `${eyeY.toFixed(2)}px`);

        // 2. Dynamic proximity scaling and rotational tilt wiggles
        const reactRadius = 180;
        if (mouseActive && distance < reactRadius) {
          const ratio = (reactRadius - distance) / reactRadius;
          const scale = 1 + ratio * 0.25; // Scale up by 25% when cursor is directly on it
          
          // Calculate dynamic rotate based on position relative to cursor
          const angle = Math.atan2(dy, dx);
          const rotate = -Math.sin(angle) * ratio * 12;

          item.style.setProperty('--hover-scale', scale.toFixed(2));
          item.style.setProperty('--hover-rotate', `${rotate.toFixed(1)}deg`);
        } else {
          item.style.setProperty('--hover-scale', '1');
          item.style.setProperty('--hover-rotate', '0deg');
        }
      }
    });

    requestAnimationFrame(update);
  }

  // Initial execution
  requestAnimationFrame(update);
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initRevenueModal();
  initActiveBookingsModal();
  initNavigation();
  initForms();
  initAuth();
  initAdminForm();
  initDeleteAdmin();
  initAdminFilters();
  initLogsFilters();
  initSplitAdminConsole();
  initLoginSlideshow();
  initLoginCardTilt();
  initLoginBackgroundParallax();
  
  if (authToken) {
    document.body.classList.remove('logged-out');
    fetchCurrentAdmin();
    // Load data asynchronously in the background so it doesn't freeze the page load
    loadMenu().then(() => refreshData()).catch(err => console.error('Initial data load error:', err));
  } else {
    document.body.classList.add('logged-out');
  }
  
  // Set default date to today for booking form
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('booking-date').value = today;
  
  // Auto-refresh data every 30 seconds
  setInterval(async () => {
    if (authToken && currentScreen === 'dashboard') {
      await refreshData();
    }
  }, 30000);
});

function initAuth() {
  const loginForm = document.getElementById('form-login');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username').value;
    const passwordInput = document.getElementById('login-keycode').value;
    const errorDiv = document.getElementById('login-error-msg');
    errorDiv.style.display = 'none';
    
    try {
      const res = await originalFetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Login failed.');
      }
      
      authToken = data.token;
      sessionStorage.setItem('authToken', data.token);
      
      // Trigger Welcome Animation
      const welcomeOverlay = document.getElementById('welcome-overlay');
      if (welcomeOverlay) {
        const titleEl = document.getElementById('welcome-overlay-title');
        const subtitleEl = document.getElementById('welcome-overlay-subtitle');
        if (titleEl) titleEl.innerText = "Welcome to Aura Cafe";
        if (subtitleEl) subtitleEl.innerText = "Preparing your dashboard...";
        welcomeOverlay.classList.add('active');
        
        // Wait 1 second (showing logo scale-in & title slide-up)
        setTimeout(async () => {
          // Load app data in background
          await fetchCurrentAdmin();
          await loadMenu();
          await refreshData();
          
          // Let the animation hold for another 1.2s (total 2.2s)
          setTimeout(() => {
            welcomeOverlay.classList.remove('active');
            document.body.classList.remove('logged-out');
            loginForm.reset();
          }, 1200);
        }, 1000);
      } else {
        // Fallback if welcome overlay is missing
        document.body.classList.remove('logged-out');
        loginForm.reset();
        await fetchCurrentAdmin();
        await loadMenu();
        await refreshData();
      }
    } catch (err) {
      errorDiv.innerText = err.message;
      errorDiv.style.display = 'block';
      
      // Add card shake animation for failed attempts
      const loginCard = document.querySelector('.login-screen-container .login-card');
      if (loginCard) {
        loginCard.classList.remove('shake');
        void loginCard.offsetWidth; // trigger reflow
        loginCard.classList.add('shake');
        setTimeout(() => {
          loginCard.classList.remove('shake');
        }, 600);
      }
    }
  });

  const togglePasswordBtn = document.getElementById('btn-toggle-password');
  const passwordInput = document.getElementById('login-keycode');
  const passwordEyeIcon = document.getElementById('password-eye-icon');
  
  togglePasswordBtn.addEventListener('click', () => {
    const isMasked = passwordInput.classList.contains('password-masked');
    if (isMasked) {
      passwordInput.classList.remove('password-masked');
      passwordEyeIcon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      `;
    } else {
      passwordInput.classList.add('password-masked');
      passwordEyeIcon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      `;
    }
  });

  const logoutBtn = document.getElementById('nav-logout');
  logoutBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to log out?')) {
      // Trigger Logout Animation
      const welcomeOverlay = document.getElementById('welcome-overlay');
      if (welcomeOverlay) {
        const titleEl = document.getElementById('welcome-overlay-title');
        const subtitleEl = document.getElementById('welcome-overlay-subtitle');
        if (titleEl) titleEl.innerText = "See You Soon!";
        if (subtitleEl) subtitleEl.innerText = "Logging you out safely...";
        welcomeOverlay.classList.add('active');
      }

      // Perform actual logout API call in background
      try {
        await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
      } catch (e) {}
      
      // Let the animation hold for 1.8 seconds, then finish transition
      setTimeout(() => {
        authToken = null;
        sessionStorage.removeItem('authToken');
        document.body.classList.add('logged-out');
        
        // Reset admin details
        currentAdmin = null;
        document.getElementById('logged-in-admin-name').innerText = 'Admin';
        document.getElementById('logged-in-admin-role-badge').innerText = 'Super Admin';
        document.getElementById('logged-in-admin-last-login').innerText = '-';
        const sidebarAdminLi = document.getElementById('sidebar-admin-management-li');
        if (sidebarAdminLi) sidebarAdminLi.style.display = 'none';
        
        if (welcomeOverlay) {
          welcomeOverlay.classList.remove('active');
        }
      }, 1800);
    }
  });

  // Change Password Modal setup
  const modalChangePassword = document.getElementById('modal-change-password');
  const navChangePassword = document.getElementById('nav-change-password');
  const closeBtn1 = document.getElementById('modal-change-password-close');
  const closeBtn2 = document.getElementById('btn-cancel-change-password');
  const formChangePassword = document.getElementById('form-change-password');

  const closeChangePasswordModal = () => {
    modalChangePassword.classList.remove('active');
    formChangePassword.reset();
    document.getElementById('change-password-error-msg').style.display = 'none';
    document.getElementById('change-password-success-msg').style.display = 'none';
  };

  navChangePassword.addEventListener('click', () => {
    modalChangePassword.classList.add('active');
  });

  closeBtn1.addEventListener('click', closeChangePasswordModal);
  closeBtn2.addEventListener('click', closeChangePasswordModal);

  formChangePassword.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPass = document.getElementById('change-current-keycode').value;
    const newPass = document.getElementById('change-new-keycode').value;
    const confirmPass = document.getElementById('change-confirm-keycode').value;
    
    const errorDiv = document.getElementById('change-password-error-msg');
    const successDiv = document.getElementById('change-password-success-msg');
    
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    if (newPass !== confirmPass) {
      errorDiv.innerText = 'New passwords do not match.';
      errorDiv.style.display = 'block';
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to change password.');
      }

      successDiv.style.display = 'block';
      formChangePassword.reset();
      
      // Hide modal after 1.5 seconds
      setTimeout(closeChangePasswordModal, 1500);
    } catch (err) {
      errorDiv.innerText = err.message;
      errorDiv.style.display = 'block';
    }
  });
}

async function refreshData() {
  await loadDashboard();
  await loadBookings();
  await loadReports();
}

// ----------------------------------------------------
// Navigation & Screen Control
// ----------------------------------------------------
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const screens = document.querySelectorAll('.screen');
  const screenTitle = document.getElementById('current-screen-title');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const targetScreen = item.getAttribute('data-screen');
      if (!targetScreen) {
        return; // Ignore screen swapping for items without data-screen (e.g. Change Password, Logout)
      }
      e.preventDefault();
      
      // Update sidebar nav active state
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      // Toggle screen divs
      screens.forEach(screen => {
        screen.classList.remove('active');
        if (screen.id === `screen-${targetScreen}`) {
          screen.classList.add('active');
        }
      });

      // Update Top Bar Title
      currentScreen = targetScreen;
      screenTitle.innerText = item.innerText.trim();
      
      // Screen-specific refreshes
      if (targetScreen === 'dashboard') loadDashboard();
      if (targetScreen === 'bookings') loadBookings();
      if (targetScreen === 'order-entry') updateOrderEntryConsole();
      if (targetScreen === 'billing') {
        populateBillingSelect().then(() => updateBillingConsole());
        const settleTab = document.getElementById('billing-tab-settle');
        if (settleTab) settleTab.click();
      }
      if (targetScreen === 'reports') loadReports();
      if (targetScreen === 'admin-management') {
        loadAdmins();
        loadAdminLoginLogs();
      }
    });
  });
}

// ----------------------------------------------------
// Forms & Modals Setup
// ----------------------------------------------------
function initForms() {
  const modalBooking = document.getElementById('modal-booking');
  const btnNewBooking = document.getElementById('btn-new-booking');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnCloseModal = document.getElementById('modal-booking-close');
  const formBooking = document.getElementById('form-booking');
  const roomNumberInput = document.getElementById('booking-room-number');

  // Sync native time picker and AM/PM select
  const timeInput = document.getElementById('booking-time');
  const ampmSelect = document.getElementById('booking-time-ampm');
  if (timeInput && ampmSelect) {
    const syncFromTimeInput = () => {
      const timeVal = timeInput.value;
      if (!timeVal) return;
      const parts = timeVal.split(':');
      if (parts.length < 2) return;
      const hours = parseInt(parts[0], 10);
      if (isNaN(hours)) return;
      ampmSelect.value = hours >= 12 ? 'PM' : 'AM';
    };

    const syncFromAmpmSelect = () => {
      const timeVal = timeInput.value;
      if (!timeVal) return;
      const parts = timeVal.split(':');
      if (parts.length < 2) return;
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1];
      if (isNaN(hours)) return;

      const ampm = ampmSelect.value;
      const h12 = hours % 12;
      const h24 = ampm === 'PM' ? h12 + 12 : h12;
      timeInput.value = `${String(h24).padStart(2, '0')}:${minutes}`;
    };

    timeInput.addEventListener('input', syncFromTimeInput);
    timeInput.addEventListener('change', syncFromTimeInput);
    ampmSelect.addEventListener('change', syncFromAmpmSelect);
  }

  // Open Create Modal
  btnNewBooking.addEventListener('click', () => {
    openBookingModal();
  });

  // Close Modals
  const closeBtnAction = () => {
    modalBooking.classList.remove('active');
    formBooking.reset();
    document.getElementById('booking-id-field').value = '';
    document.getElementById('booking-error-msg').style.display = 'none';
  };
  
  btnCancelModal.addEventListener('click', closeBtnAction);
  btnCloseModal.addEventListener('click', closeBtnAction);
  
  // Close booking detail modal
  document.getElementById('modal-detail-close').addEventListener('click', () => {
    document.getElementById('modal-detail').classList.remove('active');
  });

  // Form Submit (Create or Edit)
  formBooking.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('booking-error-msg');
    errorDiv.style.display = 'none';

    const bookingId = document.getElementById('booking-id-field').value;
    const roomNo = document.getElementById('booking-room-number').value;
    const bookingData = {
      guest_name: document.getElementById('booking-guest-name').value,
      guest_type: roomNo ? 'Hotel Guest' : 'Walk-in',
      room_number: roomNo || null,
      table_number: document.getElementById('booking-table-number').value,
      guest_count: document.getElementById('booking-guest-count').value,
      booking_date: document.getElementById('booking-date').value,
      booking_time: combineTimeInputWithAmpm(
        document.getElementById('booking-time').value,
        document.getElementById('booking-time-ampm').value
      ),
      dietary_preference: 'None',
      status: document.getElementById('booking-status').value || 'Active'
    };

    try {
      let url = `${API_BASE}/api/bookings`;
      let method = 'POST';

      if (bookingId) {
        url = `${API_BASE}/api/bookings/${bookingId}`;
        method = 'PUT';
      }

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || 'Server returned error');
      }

      closeBtnAction();
      await refreshData();
    } catch (err) {
      errorDiv.innerText = err.message;
      errorDiv.style.display = 'block';
    }
  });

  // Search bookings listener
  document.getElementById('bookings-search').addEventListener('input', () => {
    bookingsPage = 1;
    loadBookings();
  });

  // Filter tabs listener
  const filterTabs = document.querySelectorAll('#bookings-filter-tabs .filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      bookingsFilter = tab.getAttribute('data-filter');
      bookingsPage = 1;
      loadBookings();
    });
  });

  // Pagination listeners
  document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (bookingsPage > 1) {
      bookingsPage--;
      loadBookings();
    }
  });
  document.getElementById('btn-next-page').addEventListener('click', () => {
    bookingsPage++;
    loadBookings();
  });

  // Manage billing from detail modal button
  document.getElementById('btn-detail-manage-billing').addEventListener('click', async () => {
    if (selectedBooking) {
      document.getElementById('modal-detail').classList.remove('active');
      // Settle dropdown format is table:X or room:Y
      const targetVal = selectedBooking.table_number 
        ? `table:${selectedBooking.table_number}` 
        : `room:${selectedBooking.room_number}`;
      
      // Populate select options first
      await populateBillingSelect();
      
      billingSelectedTable = targetVal;
      document.getElementById('billing-table-select').value = targetVal;
      
      // Trigger click on billing tab
      document.querySelector('.nav-item[data-screen="billing"]').click();
    }
  });
}

function openBookingModal(existingBooking = null) {
  const modal = document.getElementById('modal-booking');
  const title = document.getElementById('modal-booking-title');
  const statusGroup = document.getElementById('edit-status-group');
  
  if (existingBooking) {
    title.innerText = 'Edit Reservation';
    statusGroup.style.display = 'block';
    document.getElementById('booking-id-field').value = existingBooking.id;
    document.getElementById('booking-guest-name').value = existingBooking.guest_name;
    document.getElementById('booking-room-number').value = existingBooking.room_number || '';

    document.getElementById('booking-table-number').value = existingBooking.table_number;
    document.getElementById('booking-guest-count').value = existingBooking.guest_count;
    document.getElementById('booking-date').value = existingBooking.booking_date;
    document.getElementById('booking-time').value = existingBooking.booking_time;
    
    // Set the AM/PM select based on booking_time
    const timeVal = existingBooking.booking_time || '';
    const parts = timeVal.split(':');
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10);
      if (!isNaN(hours)) {
        document.getElementById('booking-time-ampm').value = hours >= 12 ? 'PM' : 'AM';
      }
    }
    document.getElementById('booking-status').value = existingBooking.status;
  } else {
    title.innerText = 'New Table Reservation';
    statusGroup.style.display = 'none';
    document.getElementById('booking-id-field').value = '';
    document.getElementById('form-booking').reset();
    
    // Set default date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('booking-date').value = today;

    // Set default AM/PM based on current time
    const now = new Date();
    document.getElementById('booking-time-ampm').value = now.getHours() >= 12 ? 'PM' : 'AM';
  }

  modal.classList.add('active');
}

// ----------------------------------------------------
// Dashboard Loading & Logic
// ----------------------------------------------------
async function loadDashboard() {
  try {
    const res = await fetch(`${API_BASE}/api/reports/summary`);
    const summary = await res.json();
    
    if (!summary.success) return;

    latestRevenueTrend = summary.trend;

    // 1. Populate stats cards
    document.getElementById('stat-revenue').innerText = `₹${summary.totalRevenue.toFixed(2)}`;
    document.getElementById('stat-occupancy').innerText = `${summary.occupancyRate.toFixed(0)}%`;
    
    // Find active bookings count
    const activeCountRow = summary.statusCounts.find(x => x.status === 'Active');
    document.getElementById('stat-bookings').innerText = activeCountRow ? activeCountRow.count : 0;
    
    // Count only warning alerts (high and medium severity) for the stat card
    let warningAlertsCount = 0;
    summary.alerts.forEach(item => {
      item.alerts.forEach(alert => {
        if (alert.severity === 'high' || alert.severity === 'medium') {
          warningAlertsCount++;
        }
      });
    });
    document.getElementById('stat-alerts').innerText = warningAlertsCount;

    // 2. Populate operational alerts pane
    const alertsListDiv = document.getElementById('dashboard-alerts-list');
    alertsListDiv.innerHTML = '';
    
    if (summary.alerts.length === 0) {
      alertsListDiv.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:36px;height:36px;"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l3 3 5-6"/></svg>
          <p>All tables operating smoothly. No active warnings.</p>
        </div>
      `;
    } else {
      summary.alerts.forEach(item => {
        item.alerts.forEach(alert => {
          const alertDiv = document.createElement('div');
          alertDiv.className = `alert-item severity-${alert.severity}`;
          alertDiv.innerHTML = `
            <div class="alert-title">${alert.type.toUpperCase().replace('_', ' ')}</div>
            <div class="alert-desc">${alert.message}</div>
            <div class="alert-meta">Guest: ${item.guestName} • ${item.tableNumber ? `Table ${item.tableNumber}` : `Room ${item.roomNumber}`}</div>
          `;
          alertDiv.style.cursor = 'pointer';
          alertDiv.onclick = () => viewBookingDetails(item.bookingId);
          alertsListDiv.appendChild(alertDiv);
        });
      });
    }

    // 3. Render Live Tables Map
    await renderLiveTableMap();
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

async function renderLiveTableMap() {
  const mapContainer = document.getElementById('live-table-map');
  mapContainer.innerHTML = '';

  // Get active reservations today
  const todayStr = new Date().toISOString().split('T')[0];
  try {
    const res = await fetch(`${API_BASE}/api/bookings?limit=100`);
    const data = await res.json();
    const activeToday = data.bookings.filter(b => b.status === 'Active' && b.booking_date <= todayStr);
    
    // Aura Cafe standard table capacities
    const tableCapacities = {
      1: 2, 2: 2, 3: 2, 4: 2,
      5: 4, 6: 4, 7: 4,
      8: 6, 9: 6,
      10: 8
    };

    for (let tNum = 1; tNum <= 10; tNum++) {
      const isOccupied = activeToday.find(b => b.table_number === tNum);
      const tableDiv = document.createElement('div');
      
      if (isOccupied) {
        const hasOrders = isOccupied.orders_count > 0;
        tableDiv.className = hasOrders ? 'restaurant-table running' : 'restaurant-table occupied';
        tableDiv.innerHTML = `
          <div class="table-num">T-${tNum}</div>
          <div class="table-capacity">Cap: ${tableCapacities[tNum]}</div>
          <span class="table-status-pill">${hasOrders ? 'Running' : 'Reserved'}</span>
          <div style="font-size:0.75rem; text-align:center; margin-top:4px; font-weight:600; color:var(--text-muted);">${formatTime12H(isOccupied.booking_time)}</div>
        `;
        tableDiv.onclick = () => viewBookingDetails(isOccupied.id);
      } else {
        tableDiv.className = 'restaurant-table available';
        tableDiv.innerHTML = `
          <div class="table-num">T-${tNum}</div>
          <div class="table-capacity">Cap: ${tableCapacities[tNum]}</div>
          <span class="table-status-pill">Available</span>
        `;
        tableDiv.onclick = () => {
          openBookingModal();
          document.getElementById('booking-table-number').value = tNum;
        };
      }
      
      mapContainer.appendChild(tableDiv);
    }
  } catch (err) {
    console.error('Error loading table map:', err);
  }
}

// ----------------------------------------------------
// Bookings List Loading & Actions
// ----------------------------------------------------
async function loadBookings() {
  const tableBody = document.getElementById('bookings-table-body');
  const searchText = document.getElementById('bookings-search').value;
  
  tableBody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align:center; padding:40px;">
        <div class="loading-spinner"></div>
      </td>
    </tr>
  `;

  try {
    const res = await fetch(
      `${API_BASE}/api/bookings?page=${bookingsPage}&limit=${bookingsLimit}&status=${bookingsFilter}&search=${searchText}`
    );
    const data = await res.json();
    
    tableBody.innerHTML = '';
    bookingsList = data.bookings;

    if (bookingsList.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; padding:40px; color:var(--text-muted);">
            No bookings found.
          </td>
        </tr>
      `;
      document.getElementById('bookings-pagination-text').innerText = 'Showing 0 of 0 bookings';
      return;
    }

    bookingsList.forEach(b => {
      const tr = document.createElement('tr');
      
      // Format room number representation
      const roomStr = b.room_number ? b.room_number : '-';
      
      // Format status classes
      let statusClass = 'badge-active';
      if (b.status === 'Completed') statusClass = 'badge-completed';
      if (b.status === 'Cancelled') statusClass = 'badge-cancelled';
      if (b.status === 'Archived') statusClass = 'badge-archived';
      
      const isPaid = (b.payment_status && b.payment_status.toLowerCase() === 'paid');
      const paymentStatusClass = isPaid ? 'badge-paid' : 'badge-unpaid';
      const paymentStatusText = isPaid ? 'Paid' : 'Pending';

      tr.innerHTML = `
        <td style="font-weight:600;">${b.guest_name}</td>
        <td>${b.guest_type}</td>
        <td>${roomStr}</td>
        <td>${b.table_number ? `Table ${b.table_number}` : 'Room Service'}</td>
        <td>${b.booking_date} @ ${formatTime12H(b.booking_time)}</td>
        <td>${b.guest_count}</td>
        <td><span class="tag-badge">${b.dietary_preference}</span></td>
        <td><span class="badge ${paymentStatusClass}">${paymentStatusText}</span></td>
        <td><span class="badge ${statusClass}">${b.status}</span></td>
        <td>
          <div class="action-buttons">
            <button class="btn-icon view" title="View details" onclick="viewBookingDetails(${b.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="btn-icon edit" title="Edit booking" onclick="editBooking(${b.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${b.status === 'Active' ? `
              <button class="btn-icon delete" title="Cancel booking" onclick="cancelBooking(${b.id})">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            ` : ''}
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    const startItem = (data.page - 1) * data.limit + 1;
    const endItem = Math.min(startItem + bookingsList.length - 1, data.totalCount);
    document.getElementById('bookings-pagination-text').innerText = 
      `Showing ${startItem}-${endItem} of ${data.totalCount} bookings`;

    // Manage disabled states for pagination buttons
    document.getElementById('btn-prev-page').style.opacity = bookingsPage === 1 ? '0.5' : '1';
    document.getElementById('btn-next-page').style.opacity = endItem >= data.totalCount ? '0.5' : '1';
  } catch (err) {
    console.error('Error fetching bookings:', err);
  }
}

async function viewBookingDetails(id) {
  try {
    const res = await fetch(`${API_BASE}/api/bookings/${id}`);
    const data = await res.json();
    
    if (!data.success) return;
    
    selectedBooking = data.booking;
    const detailBody = document.getElementById('booking-detail-body');

    // Helper functions for category and subtotal labeling
    function getPrintCategory(cat) {
      const c = cat.toLowerCase().trim();
      if (c.includes('starter')) return 'STARTERS';
      if (c.includes('burger')) return 'BURGERS';
      if (c.includes('fried veg') || c.includes('fried items') || c.includes('fried veg items')) return 'FRIED ITEMS';
      if (c.includes('egg')) return 'EGG ITEMS';
      if (c.includes('juice') || c.includes('shake') || c.includes('beverage') || c.includes('drink') || c.includes('cool drinks')) return 'COOL DRINKS';
      if (c.includes('biryani') || c.includes('biriyani')) return 'BIRYANI';
      if (c.includes('rice')) return 'FRIED RICE';
      if (c.includes('noodle')) return 'NOODLES';
      if (c.includes('momo')) return 'MOMOS';
      if (c.includes('maggi') || c.includes('maggie')) return 'MAGGI';
      return cat.toUpperCase();
    }

    function getSubtotalLabel(printCat) {
      const p = printCat.toUpperCase();
      if (p === 'STARTERS') return 'Starters Subtotal';
      if (p === 'FRIED ITEMS') return 'Fried Items Subtotal';
      if (p === 'COOL DRINKS') return 'Drinks Subtotal';
      if (p === 'BIRYANI') return 'Biryani Subtotal';
      if (p === 'FRIED RICE') return 'Fried Rice Subtotal';
      if (p === 'NOODLES') return 'Noodles Subtotal';
      if (p === 'MOMOS') return 'Momos Subtotal';
      if (p === 'MAGGI') return 'Maggi Subtotal';
      if (p === 'BURGERS') return 'Burgers Subtotal';
      if (p === 'EGG ITEMS') return 'Egg Items Subtotal';
      return `${printCat.charAt(0).toUpperCase() + printCat.slice(1).toLowerCase()} Subtotal`;
    }

    // List active orders as a single flat table
    const activeOrders = data.orders.filter(o => o.status !== 'Cancelled');

    let ordersListHTML = '';
    if (activeOrders.length === 0) {
      ordersListHTML = '<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:20px;">No active menu items ordered yet.</p>';
    } else {
      ordersListHTML = `
        <table style="width:100%; font-size:0.85rem; border-collapse:collapse; font-family: inherit; margin-bottom: 16px;">
          <thead>
            <tr style="border-bottom:1px dashed #888; text-align:left; color:var(--text-muted);">
              <th style="padding:4px 0; font-weight:bold;">Item</th>
              <th style="text-align:center; width:45px; font-weight:bold;">Qty</th>
              <th style="text-align:right; width:85px; font-weight:bold;">Rate (₹)</th>
              <th style="text-align:right; width:95px; font-weight:bold;">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${activeOrders.map(o => `
              <tr>
                <td style="padding:4px 0; vertical-align:top;">${o.item_name}</td>
                <td style="text-align:center; vertical-align:top;">${o.quantity}</td>
                <td style="text-align:right; vertical-align:top;">${o.price.toFixed(2)}</td>
                <td style="text-align:right; vertical-align:top;">${(o.price * o.quantity).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // Cancelled items section for dashboard (hidden on print)
    let cancelledOrdersHTML = '';
    const cancelledItems = data.orders.filter(o => o.status === 'Cancelled');
    if (cancelledItems.length > 0) {
      cancelledOrdersHTML = `
        <div class="no-print" style="margin-top: 20px; border: 1px dashed rgba(239, 68, 68, 0.2); padding: 12px; border-radius: var(--radius-md); background: rgba(239, 68, 68, 0.02);">
          <div style="color: var(--danger); font-weight: bold; font-size: 0.8rem; margin-bottom: 6px; text-transform: uppercase;">Cancelled Items (Not Billed):</div>
          <table style="width:100%; font-size:0.8rem; border-collapse:collapse;">
            <tbody>
              ${cancelledItems.map(o => `
                <tr style="opacity:0.6; text-decoration:line-through; color:var(--text-muted);">
                  <td style="padding:4px 0;">${o.item_name}</td>
                  <td>x${o.quantity}</td>
                  <td style="text-align:right;">₹${(o.price * o.quantity).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    let alertAlertsHTML = '';
    if (data.alerts.length > 0) {
      alertAlertsHTML = `
        <div style="background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.3); padding:12px; border-radius:var(--radius-md); margin-bottom:16px;">
          <div style="color:var(--danger); font-weight:700; font-size:0.85rem; margin-bottom:6px;">OPERATIONAL ALERTS:</div>
          ${data.alerts.map(a => `<div style="font-size:0.8rem; margin-bottom:4px; color:var(--text-main);">• ${a.message}</div>`).join('')}
        </div>
      `;
    }

    // Date and bill layout metadata
    let formattedDate = data.booking.booking_date;
    let bookingYear = new Date().getFullYear();
    if (data.booking.booking_date && data.booking.booking_date.includes('-')) {
      const parts = data.booking.booking_date.split('-');
      if (parts.length === 3) {
        bookingYear = parts[0];
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    
    const sequenceStr = String(10000 + data.booking.id);
    const billNo = `#AC-${bookingYear}-${sequenceStr}`;
    const tableStr = data.booking.table_number 
      ? String(data.booking.table_number).padStart(2, '0') 
      : (data.booking.room_number ? 'Room ' + data.booking.room_number : 'Room Service');

    detailBody.innerHTML = `
      <div class="no-print">
        ${alertAlertsHTML}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; font-size:0.9rem; margin-bottom:24px;">
          <div>
            <p style="color:var(--text-muted); font-size:0.75rem;">GUEST DETAILS</p>
            <p style="font-size:1.15rem; font-weight:700; margin-top:4px;">${data.booking.guest_name}</p>
            <p style="color:var(--text-muted); margin-top:4px;">${data.booking.guest_type} ${data.booking.room_number ? `(Room ${data.booking.room_number})` : ''}</p>
          </div>
          <div>
            <p style="color:var(--text-muted); font-size:0.75rem;">RESERVATION DETAILS</p>
            <p style="font-size:1.15rem; font-weight:700; margin-top:4px; color:var(--primary);">${data.booking.table_number ? `Table ${data.booking.table_number}` : 'Room Service'}</p>
            <p style="color:var(--text-muted); margin-top:4px;">${data.booking.booking_date} @ ${formatTime12H(data.booking.booking_time)}</p>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; font-size:0.9rem; margin-bottom:24px; border-top:1px solid var(--border-glass); padding-top:16px;">
          <div>
            <p style="color:var(--text-muted); font-size:0.75rem;">DIETARY PREFERENCE</p>
            <p style="font-weight:600; margin-top:4px;"><span class="badge badge-active">${data.booking.dietary_preference}</span></p>
          </div>
          <div>
            <p style="color:var(--text-muted); font-size:0.75rem;">RESERVATION STATUS</p>
            <p style="font-weight:600; margin-top:4px;"><span class="badge badge-active">${data.booking.status}</span></p>
          </div>
        </div>
      </div>

      <!-- PRINTABLE RECEIPT CARD -->
      <div class="receipt-card" style="background:rgba(255,255,255,0.01); border:1px solid var(--border-glass); border-radius:var(--radius-md); padding:20px; font-family: monospace, Courier, monospace; font-size:0.9rem;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="font-size: 1.25rem; font-weight: bold; color: var(--text-main);">AURA CAFE</div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">Murkambattu, Chittoor</div>
        </div>
        
        <!-- Metadata -->
        <div style="font-size: 0.8rem; color: var(--text-muted); border-bottom: 1px dashed #888; padding-bottom: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; flex-wrap: wrap;">
          <span>Bill No: ${billNo}</span>
          <span>Table: ${tableStr}</span>
          <span>Date: ${formattedDate}</span>
        </div>

        <!-- Grouped Orders -->
        ${ordersListHTML}

        <!-- Final Summary -->
        <div style="border-top: 1px dashed #888; padding-top: 12px; margin-top: 16px;">
          <div style="font-weight: bold; margin-bottom: 8px; text-transform: uppercase; font-size: 0.95rem; color: var(--text-main);">FINAL SUMMARY</div>
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:var(--text-muted);">Items Sub-Total:</span>
            <span style="color:var(--text-main);">₹${data.billing.subtotal.toFixed(2)}</span>
          </div>
          ${data.billing.discount > 0 ? `
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:var(--accent);">
              <span>Hotel Guest Discount (10%):</span>
              <span>-₹${data.billing.discount.toFixed(2)}</span>
            </div>
          ` : ''}
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span style="color:var(--text-muted);">GST (5%):</span>
            <span style="color:var(--text-main);">₹${data.billing.tax.toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.05rem; border-top:1px dashed #888; padding-top:8px; margin-top:8px; color:var(--text-main);">
            <span>Grand Total:</span>
            <span>₹${data.billing.totalAmount.toFixed(2)}</span>
          </div>
        </div>

        <!-- Payment Info at Footer -->
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-top:16px; border-top:1px dotted rgba(255,255,255,0.05); padding-top:8px; color:var(--text-muted);">
          <span>Payment Status:</span>
          <span>${data.payment.status} (${data.payment.payment_method})</span>
        </div>
        ${data.payment.status === 'Paid' ? `
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-top:4px; color:var(--text-muted);">
            <span>Receipt Sequence:</span>
            <span>RCPT-${data.booking.booking_date.split('-')[0]}-${String(data.payment.receipt_sequence || data.payment.id).padStart(3, '0')}</span>
          </div>
        ` : ''}
      </div>

      ${cancelledOrdersHTML}
    `;

    document.getElementById('modal-active-bookings').classList.remove('active');
    document.getElementById('modal-detail').classList.add('active');
  } catch (err) {
    console.error('Error fetching booking details:', err);
  }
}

async function editBooking(id) {
  try {
    const res = await fetch(`${API_BASE}/api/bookings/${id}`);
    const data = await res.json();
    if (data.success) {
      openBookingModal(data.booking);
    }
  } catch (err) {
    console.error('Error fetching booking for edit:', err);
  }
}

async function cancelBooking(id) {
  if (confirm('Are you sure you want to cancel this reservation?')) {
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' })
      });
      if (res.ok) {
        await refreshData();
      } else {
        const error = await res.json();
        alert(`Failed to cancel booking: ${error.message}`);
      }
    } catch (err) {
      console.error('Error cancelling booking:', err);
    }
  }
}

// ----------------------------------------------------
// Billing & Menu Console Loader
// ----------------------------------------------------
async function loadMenu() {
  try {
    const res = await fetch(`${API_BASE}/api/menu`);
    menuItems = await res.json();
    
    // Adjust admin max price limit dynamically
    if (menuItems && menuItems.length > 0) {
      const highestPrice = Math.max(...menuItems.map(item => item.price));
      const roundedMax = Math.ceil(highestPrice / 50) * 50;
      const priceSlider = document.getElementById('admin-menu-price-slider');
      const maxPriceDisplay = document.getElementById('admin-max-price-display');
      if (priceSlider) {
        priceSlider.max = roundedMax;
        priceSlider.value = roundedMax;
        adminMaxPriceLimit = roundedMax;
      }
      if (maxPriceDisplay) {
        maxPriceDisplay.innerText = `₹${roundedMax}`;
      }
    }
    
    renderAdminCategoryTabs();
  } catch (err) {
    console.error('Error loading menu catalog:', err);
  }
}

function renderAdminCategoryTabs() {
  const container = document.getElementById('admin-category-tabs-container');
  if (!container) return;

  const categories = [];
  const definedCategories = [
    'Veg Burgers',
    'Non-Veg Burgers',
    'Egg Items',
    'Fried Veg',
    'Veg Starters',
    'Non-Veg Starters',
    'Fried Chicken',
    'Samosa',
    'Sandwich',
    'Biryani',
    'Fried Rice',
    'Momos',
    'Noodles',
    'Maggi',
    'Milkshakes',
    'Hot Beverages',
    'Fresh Fruit Juices',
    'Fruit Bowls',
    'Desserts',
    'Soups'
  ];

  // Only display categories that actually contain items
  definedCategories.forEach(cat => {
    if (menuItems.some(item => item.category === cat)) {
      categories.push(cat);
    }
  });

  // Dynamically append any extra categories from database
  menuItems.forEach(item => {
    if (item.category && !categories.includes(item.category)) {
      categories.push(item.category);
    }
  });

  let tabsHTML = `<div class="category-tab ${adminSelectedCategory === 'All' ? 'active' : ''}" data-category="All">All Items</div>`;
  categories.forEach(cat => {
    tabsHTML += `<div class="category-tab ${adminSelectedCategory === cat ? 'active' : ''}" data-category="${cat}">${cat}</div>`;
  });

  container.innerHTML = tabsHTML;
  initAdminCategoryFilters();
}

function initAdminCategoryFilters() {
  const tabs = document.querySelectorAll('#admin-category-tabs-container .category-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      adminSelectedCategory = tab.getAttribute('data-category');
      updateOrderEntryConsole();
    });
  });
}

function initAdminMenuFilters() {
  const searchInput = document.getElementById('admin-menu-search-input');
  const dietButtons = document.querySelectorAll('.dietary-filter-group .filter-btn');
  const priceSlider = document.getElementById('admin-menu-price-slider');
  const maxPriceDisplay = document.getElementById('admin-max-price-display');
  const sortSelect = document.getElementById('admin-menu-sort-select');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      adminSearchQuery = e.target.value.toLowerCase().trim();
      updateOrderEntryConsole();
    });
  }

  dietButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id.startsWith('admin-diet-btn')) {
        dietButtons.forEach(b => {
          if (b.id.startsWith('admin-diet-btn')) b.classList.remove('active');
        });
        btn.classList.add('active');
        adminDietFilter = btn.getAttribute('data-diet');
        updateOrderEntryConsole();
      }
    });
  });

  if (priceSlider) {
    priceSlider.addEventListener('input', (e) => {
      adminMaxPriceLimit = parseFloat(e.target.value);
      if (maxPriceDisplay) {
        maxPriceDisplay.innerText = `₹${adminMaxPriceLimit}`;
      }
      updateOrderEntryConsole();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      adminSortBy = e.target.value;
      updateOrderEntryConsole();
    });
  }
}

let orderEntrySelectedTable = null;
let orderEntryBooking = null;

let billingSelectedTable = null;
let billingBooking = null;

function initSplitAdminConsole() {
  initAdminMenuFilters();
  // Mode toggles
  const destTable = document.getElementById('order-dest-table');
  const destRoom = document.getElementById('order-dest-room');
  const tableSelectContainer = document.getElementById('order-entry-table-select-container');
  const roomContainer = document.getElementById('order-entry-room-container');
  
  const toggleMode = (mode) => {
    orderEntryMode = mode;
    if (mode === 'table') {
      document.getElementById('lbl-dest-table').className = 'btn btn-primary';
      document.getElementById('lbl-dest-room').className = 'btn btn-secondary';
      tableSelectContainer.style.display = 'block';
      roomContainer.style.display = 'none';
    } else {
      document.getElementById('lbl-dest-room').className = 'btn btn-primary';
      document.getElementById('lbl-dest-table').className = 'btn btn-secondary';
      tableSelectContainer.style.display = 'none';
      roomContainer.style.display = 'block';
    }
    updateOrderEntryConsole();
  };

  if (destTable && destRoom) {
    destTable.addEventListener('change', () => toggleMode('table'));
    destRoom.addEventListener('change', () => toggleMode('room'));
  }

  const orderTableSelect = document.getElementById('order-entry-table-select');
  orderTableSelect.addEventListener('change', async () => {
    orderEntrySelectedTable = orderTableSelect.value ? parseInt(orderTableSelect.value, 10) : null;
    await updateOrderEntryConsole();
  });

  const orderRoomInput = document.getElementById('order-entry-room-input');
  if (orderRoomInput) {
    orderRoomInput.addEventListener('input', async () => {
      orderEntrySelectedRoom = orderRoomInput.value.trim() || null;
      await updateOrderEntryConsole();
    });
  }

  const billingTableSelect = document.getElementById('billing-table-select');
  billingTableSelect.addEventListener('change', async () => {
    billingSelectedTable = billingTableSelect.value || null;
    await updateBillingConsole();
  });

  const billingTabSettle = document.getElementById('billing-tab-settle');
  const billingTabHistory = document.getElementById('billing-tab-history');
  const billingSettleContainer = document.getElementById('billing-settle-container');
  const billingHistoryContainer = document.getElementById('billing-history-container');

  if (billingTabSettle && billingTabHistory) {
    billingTabSettle.addEventListener('click', () => {
      billingTabSettle.className = 'btn btn-primary';
      billingTabHistory.className = 'btn btn-secondary';
      billingSettleContainer.style.display = 'block';
      billingHistoryContainer.style.display = 'none';
    });

    billingTabHistory.addEventListener('click', async () => {
      billingTabSettle.className = 'btn btn-secondary';
      billingTabHistory.className = 'btn btn-primary';
      billingSettleContainer.style.display = 'none';
      billingHistoryContainer.style.display = 'block';
      await loadSettlementHistory();
    });
  }
}

async function updateOrderEntryConsole() {
  const infoDiv = document.getElementById('order-entry-table-info');
  const consoleLayout = document.getElementById('order-entry-console-layout');
  const menuGrid = document.getElementById('order-entry-menu-items');

  if (orderEntryMode === 'table') {
    if (!orderEntrySelectedTable) {
      infoDiv.innerHTML = '<span style="color: var(--text-muted); font-size: 0.9rem;">Select a table to start placing orders.</span>';
      consoleLayout.style.display = 'none';
      return;
    }
  } else {
    if (!orderEntrySelectedRoom) {
      infoDiv.innerHTML = '<span style="color: var(--text-muted); font-size: 0.9rem;">Enter a room number to start placing orders.</span>';
      consoleLayout.style.display = 'none';
      return;
    }
  }

  // Fetch active booking for selected table or room
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const res = await fetch(`${API_BASE}/api/bookings?limit=100`);
    const data = await res.json();
    
    if (orderEntryMode === 'table') {
      orderEntryBooking = data.bookings.find(b => b.table_number === orderEntrySelectedTable && b.status === 'Active' && b.booking_date <= todayStr);
    } else {
      orderEntryBooking = data.bookings.find(b => b.room_number === orderEntrySelectedRoom && !b.table_number && b.status === 'Active' && b.booking_date <= todayStr);
    }
    
    if (orderEntryBooking) {
      infoDiv.innerHTML = `
        <span style="font-weight: 600; font-size: 0.95rem; color: var(--primary);">Active Guest: ${orderEntryBooking.guest_name}</span>
        <span class="badge badge-active" style="margin-left: 10px;">${orderEntryBooking.guest_type}</span>
        ${orderEntryBooking.dietary_preference !== 'None' ? `<span class="badge badge-cancelled" style="margin-left: 10px;">Pref: ${orderEntryBooking.dietary_preference}</span>` : ''}
      `;
    } else {
      if (orderEntryMode === 'table') {
        infoDiv.innerHTML = `<span style="color: var(--text-muted); font-size: 0.9rem;">No active reservation for Table ${orderEntrySelectedTable} today. Placing an order will automatically create a walk-in booking.</span>`;
      } else {
        infoDiv.innerHTML = `<span style="color: var(--text-muted); font-size: 0.9rem;">No active session for Room ${orderEntrySelectedRoom} today. Placing an order will automatically create a room service booking.</span>`;
      }
      orderEntryBooking = null;
    }
    
    consoleLayout.style.display = 'grid';
    if (orderEntryMode === 'table') {
      document.getElementById('order-entry-preview-meta').innerText = `Table ${orderEntrySelectedTable} • ${orderEntryBooking ? orderEntryBooking.guest_name : 'New Walk-in'}`;
    } else {
      document.getElementById('order-entry-preview-meta').innerText = `Room ${orderEntrySelectedRoom} • ${orderEntryBooking ? orderEntryBooking.guest_name : 'New Room Service'}`;
    }
    
    // 1. Filter and sort Menu Items
    let filteredItems = menuItems.filter(item => {
      // Category tab filter
      if (adminSelectedCategory !== 'All' && item.category !== adminSelectedCategory) {
        return false;
      }
      // Search query filter
      if (adminSearchQuery && !item.name.toLowerCase().includes(adminSearchQuery)) {
        return false;
      }
      // Veg/Non-Veg filter
      const isVeg = isVegItem(item);
      if (adminDietFilter === 'VEG' && !isVeg) return false;
      if (adminDietFilter === 'NON-VEG' && isVeg) return false;
      // Price range slider filter
      if (item.price > adminMaxPriceLimit) return false;
      
      return true;
    });

    // Sort the filtered items
    filteredItems.sort((a, b) => {
      if (adminSortBy === 'name-asc') {
        return a.name.localeCompare(b.name);
      } else if (adminSortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      } else if (adminSortBy === 'price-asc') {
        return a.price - b.price;
      } else if (adminSortBy === 'price-desc') {
        return b.price - a.price;
      }
      return 0;
    });

    menuGrid.innerHTML = '';
    
    const renderCard = (item) => {
      const tags = item.dietary_tags.split(',').map(t => t.trim().toLowerCase());
      const isWarning = orderEntryBooking && 
                        orderEntryBooking.dietary_preference !== 'None' && 
                        !tags.includes(orderEntryBooking.dietary_preference.toLowerCase());
      
      const isAvailable = item.is_available !== 0;
      const card = document.createElement('div');
      card.className = `menu-item-card ${isWarning ? 'dietary-warning-item' : ''}`;
      if (isWarning) {
        card.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        card.style.background = 'rgba(239, 68, 68, 0.02)';
      }
      if (!isAvailable) {
        card.style.opacity = '0.75';
        card.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      }

      let imgPath = item.image_url || 'images/appetizer.png';
      if (!item.image_url) {
        if (item.category === 'Main Course (Veg)' || item.category === 'Main Course (Non-Veg)') {
          imgPath = 'images/main_course.png';
        } else if (item.category === 'Desserts') {
          imgPath = 'images/dessert.png';
        }
      }

      const isVeg = isVegItem(item);
      card.innerHTML = `
        <div class="menu-item-image-container">
          <!-- Veg/Non-Veg Floating badge on top left of image -->
          <span class="admin-card-badge-left">
            <span class="dot-icon ${isVeg ? 'veg-dot' : 'nonveg-dot'}"></span>
            ${isVeg ? 'Veg' : 'Non-Veg'}
          </span>
          
          <!-- Category Banner on top right of image -->
          <span class="admin-card-badge-right ${isVeg ? 'veg-cat' : ''}">${item.category}</span>
          
          <img src="${imgPath}" alt="${item.name}" loading="lazy" onerror="handleImageError(this, '${item.name.replace(/'/g, "\\'")}', 'images/food-placeholder.svg')">
        </div>
        <div class="admin-item-content">
          <div class="admin-item-name">${item.name}</div>
          <div class="admin-item-bottom">
            <span class="admin-item-price">₹${item.price.toFixed(2)}</span>
          </div>
          ${isWarning ? `<div style="color:var(--danger); font-size:0.65rem; margin-top:2px; font-weight:600;">⚠ Conflicts preference</div>` : ''}
          <button class="btn-stock" style="margin-top: 6px; width: 100%; font-size: 0.7rem; padding: 4px 8px; border-radius: var(--radius-sm); cursor: pointer; transition: var(--transition-smooth); font-weight: 600; text-align: center; border: 1px solid ${isAvailable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; background: ${isAvailable ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'}; color: ${isAvailable ? 'var(--accent)' : 'var(--danger)'};">
            ${isAvailable ? 'In Stock' : 'Out of Stock'}
          </button>
        </div>
      `;

      card.onclick = (e) => {
        if (e.target.classList.contains('btn-stock')) {
          e.stopPropagation();
          toggleItemAvailability(item.id, isAvailable ? 0 : 1);
          return;
        }
        if (!isAvailable) {
          alert('This item is currently out of stock.');
          return;
        }
        addFoodOrderItemForTable(item.name);
      };
      menuGrid.appendChild(card);
    };

    if (adminSelectedCategory === 'All') {
      const categoriesOrder = [
        'Veg Burgers',
        'Non-Veg Burgers',
        'Egg Items',
        'Fried Veg',
        'Veg Starters',
        'Non-Veg Starters',
        'Fried Chicken',
        'Samosa',
        'Sandwich',
        'Biryani',
        'Fried Rice',
        'Momos',
        'Noodles',
        'Maggi',
        'Milkshakes',
        'Hot Beverages',
        'Fresh Fruit Juices',
        'Fruit Bowls',
        'Desserts',
        'Soups'
      ];
      
      filteredItems.forEach(item => {
        if (item.category && !categoriesOrder.includes(item.category)) {
          categoriesOrder.push(item.category);
        }
      });
      
      let hasAnyItems = false;
      
      categoriesOrder.forEach(cat => {
        const catItems = filteredItems.filter(item => item.category === cat);
        if (catItems.length > 0) {
          hasAnyItems = true;
          const heading = document.createElement('div');
          heading.className = 'category-section-heading';
          heading.innerText = cat;
          heading.style.gridColumn = '1 / -1';
          heading.style.fontSize = '1.05rem';
          heading.style.fontWeight = '700';
          heading.style.color = 'var(--primary)';
          heading.style.borderBottom = '1px solid var(--border-glass)';
          heading.style.paddingBottom = '4px';
          heading.style.marginTop = '16px';
          heading.style.marginBottom = '8px';
          menuGrid.appendChild(heading);
          
          catItems.forEach(item => {
            renderCard(item);
          });
        }
      });
      
      if (!hasAnyItems) {
        menuGrid.innerHTML = `
          <div style="text-align: center; padding: 20px; color: var(--text-muted); grid-column: 1 / -1; font-size: 0.85rem;">
            No dishes match the filter criteria.
          </div>
        `;
      }
    } else {
      if (filteredItems.length === 0) {
        menuGrid.innerHTML = `
          <div style="text-align: center; padding: 20px; color: var(--text-muted); grid-column: 1 / -1; font-size: 0.85rem;">
            No dishes available in this category.
          </div>
        `;
      } else {
        filteredItems.forEach(item => {
          renderCard(item);
        });
      }
    }

    // 2. Fetch and Render Preview Orders list
    await refreshOrderEntryPreview();
  } catch (err) {
    console.error('Error loading order entry console:', err);
  }
}

async function refreshOrderEntryPreview() {
  const previewList = document.getElementById('order-entry-preview-list');
  const previewTotal = document.getElementById('order-entry-preview-total');
  const dietaryWarning = document.getElementById('order-entry-dietary-warning');
  const kotList = document.getElementById('kot-preview-list');
  const printKotBtn = document.getElementById('btn-print-kot');

  previewList.innerHTML = '';
  dietaryWarning.style.display = 'none';

  if (kotList) kotList.innerHTML = 'No active KOT items.';
  if (printKotBtn) printKotBtn.disabled = true;

  if (!orderEntryBooking) {
    previewList.innerHTML = '<div style="padding: 20px 0; font-size: 0.85rem; color: var(--text-muted);">No items ordered yet. Click menu items to add.</div>';
    previewTotal.innerText = '₹0.00';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/bookings/${orderEntryBooking.id}`);
    const data = await res.json();
    
    if (!data.success) return;

    // Update dietary warning
    const dietaryAlerts = data.alerts.filter(a => a.type === 'dietary_conflict');
    if (dietaryAlerts.length > 0) {
      dietaryWarning.style.display = 'block';
      dietaryWarning.className = 'badge badge-cancelled';
      dietaryWarning.style.width = '100%';
      dietaryWarning.style.textAlign = 'left';
      dietaryWarning.style.borderRadius = 'var(--radius-md)';
      dietaryWarning.style.fontSize = '0.75rem';
      dietaryWarning.innerHTML = `<strong>Dietary Conflict Alert:</strong><br>${dietaryAlerts.map(a => a.message).join('<br>')}`;
    }

    if (data.orders.length === 0) {
      previewList.innerHTML = '<div style="padding: 20px 0; font-size: 0.85rem; color: var(--text-muted);">No items ordered yet. Click menu items to add.</div>';
    } else {
      data.orders.forEach(o => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'receipt-item';
        if (o.status === 'Cancelled') {
          itemDiv.style.textDecoration = 'line-through';
          itemDiv.style.opacity = '0.5';
        }
        itemDiv.innerHTML = `
          <div class="receipt-item-detail">
            <span class="receipt-item-name">${o.item_name}</span>
            <span class="receipt-item-qty">x${o.quantity} @ ₹${o.price.toFixed(2)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span>₹${(o.price * o.quantity).toFixed(2)}</span>
            ${o.status !== 'Cancelled' ? `
              <button class="btn-icon delete" style="width:20px; height:20px; border-radius:50%;" title="Remove" onclick="cancelOrderItemForTable(${o.id})">
                &times;
              </button>
            ` : ''}
          </div>
        `;
        previewList.appendChild(itemDiv);
      });
    }

    previewTotal.innerText = `₹${data.billing.totalAmount.toFixed(2)}`;

    // Update KOT System
    const activeOrders = data.orders.filter(o => o.status !== 'Cancelled');
    if (kotList && printKotBtn) {
      if (activeOrders.length === 0) {
        kotList.innerHTML = 'No active KOT items.';
        printKotBtn.disabled = true;
      } else {
        printKotBtn.disabled = false;
        kotList.innerHTML = activeOrders.map(o => `
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:500; border-bottom:1px dotted rgba(200,159,30,0.1); padding-bottom:4px;">
            <span style="color:var(--text-main);">${o.item_name}</span>
            <span style="font-weight:700; color:var(--primary);">x${o.quantity}</span>
          </div>
        `).join('');

        printKotBtn.onclick = () => {
          const tableName = orderEntryMode === 'table' ? `Table ${orderEntrySelectedTable}` : `Room ${orderEntrySelectedRoom}`;
          const guestName = orderEntryBooking ? orderEntryBooking.guest_name : 'New Session';
          printKitchenToken(tableName, guestName, activeOrders);
        };
      }
    }
  } catch (err) {
    console.error('Error refreshing preview:', err);
  }
}

async function addFoodOrderItemForTable(itemName) {
  if (orderEntryMode === 'table') {
    if (!orderEntrySelectedTable) return;
  } else {
    if (!orderEntrySelectedRoom) return;
  }

  try {
    // If no active booking exists, use public endpoint to place order and auto-create booking
    if (!orderEntryBooking) {
      const payload = orderEntryMode === 'table' 
        ? { table_number: orderEntrySelectedTable, items: [{ item_name: itemName, quantity: 1 }] }
        : { room_number: orderEntrySelectedRoom, items: [{ item_name: itemName, quantity: 1 }] };

      const res = await fetch(`${API_BASE}/api/public/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        // Fetch new booking
        const bRes = await fetch(`${API_BASE}/api/bookings/${data.bookingId}`);
        const bData = await bRes.json();
        orderEntryBooking = bData.booking;
        await updateOrderEntryConsole();
        await loadDashboard(); // refresh live map
      } else {
        alert(`Failed to add order: ${data.message}`);
      }
    } else {
      // Add order to existing booking
      const res = await fetch(`${API_BASE}/api/bookings/${orderEntryBooking.id}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name: itemName, quantity: 1 })
      });
      if (res.ok) {
        await refreshOrderEntryPreview();
        await loadDashboard();
      } else {
        const error = await res.json();
        alert(`Failed to add order: ${error.message}`);
      }
    }
  } catch (err) {
    console.error('Error adding order:', err);
  }
}

async function cancelOrderItemForTable(orderId) {
  if (!orderEntryBooking) return;
  try {
    const res = await fetch(`${API_BASE}/api/bookings/${orderEntryBooking.id}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Cancelled' })
    });
    if (res.ok) {
      await refreshOrderEntryPreview();
      await loadDashboard();
    }
  } catch (err) {
    console.error('Error cancelling order:', err);
  }
}

async function populateBillingSelect() {
  const billingTableSelect = document.getElementById('billing-table-select');
  const currentValue = billingTableSelect.value;
  
  billingTableSelect.innerHTML = '<option value="">Select Dining Session...</option>';
  
  // Add tables 1-10
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement('option');
    opt.value = `table:${i}`;
    opt.textContent = `Table ${i}`;
    billingTableSelect.appendChild(opt);
  }
  
  // Add active room service sessions
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const res = await fetch(`${API_BASE}/api/bookings?status=Active&limit=100`);
    const data = await res.json();
    
    if (data.success) {
      const roomBookings = data.bookings.filter(b => b.room_number && (b.table_number === null || b.table_number === undefined) && b.status === 'Active');
      
      if (roomBookings.length > 0) {
        const optGroup = document.createElement('optgroup');
        optGroup.label = "Active Room Service";
        roomBookings.forEach(b => {
          const opt = document.createElement('option');
          opt.value = `room:${b.room_number}`;
          opt.textContent = `Room ${b.room_number} Service`;
          optGroup.appendChild(opt);
        });
        billingTableSelect.appendChild(optGroup);
      }
    }
  } catch (err) {
    console.error('Error fetching active room service bookings for dropdown:', err);
  }
  
  // Restore value if it exists
  if (currentValue) {
    billingTableSelect.value = currentValue;
  }
}

async function updateBillingConsole() {
  const infoDiv = document.getElementById('billing-table-info');
  const consoleLayout = document.getElementById('billing-console-layout');

  if (!billingSelectedTable) {
    infoDiv.innerHTML = '<span style="color: var(--text-muted); font-size: 0.9rem;">Select a table or room to settle payment.</span>';
    consoleLayout.style.display = 'none';
    return;
  }

  // Find active booking for the selected table or room today
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const res = await fetch(`${API_BASE}/api/bookings?limit=100`);
    const data = await res.json();
    
    const [type, identifier] = billingSelectedTable.split(':');
    
    if (type === 'table') {
      const tableNum = parseInt(identifier, 10);
      billingBooking = data.bookings.find(b => b.table_number === tableNum && b.status === 'Active' && b.booking_date <= todayStr);
    } else if (type === 'room') {
      billingBooking = data.bookings.find(b => b.room_number === identifier && !b.table_number && b.status === 'Active' && b.booking_date <= todayStr);
    }
    
    if (!billingBooking) {
      const displayLabel = type === 'table' ? `Table ${identifier}` : `Room ${identifier}`;
      infoDiv.innerHTML = `<span style="color: var(--text-muted); font-size: 0.9rem; font-weight: 500;">No active reservation or unpaid billing found for ${displayLabel} today.</span>`;
      consoleLayout.style.display = 'none';
      return;
    }

    infoDiv.innerHTML = `
      <span style="font-weight: 700; font-size: 0.95rem; color: var(--primary);">Active Guest: ${billingBooking.guest_name}</span>
      <span class="badge badge-active" style="margin-left: 10px;">${billingBooking.guest_type}</span>
    `;

    consoleLayout.style.display = 'grid';

    // Fetch details & receipt items
    const detailRes = await fetch(`${API_BASE}/api/bookings/${billingBooking.id}`);
    const detailData = await detailRes.json();
    if (!detailData.success) return;

    selectedBooking = detailData.booking; // Keep compatibility for payment triggers

    // Header updates
    document.getElementById('receipt-guest-name').innerText = selectedBooking.guest_name;
    document.getElementById('receipt-meta-info').innerText = 
      selectedBooking.table_number 
        ? `Table ${selectedBooking.table_number} • ${selectedBooking.guest_type} ${selectedBooking.room_number ? `(Room ${selectedBooking.room_number})` : ''}`
        : `Room ${selectedBooking.room_number} Service • ${selectedBooking.guest_type}`;

    // Dietary alerts warning
    const alertBox = document.getElementById('receipt-dietary-warning');
    const dietaryAlerts = detailData.alerts.filter(a => a.type === 'dietary_conflict');
    if (dietaryAlerts.length > 0) {
      alertBox.style.display = 'block';
      alertBox.className = 'badge badge-cancelled';
      alertBox.style.width = '100%';
      alertBox.style.textAlign = 'left';
      alertBox.style.borderRadius = 'var(--radius-md)';
      alertBox.style.fontSize = '0.75rem';
      alertBox.innerHTML = `<strong>Dietary Conflict Alert:</strong><br>${dietaryAlerts.map(a => a.message).join('<br>')}`;
    } else {
      alertBox.style.display = 'none';
    }

    // Render receipt items list
    const itemsList = document.getElementById('receipt-items-list');
    itemsList.innerHTML = '';
    
    if (detailData.orders.length === 0) {
      itemsList.innerHTML = '<div style="padding: 20px 0; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No menu items ordered yet.</div>';
    } else {
      detailData.orders.forEach(o => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'receipt-item';
        if (o.status === 'Cancelled') {
          itemDiv.style.textDecoration = 'line-through';
          itemDiv.style.opacity = '0.5';
        }
        itemDiv.innerHTML = `
          <div class="receipt-item-detail">
            <span class="receipt-item-name">${o.item_name}</span>
            <span class="receipt-item-qty">x${o.quantity} @ ₹${o.price.toFixed(2)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span>₹${(o.price * o.quantity).toFixed(2)}</span>
            ${(o.status !== 'Cancelled' && detailData.payment.status !== 'Paid') ? `
              <button class="btn-icon delete" style="width:20px; height:20px; border-radius:50%;" title="Remove" onclick="cancelOrderItemFromBilling(${o.id})">
                &times;
              </button>
            ` : ''}
          </div>
        `;
        itemsList.appendChild(itemDiv);
      });
    }

    // Render sums
    document.getElementById('receipt-subtotal').innerText = `₹${detailData.billing.subtotal.toFixed(2)}`;
    
    const discountRow = document.getElementById('receipt-discount-row');
    if (detailData.billing.discount > 0) {
      discountRow.style.display = 'flex';
      document.getElementById('receipt-discount').innerText = `-₹${detailData.billing.discount.toFixed(2)}`;
    } else {
      discountRow.style.display = 'none';
    }

    document.getElementById('receipt-tax').innerText = `₹${detailData.billing.tax.toFixed(2)}`;
    document.getElementById('receipt-total').innerText = `₹${detailData.billing.totalAmount.toFixed(2)}`;

    // Toggle Payment Forms or Settle Paid Status
    const paymentActions = document.getElementById('payment-actions-wrapper');
    const paidStatus = document.getElementById('receipt-paid-status');
    const roomChargeBtn = document.getElementById('btn-room-charge');

    if (detailData.payment.status === 'Paid') {
      paymentActions.style.display = 'none';
      paidStatus.style.display = 'block';
      const year = selectedBooking.booking_date.split('-')[0];
      const seq = String(detailData.payment.receipt_sequence || detailData.payment.id).padStart(3, '0');
      paidStatus.innerHTML = `BILL SETTLED VIA ${detailData.payment.payment_method.toUpperCase()}<br><span style="font-size:0.85rem; opacity:0.85; font-weight:600;">Receipt No: RCPT-${year}-${seq}</span>`;
    } else {
      paidStatus.style.display = 'none';
      paymentActions.style.display = 'block';
      
      // Disable room charge if not hotel guest
      if (selectedBooking.guest_type !== 'Hotel Guest') {
        roomChargeBtn.setAttribute('disabled', 'true');
        roomChargeBtn.style.opacity = '0.5';
        roomChargeBtn.style.cursor = 'not-allowed';
      } else {
        roomChargeBtn.removeAttribute('disabled');
        roomChargeBtn.style.opacity = '1';
        roomChargeBtn.style.cursor = 'pointer';
      }
    }

  } catch (err) {
    console.error('Error loading billing receipt:', err);
  }
}

async function cancelOrderItemFromBilling(orderId) {
  if (!billingBooking) return;
  try {
    const res = await fetch(`${API_BASE}/api/bookings/${billingBooking.id}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Cancelled' })
    });
    if (res.ok) {
      await updateBillingConsole();
      await loadDashboard();
    }
  } catch (err) {
    console.error('Error cancelling order:', err);
  }
}

async function recordPayment(method) {
  if (!selectedBooking) return;
  
  if (confirm(`Confirm settling total of ${document.getElementById('receipt-total').innerText} via ${method}?`)) {
    try {
      const res = await fetch(`${API_BASE}/api/bookings/${selectedBooking.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: method })
      });
      
      const data = await res.json();
      if (res.ok) {
        await refreshData();
        await updateBillingConsole();
      } else {
        alert(`Failed to record payment: ${data.message}`);
      }
    } catch (err) {
      console.error('Error processing checkout:', err);
    }
  }
}



// ----------------------------------------------------
// Reports, Analytics, & Charts Loading
// ----------------------------------------------------
async function loadReports() {
  try {
    const datePicker = document.getElementById('revenue-date-picker');
    if (datePicker) {
      if (!datePicker.value) {
        const d = new Date();
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - (offset * 60 * 1000));
        datePicker.value = localDate.toISOString().split('T')[0];
        
        datePicker.removeEventListener('change', loadReports);
        datePicker.addEventListener('change', loadReports);
      }
    }
    
    const selectedDate = datePicker ? datePicker.value : new Date().toISOString().split('T')[0];
    
    const res = await fetch(`${API_BASE}/api/reports/summary?date=${selectedDate}`);
    const summary = await res.json();
    
    if (!summary.success) return;

    // 1. Populate stats cards for selected date
    const stats = summary.targetStats || { total: 0, upi: 0, cash: 0, card: 0, roomCharge: 0 };
    const others = (stats.card || 0) + (stats.roomCharge || 0);
    
    document.getElementById('revenue-val-total').innerText = `₹${(stats.total || 0).toFixed(2)}`;
    document.getElementById('revenue-val-upi').innerText = `₹${(stats.upi || 0).toFixed(2)}`;
    document.getElementById('revenue-val-cash').innerText = `₹${(stats.cash || 0).toFixed(2)}`;
    document.getElementById('revenue-val-others').innerText = `₹${others.toFixed(2)}`;

    // 2. Populate transaction list table
    const tableBody = document.getElementById('revenue-transactions-table-body');
    if (tableBody) {
      tableBody.innerHTML = '';
      
      const transactions = summary.targetTransactions || [];
      if (transactions.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 0.9rem;">
              No payments settled via UPI or Cash on this date.
            </td>
          </tr>
        `;
      } else {
        transactions.forEach(tx => {
          const row = document.createElement('tr');
          row.style.borderBottom = '1px solid var(--border-glass)';
          
          const dateVal = new Date(tx.payment_date);
          const year = dateVal.getFullYear();
          const seq = String(tx.payment_id).padStart(4, '0');
          const receiptNo = `RCPT-${year}-${seq}`;
          
          const label = tx.table_number ? `Table ${tx.table_number}` : `Room ${tx.room_number}`;
          const amountFormatted = `₹${parseFloat(tx.total_amount).toFixed(2)}`;
          const timeFormatted = tx.booking_time ? formatTime12H(tx.booking_time) : 'N/A';
          
          row.innerHTML = `
            <td style="padding: 12px; font-family: monospace; font-weight: 600;">${receiptNo}</td>
            <td style="padding: 12px;">${tx.guest_name}</td>
            <td style="padding: 12px;">${label}</td>
            <td style="padding: 12px;">${timeFormatted}</td>
            <td style="padding: 12px;">
              <span class="badge ${tx.payment_method === 'UPI' ? 'badge-active' : (tx.payment_method === 'Cash' ? 'badge-warning' : 'badge-completed')}">
                ${tx.payment_method}
              </span>
            </td>
            <td style="padding: 12px; text-align: right; font-weight: 600; color: var(--text-main);">${amountFormatted}</td>
          `;
          tableBody.appendChild(row);
        });
      }
    }

    await loadFeedbackReports();
  } catch (err) {
    console.error('Error loading reports daily revenue stats:', err);
  }
}

async function loadFeedbackReports() {
  try {
    const res = await fetch(`${API_BASE}/api/feedback/summary`);
    const data = await res.json();
    if (!data.success) return;

    const stats = data.stats;
    
    // Set big overall score
    document.getElementById('feedback-widget-overall-number').innerText = stats.avgOverall.toFixed(1);
    
    // Set stars representation
    const roundedOverall = Math.round(stats.avgOverall);
    const starString = '★'.repeat(roundedOverall) + '☆'.repeat(5 - roundedOverall);
    document.getElementById('feedback-widget-overall-stars').innerText = starString;
    document.getElementById('feedback-widget-overall-count').innerText = `(${stats.totalCount} ratings)`;

    // Set category breakdown
    document.getElementById('feedback-lbl-food').innerText = `${stats.avgFood.toFixed(1)}/5`;
    document.getElementById('feedback-lbl-service').innerText = `${stats.avgService.toFixed(1)}/5`;
    document.getElementById('feedback-lbl-ambience').innerText = `${stats.avgAmbience.toFixed(1)}/5`;

    // Process star distribution (1 to 5 stars)
    const distributionMap = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (stats.distribution && Array.isArray(stats.distribution)) {
      stats.distribution.forEach(d => {
        distributionMap[d.overall_rating] = d.count;
      });
    }

    // Render CSS progress bars for star distribution
    const container = document.getElementById('feedback-distribution-container');
    if (container) {
      container.innerHTML = '';
      const totalCount = stats.totalCount || 1; // avoid divide by zero
      // Show from 5 stars down to 1 star
      for (let star = 5; star >= 1; star--) {
        const count = distributionMap[star] || 0;
        const percent = stats.totalCount > 0 ? ((count / stats.totalCount) * 100).toFixed(0) : 0;
        
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-bottom: 2px;';
        row.innerHTML = `
          <span style="width: 32px; font-size: 0.85rem; font-weight: 500; color: var(--text-muted);">${star} ★</span>
          <div style="flex: 1; height: 8px; background: rgba(255, 255, 255, 0.05); border-radius: 4px; overflow: hidden; border: 1px solid var(--border-glass);">
            <div style="width: ${percent}%; height: 100%; background: var(--primary); border-radius: 4px;"></div>
          </div>
          <span style="width: 30px; text-align: right; font-size: 0.85rem; color: var(--text-muted);">${count}</span>
        `;
        container.appendChild(row);
      }
    }

    // Load recent 5 comments with guest name and date
    const listRes = await fetch(`${API_BASE}/api/feedback`);
    const listData = await listRes.json();
    const commentListContainer = document.getElementById('feedback-recent-comments-list');
    commentListContainer.innerHTML = '';

    if (!listData.success || !listData.feedback || listData.feedback.length === 0) {
      commentListContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 0.9rem;">No feedback comments recorded yet.</div>';
      return;
    }

    // Filter feedback entries containing comments, limited to the 5 most recent
    const reviewsWithComments = listData.feedback
      .filter(f => f.comment && f.comment.trim() !== '')
      .slice(0, 5);

    if (reviewsWithComments.length === 0) {
      commentListContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 0.9rem;">No feedback comments recorded yet.</div>';
      return;
    }

    reviewsWithComments.forEach(f => {
      const dateVal = f.created_at ? new Date(f.created_at.replace(' ', 'T') + 'Z') : new Date();
      const dateStr = dateVal.toLocaleDateString();
      
      const commentItem = document.createElement('div');
      commentItem.style.cssText = 'background: rgba(13, 148, 136, 0.03); border: 1px solid var(--border-glass); padding: 12px; border-radius: var(--radius-md); font-size: 0.85rem; margin-bottom: 8px;';
      commentItem.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">
          <span>${f.guest_name}</span>
          <span style="font-weight: 400; font-size: 0.75rem; color: var(--text-muted);">${dateStr}</span>
        </div>
        <div style="color: #f59e0b; font-size: 0.8rem; margin-bottom: 6px;">
          ${'★'.repeat(f.overall_rating)}${'☆'.repeat(5 - f.overall_rating)}
        </div>
        <p style="color: var(--text-muted); margin: 0; line-height: 1.4; font-style: italic;">"${f.comment}"</p>
      `;
      commentListContainer.appendChild(commentItem);
    });

  } catch (err) {
    console.error('Error loading feedback report widget:', err);
  }
}

// ----------------------------------------------------
// Management Export Utilities
// ----------------------------------------------------
async function exportBookingsCSV() {
  try {
    const res = await fetch(`${API_BASE}/api/bookings?limit=1000`);
    const data = await res.json();
    
    if (!data.success || data.bookings.length === 0) {
      alert('No bookings data available to export.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Booking ID,Guest Name,Guest Type,Room Number,Table Number,Booking Date,Booking Time,Guest Count,Dietary Preference,Payment Status,Total Amount,Status\n';

    data.bookings.forEach(b => {
      const row = [
        b.id,
        `"${b.guest_name.replace(/"/g, '""')}"`,
        b.guest_type,
        b.room_number || '',
        b.table_number,
        b.booking_date,
        b.booking_time,
        b.guest_count,
        b.dietary_preference,
        (b.payment_status && b.payment_status.toLowerCase() === 'paid') ? 'Paid' : 'Pending',
        b.total_amount || 0.00,
        b.status
      ].join(',');
      csvContent += row + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Aura_Cafe_Bookings_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    alert(`CSV export failed: ${err.message}`);
  }
}

function printDetail() {
  document.body.classList.add('printing-receipt');
  setTimeout(() => {
    window.print();
  }, 50);
}

window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing-receipt');
});

function exportRevenueReport() {
  window.print();
}

async function loadSettlementHistory() {
  const tableBody = document.getElementById('billing-history-table-body');
  if (!tableBody) return;
  
  // Reset stats to zero while loading
  document.getElementById('history-stat-revenue').innerText = '₹0.00';
  document.getElementById('history-stat-transactions').innerText = '0';
  document.getElementById('history-stat-cash').innerText = '0';
  document.getElementById('history-stat-card').innerText = '0';
  document.getElementById('history-stat-upi').innerText = '0';

  tableBody.innerHTML = `
    <tr>
      <td colspan="10" style="text-align:center; padding:40px;">
        <div class="loading-spinner"></div>
      </td>
    </tr>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/payments/history`);
    const data = await res.json();
    
    tableBody.innerHTML = '';

    if (data.success && data.todayStats) {
      document.getElementById('history-stat-revenue').innerText = `₹${(data.todayStats.revenue || 0).toFixed(2)}`;
      document.getElementById('history-stat-transactions').innerText = data.todayStats.transactions || 0;
      document.getElementById('history-stat-cash').innerText = data.todayStats.cash || 0;
      document.getElementById('history-stat-card').innerText = data.todayStats.card || 0;
      document.getElementById('history-stat-upi').innerText = data.todayStats.upi || 0;
    }
    
    if (!data.success || !data.history || data.history.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; padding:40px; color:var(--text-muted);">
            No settlement history found.
          </td>
        </tr>
      `;
      return;
    }
    
    data.history.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'clickable-history-row';
      tr.onclick = () => viewBookingDetails(item.booking_id);
      
      const sessionStr = item.table_number 
        ? `Table ${item.table_number}${item.room_number ? ` (Room ${item.room_number})` : ''}` 
        : `Room ${item.room_number || '-'} Service`;
        
      const discountVal = item.discount || 0;
      const discountStr = discountVal > 0 ? `-₹${discountVal.toFixed(2)}` : '₹0.00';
      
      const year = item.booking_date ? item.booking_date.split('-')[0] : '2026';
      const seq = String(item.receipt_sequence || item.payment_id).padStart(3, '0');
      const receiptNo = `RCPT-${year}-${seq}`;
      
      tr.innerHTML = `
        <td style="font-weight:600; color:var(--text-muted); font-size:0.85rem;">${receiptNo}</td>
        <td style="font-weight:600; color:var(--primary);">${item.guest_name}</td>
        <td>${sessionStr}</td>
        <td>${item.booking_date} @ ${formatTime12H(item.booking_time)}</td>
        <td>₹${(item.subtotal || 0).toFixed(2)}</td>
        <td>${discountStr}</td>
        <td>₹${(item.tax || 0).toFixed(2)}</td>
        <td style="font-weight:600; color:var(--primary);">₹${(item.total_amount || 0).toFixed(2)}</td>
        <td>${item.payment_method}</td>
        <td><span class="badge badge-paid">Paid</span></td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error loading settlement history:', err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center; padding:40px; color:var(--danger); font-weight:600;">
          Error loading settlement history.
        </td>
      </tr>
    `;
  }
}

async function toggleItemAvailability(itemId, newStatus) {
  try {
    const res = await fetch(`${API_BASE}/api/menu/${itemId}/availability`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_available: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      await loadMenu();
      if (currentScreen === 'order-entry') {
        updateOrderEntryConsole();
      }
    } else {
      alert('Failed to update availability: ' + data.message);
    }
  } catch (err) {
    console.error(err);
    alert('Error updating availability: ' + err.message);
  }
}

function printKitchenToken(tableName, guestName, items) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print Kitchen Order Tickets (KOT).');
    return;
  }

  // Helper inside function to get print category
  function getKOTPrintCategory(cat) {
    const c = cat.toLowerCase().trim();
    if (c.includes('starter')) return 'STARTERS';
    if (c.includes('burger')) return 'BURGERS';
    if (c.includes('fried veg') || c.includes('fried items') || c.includes('fried veg items')) return 'FRIED ITEMS';
    if (c.includes('egg')) return 'EGG ITEMS';
    if (c.includes('juice') || c.includes('shake') || c.includes('beverage') || c.includes('drink') || c.includes('cool drinks')) return 'COOL DRINKS';
    if (c.includes('biryani') || c.includes('biriyani')) return 'BIRYANI';
    if (c.includes('rice')) return 'FRIED RICE';
    if (c.includes('noodle')) return 'NOODLES';
    if (c.includes('momo')) return 'MOMOS';
    if (c.includes('maggi') || c.includes('maggie')) return 'MAGGI';
    return cat.toUpperCase();
  }

  // Group active orders by print category
  const grouped = {};
  items.forEach(o => {
    const pCat = getKOTPrintCategory(o.category);
    if (!grouped[pCat]) {
      grouped[pCat] = [];
    }
    grouped[pCat].push(o);
  });

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB');
  const timeStr = today.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const categoriesHTML = Object.keys(grouped).map((catName, index, arr) => {
    const catItems = grouped[catName];
    const itemsRows = catItems.map(o => `
      <tr>
        <td style="padding: 6px 0; font-size: 1.15rem; font-weight: bold; border-bottom: 1px dotted #ccc;">${o.item_name}</td>
        <td style="text-align: center; padding: 6px 0; font-size: 1.35rem; font-weight: bold; border-bottom: 1px dotted #ccc;">${o.quantity}</td>
      </tr>
    `).join('');

    // Add page break styles: page-break-after: always for all but the last page
    const pageBreakStyle = index < arr.length - 1 ? 'page-break-after: always; break-after: page;' : '';

    return `
      <div class="kot-page" style="${pageBreakStyle} padding: 10px; max-width: 300px; margin: 0 auto; color: #000;">
        <div class="title">KITCHEN TOKEN (KOT)</div>
        
        <div style="text-align: center; font-size: 1.25rem; font-weight: 800; background: #000; color: #fff; padding: 4px; margin-bottom: 12px; letter-spacing: 1px; text-transform: uppercase;">
          ${catName}
        </div>

        <div class="meta">
          <div class="meta-row">
            <span><strong>Table/Room:</strong></span>
            <span><strong>${tableName}</strong></span>
          </div>
          <div class="meta-row">
            <span>Guest:</span>
            <span>${guestName || 'Walk-in'}</span>
          </div>
          <div class="meta-row">
            <span>Date:</span>
            <span>${dateStr} @ ${timeStr}</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="border-bottom: 1px dashed #000; padding: 4px 0; text-align: left; font-size: 1rem;">Item</th>
              <th style="border-bottom: 1px dashed #000; padding: 4px 0; text-align: center; width: 60px; font-size: 1rem;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
        
        <div style="border-top: 2px dashed #000; margin-top: 20px; padding-top: 8px; text-align: center; font-size: 0.8rem; font-weight: bold;">
          Aura Cafe Kitchen - KOT Station Copy
        </div>
      </div>
    `;
  }).join('');

  printWindow.document.write(`
    <html>
      <head>
        <title>KOT - ${tableName}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            margin: 0;
            padding: 0;
          }
          .title {
            text-align: center;
            font-size: 1.3rem;
            font-weight: bold;
            border-bottom: 2px dashed #000;
            padding-bottom: 6px;
            margin-bottom: 10px;
          }
          .meta {
            font-size: 0.9rem;
            margin-bottom: 10px;
            border-bottom: 1px dashed #000;
            padding-bottom: 6px;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 3px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          @media print {
            .kot-page {
              border: none;
            }
          }
        </style>
      </head>
      <body>
        ${categoriesHTML}
        <script>
          window.onload = function() {
            window.print();
            window.close();
          }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
