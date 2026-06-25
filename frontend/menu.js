// menu.js - Client Side Scripting for Digital Dining Menu
const API_BASE = window.location.origin;

let tableNum = null;
let roomNum = null;
let diningType = 'table'; // 'table' or 'room'
let activeBooking = null; // Stores { id, guest_name, dietary_preference, guest_type }
let menuItemsList = [];
let cart = {}; // Stores { "Item Name": { price, quantity, category, dietary_tags } }
let selectedCategory = 'All';
let searchQuery = '';
let dietFilter = 'ALL';
let maxPriceLimit = 500;
let sortBy = 'name-asc';

// Initialize Digital Menu
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  parseTableNumber();
  await loadMenuCatalog();
  initAdvancedFilters();
  initCartEventListeners();
  initTrackerEventListeners();
});

// Theme Manager
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const themeToggleIcon = document.getElementById('theme-toggle-icon');
  
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);
  
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  });
  
  function setTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
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
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
      themeToggleIcon.innerHTML = `
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      `;
    }
  }
}

// Table Number & Room Number Resolver & Verification
function parseTableNumber() {
  const urlParams = new URLSearchParams(window.location.search);
  const tableParam = urlParams.get('table');
  const roomParam = urlParams.get('room');
  
  if (roomParam) {
    lockRoom(roomParam.trim());
  } else {
    const parsedTable = parseInt(tableParam, 10);
    if (parsedTable && !isNaN(parsedTable) && parsedTable >= 1 && parsedTable <= 10) {
      lockTable(parsedTable);
    } else {
      openSelectionModal();
    }
  }
}

function openSelectionModal() {
  const modal = document.getElementById('table-selection-modal');
  modal.classList.add('active');
  
  const typeDineinBtn = document.getElementById('menu-type-dinein');
  const typeRoomBtn = document.getElementById('menu-type-room');
  const dineinContainer = document.getElementById('menu-dinein-container');
  const roomContainer = document.getElementById('menu-room-container');
  
  const tableBtns = document.querySelectorAll('.table-btn');
  const roomInput = document.getElementById('menu-room-input');
  const confirmBtn = document.getElementById('btn-confirm-table');
  
  let selectedTable = null;
  let selectedRoom = null;
  let currentSelectionType = 'table';
  
  typeDineinBtn.addEventListener('click', () => {
    currentSelectionType = 'table';
    typeDineinBtn.style.background = 'var(--primary)';
    typeDineinBtn.style.color = 'white';
    typeRoomBtn.style.background = 'transparent';
    typeRoomBtn.style.color = 'var(--text-main)';
    typeRoomBtn.style.border = '1px solid var(--border-glass)';
    
    dineinContainer.style.display = 'block';
    roomContainer.style.display = 'none';
    
    if (selectedTable) {
      confirmBtn.removeAttribute('disabled');
    } else {
      confirmBtn.setAttribute('disabled', 'true');
    }
  });
  
  typeRoomBtn.addEventListener('click', () => {
    currentSelectionType = 'room';
    typeRoomBtn.style.background = 'var(--primary)';
    typeRoomBtn.style.color = 'white';
    typeDineinBtn.style.background = 'transparent';
    typeDineinBtn.style.color = 'var(--text-main)';
    typeDineinBtn.style.border = '1px solid var(--border-glass)';
    
    dineinContainer.style.display = 'none';
    roomContainer.style.display = 'block';
    
    if (roomInput.value.trim()) {
      confirmBtn.removeAttribute('disabled');
    } else {
      confirmBtn.setAttribute('disabled', 'true');
    }
  });
  
  tableBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tableBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTable = parseInt(btn.getAttribute('data-table'), 10);
      if (currentSelectionType === 'table') {
        confirmBtn.removeAttribute('disabled');
      }
    });
  });
  
  roomInput.addEventListener('input', () => {
    selectedRoom = roomInput.value.trim() || null;
    if (currentSelectionType === 'room' && selectedRoom) {
      confirmBtn.removeAttribute('disabled');
    } else if (currentSelectionType === 'room') {
      confirmBtn.setAttribute('disabled', 'true');
    }
  });
  
  confirmBtn.addEventListener('click', () => {
    if (currentSelectionType === 'table' && selectedTable) {
      modal.classList.remove('active');
      lockTable(selectedTable);
    } else if (currentSelectionType === 'room' && selectedRoom) {
      modal.classList.remove('active');
      lockRoom(selectedRoom);
    }
  });
}

async function lockTable(number) {
  diningType = 'table';
  tableNum = number;
  roomNum = null;
  document.getElementById('display-table-num').innerText = `Table ${tableNum}`;
  
  // Try fetching active guest booking details
  await fetchActiveBooking();
  
  // Set up live status polling loop (every 10s)
  pollLiveOrderStatus();
  setInterval(pollLiveOrderStatus, 10000);
}

async function lockRoom(roomStr) {
  diningType = 'room';
  roomNum = roomStr;
  tableNum = null;
  document.getElementById('display-table-num').innerText = `Room ${roomNum}`;
  
  // Try fetching active guest booking details
  await fetchActiveBooking();
  
  // Set up live status polling loop (every 10s)
  pollLiveOrderStatus();
  setInterval(pollLiveOrderStatus, 10000);
}

async function fetchActiveBooking() {
  try {
    const url = diningType === 'table'
      ? `${API_BASE}/api/public/active-booking?table=${tableNum}`
      : `${API_BASE}/api/public/active-booking?room=${roomNum}`;
      
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.success && data.booking) {
      activeBooking = data.booking;
      
      // Personalize greeting
      document.getElementById('guest-greeting').innerText = `Welcome, ${activeBooking.guest_name}!`;
      document.getElementById('guest-dietary-desc').innerText = 
        `Dietary Preference: ${activeBooking.dietary_preference || 'None'}`;
      
      // Update dietary banner alert
      const banner = document.getElementById('dietary-alert-banner');
      const bannerMsg = document.getElementById('dietary-alert-message');
      
      if (activeBooking.dietary_preference && activeBooking.dietary_preference !== 'None') {
        banner.style.display = 'flex';
        bannerMsg.innerText = `Booking alert: Items conflicting with your '${activeBooking.dietary_preference}' preference will be highlighted in red.`;
      } else {
        banner.style.display = 'none';
      }
    } else {
      activeBooking = null;
      if (diningType === 'table') {
        document.getElementById('guest-greeting').innerText = `Welcome to Aura Dining (Table ${tableNum})`;
      } else {
        document.getElementById('guest-greeting').innerText = `Welcome to Aura Room Service (Room ${roomNum})`;
      }
      document.getElementById('guest-dietary-desc').innerText = `Select your dishes to place orders directly.`;
      document.getElementById('dietary-alert-banner').style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to retrieve active booking:', err);
  }
}

// Menu loading & rendering
async function loadMenuCatalog() {
  try {
    const res = await fetch(`${API_BASE}/api/public/menu`);
    menuItemsList = await res.json();
    
    // Dynamically adjust slider range to fit the highest price item in database
    if (menuItemsList && menuItemsList.length > 0) {
      const highestPrice = Math.max(...menuItemsList.map(item => item.price));
      const roundedMax = Math.ceil(highestPrice / 50) * 50; // round up to nearest 50
      const priceSlider = document.getElementById('menu-price-slider');
      const maxPriceDisplay = document.getElementById('max-price-display');
      if (priceSlider) {
        priceSlider.max = roundedMax;
        priceSlider.value = roundedMax;
        maxPriceLimit = roundedMax;
      }
      if (maxPriceDisplay) {
        maxPriceDisplay.innerText = `₹${roundedMax}`;
      }
    }
    
    renderCategoryTabs();
    renderMenu();
  } catch (err) {
    console.error('Failed to load menu catalog:', err);
  }
}

function renderCategoryTabs() {
  const container = document.getElementById('category-tabs-container');
  if (!container) return;

  const categories = [];
  const definedCategories = [
    'Veg Burgers',
    'Non-Veg Burgers',
    'Egg Items',
    'Fried Veg',
    'Veg Starters',
    'Non-Veg Starters',
    'Biryani',
    'Fried Rice',
    'Momos',
    'Noodles',
    'Maggi',
    'Milkshakes',
    'Fresh Fruit Juices',
    'Desserts',
    'Soups'
  ];

  // Only display categories that actually contain items
  definedCategories.forEach(cat => {
    if (menuItemsList.some(item => item.category === cat)) {
      categories.push(cat);
    }
  });

  // Dynamically append any extra categories from database
  menuItemsList.forEach(item => {
    if (item.category && !categories.includes(item.category)) {
      categories.push(item.category);
    }
  });

  let tabsHTML = `<div class="category-tab ${selectedCategory === 'All' ? 'active' : ''}" data-category="All">All Items</div>`;
  categories.forEach(cat => {
    tabsHTML += `<div class="category-tab ${selectedCategory === cat ? 'active' : ''}" data-category="${cat}">${cat}</div>`;
  });

  container.innerHTML = tabsHTML;
  initCategoryFilters();
}

function initCategoryFilters() {
  const tabs = document.querySelectorAll('.category-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedCategory = tab.getAttribute('data-category');
      renderMenu();
    });
  });
}

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
      name.includes('peddamma') ||
      cat.includes('non-veg') || 
      cat.includes('non veg')) {
    return false;
  }
  return true;
}

function initAdvancedFilters() {
  const searchInput = document.getElementById('menu-search-input');
  const dietButtons = document.querySelectorAll('.dietary-filter-group .filter-btn');
  const priceSlider = document.getElementById('menu-price-slider');
  const maxPriceDisplay = document.getElementById('max-price-display');
  const sortSelect = document.getElementById('menu-sort-select');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderMenu();
    });
  }

  dietButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      dietButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dietFilter = btn.getAttribute('data-diet');
      renderMenu();
    });
  });

  if (priceSlider) {
    priceSlider.addEventListener('input', (e) => {
      maxPriceLimit = parseFloat(e.target.value);
      if (maxPriceDisplay) {
        maxPriceDisplay.innerText = `₹${maxPriceLimit}`;
      }
      renderMenu();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      sortBy = e.target.value;
      renderMenu();
    });
  }
}

function createMenuItemCard(item) {
  const isWarning = isDietaryConflict(item);
  const card = document.createElement('div');
  card.className = 'menu-item-card';
  
  if (isWarning) {
    card.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    card.style.background = 'rgba(239, 68, 68, 0.02)';
  }
  
  const isAvailable = item.is_available !== 0;
  if (!isAvailable) {
    card.style.opacity = '0.6';
  }
  
  // Choose image path
  let imgPath = item.image_url || 'images/appetizer.png';
  if (!item.image_url) {
    if (item.category === 'Main Course (Veg)' || item.category === 'Main Course (Non-Veg)') {
      imgPath = 'images/main_course.png';
    } else if (item.category === 'Desserts') {
      imgPath = 'images/dessert.png';
    }
  }
  
  const isVeg = isVegItem(item);
  const cartItem = cart[item.name];
  const qty = cartItem ? cartItem.quantity : 0;
  
  // Short description placeholder since description isn't a separate DB field
  const shortDesc = isVeg 
    ? `Curated vegetarian choice prepared with fresh local ingredients at Aura Cafe.`
    : `Spicy, delicious non-vegetarian preparation, seasoned with gourmet spices.`;

  card.innerHTML = `
    <div class="menu-item-img-box">
      <!-- Veg/Non-Veg Floating badge on top left of image -->
      <span class="card-badge-left">
        <span class="dot-icon ${isVeg ? 'veg-dot' : 'nonveg-dot'}"></span>
        ${isVeg ? 'Veg' : 'Non-Veg'}
      </span>
      
      <!-- Category Banner on top right of image -->
      <span class="card-badge-right ${isVeg ? 'veg-cat' : ''}">${item.category}</span>
      
      <img src="${imgPath}" alt="${item.name}">
    </div>
    
    <div class="menu-item-info">
      <div>
        <div class="menu-item-title-row">
          <span class="menu-item-name">${item.name}</span>
          <div class="menu-item-desc">${shortDesc}</div>
        </div>
      </div>
      
      <div class="menu-item-bottom-row">
        <span class="menu-item-price">₹${item.price.toFixed(2)}</span>
        
        <div class="add-btn-box">
          ${isWarning ? `<div class="dietary-alert-text" style="font-size:0.65rem; color:var(--danger); margin-bottom:4px; font-weight:600;">⚠ Dietary Warning</div>` : ''}
          ${!isAvailable ? `
            <button class="btn-add" disabled style="background:rgba(239, 68, 68, 0.12) !important; border-color:rgba(239, 68, 68, 0.3) !important; color:var(--danger) !important; cursor:not-allowed;">Out of Stock</button>
          ` : qty > 0 ? `
            <div class="qty-controls">
              <button class="btn-qty" onclick="changeQuantity('${item.name.replace(/'/g, "\\'")}', -1)">-</button>
              <span class="qty-val">${qty}</span>
              <button class="btn-qty" onclick="changeQuantity('${item.name.replace(/'/g, "\\'")}', 1)">+</button>
            </div>
          ` : `
            <button class="btn-add" onclick="changeQuantity('${item.name.replace(/'/g, "\\'")}', 1)">Add to Cart</button>
          `}
        </div>
      </div>
    </div>
  `;
  return card;
}

function renderMenu() {
  const container = document.getElementById('menu-grid-container');
  container.innerHTML = '';
  
  // 1. Filter the menu items list based on all active controls
  let filteredItems = menuItemsList.filter(item => {
    // Category bubble filter
    if (selectedCategory !== 'All' && item.category !== selectedCategory) {
      return false;
    }
    // Search query filter
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery)) {
      return false;
    }
    // Veg/Non-Veg filter
    const isVeg = isVegItem(item);
    if (dietFilter === 'VEG' && !isVeg) return false;
    if (dietFilter === 'NON-VEG' && isVeg) return false;
    // Price range slider filter
    if (item.price > maxPriceLimit) return false;
    
    return true;
  });

  // 2. Sort the filtered menu items list
  filteredItems.sort((a, b) => {
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    } else if (sortBy === 'name-desc') {
      return b.name.localeCompare(a.name);
    } else if (sortBy === 'price-asc') {
      return a.price - b.price;
    } else if (sortBy === 'price-desc') {
      return b.price - a.price;
    }
    return 0;
  });

  // 3. Render the filtered and sorted list
  if (selectedCategory === 'All') {
    const categoriesOrder = [
      'Veg Burgers',
      'Non-Veg Burgers',
      'Egg Items',
      'Fried Veg',
      'Veg Starters',
      'Non-Veg Starters',
      'Biryani',
      'Fried Rice',
      'Momos',
      'Noodles',
      'Maggi',
      'Milkshakes',
      'Fresh Fruit Juices',
      'Desserts',
      'Soups'
    ];
    
    // Dynamically append any other category present in filteredItems
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
        
        // Render category header
        const header = document.createElement('h2');
        header.className = 'category-section-heading';
        header.innerText = cat;
        header.style.fontSize = '1.35rem';
        header.style.fontWeight = '700';
        header.style.color = 'var(--primary)';
        header.style.borderBottom = '2px solid var(--border-glass)';
        header.style.paddingBottom = '8px';
        header.style.marginTop = '24px';
        header.style.marginBottom = '16px';
        header.style.gridColumn = '1 / -1';
        container.appendChild(header);
        
        // Render cards
        catItems.forEach(item => {
          const card = createMenuItemCard(item);
          container.appendChild(card);
        });
      }
    });
    
    if (!hasAnyItems) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1;">
          No dishes available.
        </div>
      `;
    }
  } else {
    // If a specific category bubble is selected, just render all filtered cards directly
    if (filteredItems.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1;">
          No dishes available in this category.
        </div>
      `;
      return;
    }
    
    filteredItems.forEach(item => {
      const card = createMenuItemCard(item);
      container.appendChild(card);
    });
  }
}

function isDietaryConflict(menuItem) {
  if (!activeBooking || !activeBooking.dietary_preference || activeBooking.dietary_preference === 'None') {
    return false;
  }
  
  const pref = activeBooking.dietary_preference.toLowerCase();
  const tags = menuItem.dietary_tags.split(',').map(t => t.trim().toLowerCase());
  return !tags.includes(pref);
}

// Cart Management Logic
window.changeQuantity = function(itemName, change) {
  const item = menuItemsList.find(m => m.name === itemName);
  if (!item) return;
  
  const isAvailable = item.is_available !== 0;
  if (change > 0 && !isAvailable) {
    alert('This item is currently out of stock.');
    return;
  }
  
  if (!cart[itemName]) {
    if (change > 0) {
      cart[itemName] = {
        price: item.price,
        quantity: change,
        category: item.category,
        dietary_tags: item.dietary_tags
      };
    }
  } else {
    cart[itemName].quantity += change;
    if (cart[itemName].quantity <= 0) {
      delete cart[itemName];
    }
  }
  
  renderMenu();
  updateCartUI();
};

function updateCartUI() {
  const floatingBar = document.getElementById('floating-cart-bar');
  const countBadge = document.getElementById('cart-item-count');
  const totalLabel = document.getElementById('cart-bar-total');
  
  let totalItems = 0;
  let subtotal = 0;
  
  Object.values(cart).forEach(item => {
    totalItems += item.quantity;
    subtotal += item.price * item.quantity;
  });
  
  if (totalItems > 0) {
    floatingBar.style.display = 'flex';
    countBadge.innerText = totalItems;
    totalLabel.innerText = `₹${subtotal.toFixed(2)}`;
  } else {
    floatingBar.style.display = 'none';
  }
  
  // Render cart items inside the drawer
  const itemsContainer = document.getElementById('cart-items-body');
  itemsContainer.innerHTML = '';
  
  if (totalItems === 0) {
    itemsContainer.innerHTML = `
      <div class="cart-empty-state">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        <p>Your cart is empty.</p>
        <p style="font-size:0.8rem;margin-top:6px;">Add dishes from the menu to get started.</p>
      </div>
    `;
    return;
  }
  
  Object.entries(cart).forEach(([name, cItem]) => {
    const itemRow = document.createElement('div');
    itemRow.className = 'cart-item';
    itemRow.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name">${name}</span>
        <span class="cart-item-price">₹${(cItem.price * cItem.quantity).toFixed(2)}</span>
      </div>
      <div class="qty-controls">
        <button class="btn-qty" onclick="changeQuantity('${name.replace(/'/g, "\\'")}', -1)">-</button>
        <span class="qty-val">${cItem.quantity}</span>
        <button class="btn-qty" onclick="changeQuantity('${name.replace(/'/g, "\\'")}', 1)">+</button>
      </div>
    `;
    itemsContainer.appendChild(itemRow);
  });
  
  // Compute totals for drawer footer
  // Apply 10% discount if the reservation guest type is hotel guest
  let discount = 0;
  const isHotelGuest = activeBooking && activeBooking.guest_type === 'Hotel Guest';
  if (isHotelGuest) {
    discount = subtotal * 0.10;
  }
  
  const taxable = subtotal - discount;
  const tax = taxable * 0.05; // 5% GST
  const grandTotal = taxable + tax;
  
  document.getElementById('cart-subtotal').innerText = `₹${subtotal.toFixed(2)}`;
  
  const discountRow = document.getElementById('cart-discount-row');
  if (discount > 0) {
    discountRow.style.display = 'flex';
    document.getElementById('cart-discount').innerText = `-₹${discount.toFixed(2)}`;
  } else {
    discountRow.style.display = 'none';
  }
  
  document.getElementById('cart-tax').innerText = `₹${tax.toFixed(2)}`;
  document.getElementById('cart-total').innerText = `₹${grandTotal.toFixed(2)}`;
}

function initCartEventListeners() {
  const drawer = document.getElementById('cart-drawer-modal');
  const floatingBar = document.getElementById('floating-cart-bar');
  const closeBtn = document.getElementById('btn-close-cart');
  const submitBtn = document.getElementById('btn-submit-order');
  const successModal = document.getElementById('order-success-modal');
  const closeSuccessBtn = document.getElementById('btn-close-success');
  
  floatingBar.addEventListener('click', () => {
    drawer.classList.add('open');
  });
  
  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('open');
  });
  
  closeSuccessBtn.addEventListener('click', () => {
    successModal.classList.remove('active');
  });
  
  submitBtn.addEventListener('click', async () => {
    if (Object.keys(cart).length === 0) return;
    
    submitBtn.innerText = 'Submitting order...';
    submitBtn.disabled = true;
    
    // Construct payload
    const itemsPayload = Object.entries(cart).map(([name, cItem]) => ({
      item_name: name,
      quantity: cItem.quantity
    }));
    
    const payload = diningType === 'table'
      ? { table_number: tableNum, items: itemsPayload }
      : { room_number: roomNum, items: itemsPayload };
      
    try {
      const res = await fetch(`${API_BASE}/api/public/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      submitBtn.innerText = 'Send Order to Kitchen';
      submitBtn.disabled = false;
      
      if (res.ok) {
        // Clear cart
        cart = {};
        updateCartUI();
        renderMenu();
        
        drawer.classList.remove('open');
        successModal.classList.add('active');
        
        // Refresh active booking greets (in case a walk-in booking was auto-created)
        await fetchActiveBooking();
        
        // Refresh order status list
        await pollLiveOrderStatus();
      } else {
        alert(`Failed to place order: ${result.message}`);
      }
    } catch (err) {
      submitBtn.innerText = 'Send Order to Kitchen';
      submitBtn.disabled = false;
      alert(`Network error submitting order: ${err.message}`);
    }
  });
}

// Live status tracker functionality
function initTrackerEventListeners() {
  const trackerDrawer = document.getElementById('tracker-drawer-modal');
  const openTrackerBtn = document.getElementById('btn-open-tracker');
  const closeTrackerBtn = document.getElementById('btn-close-tracker');
  
  openTrackerBtn.addEventListener('click', async () => {
    trackerDrawer.classList.add('open');
    await pollLiveOrderStatus();
  });
  
  closeTrackerBtn.addEventListener('click', () => {
    trackerDrawer.classList.remove('open');
  });
}

async function pollLiveOrderStatus() {
  if (diningType === 'table' && !tableNum) return;
  if (diningType === 'room' && !roomNum) return;
  
  try {
    const url = diningType === 'table'
      ? `${API_BASE}/api/public/orders?table=${tableNum}`
      : `${API_BASE}/api/public/orders?room=${roomNum}`;
      
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.success) {
      renderTrackerList(data.orders);
    }
  } catch (err) {
    console.error('Failed to poll live order statuses:', err);
  }
}

function renderTrackerList(orders) {
  const container = document.getElementById('tracker-items-body');
  container.innerHTML = '';
  
  if (orders.length === 0) {
    container.innerHTML = `
      <div class="cart-empty-state" style="margin-top:40px;">
        📋
        <p style="margin-top:12px;">No items ordered yet.</p>
        <p style="font-size:0.8rem;margin-top:4px;">Dishes you order will appear here with live preparation statuses.</p>
      </div>
    `;
    return;
  }
  
  // Sort orders by id descending (most recent first)
  const sorted = [...orders].reverse();
  
  sorted.forEach(o => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'cart-item';
    
    let badgeClass = 'status-pending';
    if (o.status === 'Served') badgeClass = 'status-served';
    if (o.status === 'Cancelled') badgeClass = 'status-cancelled';
    
    itemDiv.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name" style="${o.status === 'Cancelled' ? 'text-decoration:line-through;opacity:0.5;' : ''}">${o.item_name}</span>
        <span class="cart-item-price" style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;margin-top:2px;">Qty: ${o.quantity} • Subtotal: ₹${(o.price * o.quantity).toFixed(2)}</span>
      </div>
      <div>
        <span class="badge-status ${badgeClass}">${o.status}</span>
      </div>
    `;
    container.appendChild(itemDiv);
  });
}
