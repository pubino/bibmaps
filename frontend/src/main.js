import { api } from './services/api.js';
import { BibMapCanvas } from './components/BibMapCanvas.js';
import JSZip from 'jszip';
import {
  buildBibmapJson,
  getLinkedReferences,
  buildBibtexContent,
  buildTagMappings,
  generateFilename
} from './services/bibmapExport.js';

// State
let currentSection = 'bibmaps';
let bibmapCanvas = null;
let currentBibmap = null;
let taxonomies = [];
let editingTaxonomyId = null;
let editingBibmapId = null;
let currentReferenceId = null;
let currentNodeId = null;
let currentConnectionId = null;
let refSelectedTags = [];
let importSelectedTags = [];
let nodeSelectedTags = [];

// References pagination and filter state
let allReferences = [];
let filteredReferences = [];
let refsCurrentPage = 1;
let refsPageSize = 20;
let refsTitleFilter = '';
let refsTaxonomyFilter = '';
let refsSortBy = 'imported-desc';

// Taxonomies filter/sort state
let allTaxonomies = [];
let filteredTaxonomies = [];
let taxNameFilter = '';
let taxSortBy = 'created-desc';

// Media pagination and filter state
let allMedia = [];
let filteredMedia = [];
let mediaCurrentPage = 1;
let mediaPageSize = 20;
let mediaTitleFilter = '';
let mediaTaxonomyFilter = '';
let mediaSortBy = 'created-desc';
let currentMediaId = null;
let editingMediaId = null;
let mediaSelectedTags = [];

// Confirmation modal resolver
let confirmResolver = null;

// Current user state
let currentUser = null;

// DOM Elements
const sections = {
  bibmaps: document.getElementById('bibmaps-section'),
  editor: document.getElementById('editor-section'),
  references: document.getElementById('references-section'),
  media: document.getElementById('media-section'),
  taxonomies: document.getElementById('taxonomies-section'),
  nodeRefs: document.getElementById('node-refs-section'),
  settings: document.getElementById('settings-section'),
  admin: document.getElementById('admin-section'),
  about: document.getElementById('about-section')
};

const navButtons = {
  bibmaps: document.getElementById('nav-bibmaps'),
  references: document.getElementById('nav-references'),
  media: document.getElementById('nav-media'),
  taxonomies: document.getElementById('nav-taxonomies'),
  settings: document.getElementById('nav-settings'),
  admin: document.getElementById('nav-admin'),
  about: document.getElementById('nav-about')
};

const announcer = document.getElementById('announcer');

// Utility functions
function announce(message) {
  announcer.textContent = message;
  setTimeout(() => { announcer.textContent = ''; }, 1000);
}

function showSection(sectionId) {
  Object.values(sections).forEach(s => {
    s.hidden = true;
    s.classList.remove('active');
  });

  if (sections[sectionId]) {
    sections[sectionId].hidden = false;
    sections[sectionId].classList.add('active');
  }

  Object.entries(navButtons).forEach(([key, btn]) => {
    btn.classList.toggle('active', key === sectionId);
    btn.setAttribute('aria-pressed', key === sectionId);
  });

  currentSection = sectionId;
}

function openModal(modalId) {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById(modalId);
  overlay.hidden = false;
  modal.showModal();
  modal.querySelector('input, textarea, button')?.focus();
}

function closeAllModals() {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = true;
  document.querySelectorAll('.modal').forEach(m => m.close());
  // Reject any pending confirmation
  if (confirmResolver) {
    confirmResolver(false);
    confirmResolver = null;
  }
}

// Alias for consistency
const closeModal = closeAllModals;

function showConfirm(message, title = 'Confirm', actionLabel = 'Delete') {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-yes').textContent = actionLabel;
    openModal('confirm-modal');
  });
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString();
}

// Load user info
async function loadUserInfo() {
  try {
    const user = await api.user();
    currentUser = user.authenticated ? user : null;
    updateAuthUI();
  } catch (err) {
    console.error('Failed to load user:', err);
    currentUser = null;
    updateAuthUI();
  }
}

// Update UI based on auth state
function updateAuthUI() {
  const userInfo = document.getElementById('user-info');
  const authToggleBtn = document.getElementById('auth-toggle-btn');
  const registerBtn = document.getElementById('register-btn');
  const profileBtn = document.getElementById('profile-btn');
  const adminNav = document.getElementById('nav-admin');
  const settingsNav = document.getElementById('nav-settings');

  if (currentUser) {
    userInfo.textContent = `Signed in as ${currentUser.user_name || currentUser.username || 'User'}`;
    authToggleBtn.textContent = 'Logout';
    authToggleBtn.classList.remove('btn-secondary');
    authToggleBtn.classList.add('btn-primary');
    // Hide Register when logged in - Login/Logout is a toggle
    registerBtn.hidden = true;
    profileBtn.hidden = false;
    settingsNav.hidden = false;

    // Show admin nav if user is admin
    if (currentUser.is_admin) {
      adminNav.hidden = false;
    } else {
      adminNav.hidden = true;
    }
  } else {
    userInfo.textContent = 'Not signed in (local mode)';
    authToggleBtn.textContent = 'Login';
    authToggleBtn.classList.remove('btn-primary');
    authToggleBtn.classList.add('btn-secondary');
    // Keep Register hidden - users access registration through the Login modal
    // This makes Login/Logout a true toggle button
    registerBtn.hidden = true;
    profileBtn.hidden = true;
    adminNav.hidden = true;
    settingsNav.hidden = true;
  }
}

// Google OAuth state
let googleOAuthEnabled = false;

// Check if Google OAuth is available
async function checkGoogleOAuth() {
  try {
    const result = await api.auth.googleEnabled();
    googleOAuthEnabled = result.enabled;
    // Show/hide Google OAuth buttons
    document.getElementById('login-google-section').hidden = !googleOAuthEnabled;
    document.getElementById('register-google-section').hidden = !googleOAuthEnabled;
  } catch (err) {
    console.log('Google OAuth not available');
    googleOAuthEnabled = false;
  }
}

// Handle OAuth errors from URL params
function handleOAuthErrors() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error) {
    let message = 'Login failed';
    switch (error) {
      case 'google_oauth_error':
        message = params.get('message') || 'Google authentication failed';
        break;
      case 'invalid_state':
        message = 'Session expired. Please try again.';
        break;
      case 'account_disabled':
        message = 'Your account has been disabled.';
        break;
      case 'token_exchange_failed':
        message = 'Failed to verify with Google. Please try again.';
        break;
      default:
        message = 'Authentication failed. Please try again.';
    }
    announce(message);
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Auth modal functions
function showLoginModal() {
  document.getElementById('login-error').hidden = true;
  document.getElementById('login-form').reset();
  openModal('login-modal');
}

function showRegisterModal() {
  document.getElementById('register-error').hidden = true;
  document.getElementById('register-form').reset();
  openModal('register-modal');
}

function showProfileModal() {
  if (!currentUser) return;
  document.getElementById('profile-error').hidden = true;
  document.getElementById('password-error').hidden = true;
  document.getElementById('profile-email').value = currentUser.email || '';
  document.getElementById('profile-display-name').value = currentUser.user_name || '';
  document.getElementById('profile-username').textContent = currentUser.username || '';
  document.getElementById('profile-role').textContent = currentUser.role === 'admin' ? 'Administrator' : 'Standard User';
  document.getElementById('change-password-form').reset();
  openModal('profile-modal');
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  try {
    await api.auth.login(username, password);
    closeModal();
    await loadUserInfo();
    await loadSettings();
    await loadBibMaps();
    await loadReferences();
    await loadTaxonomies();
    announce('Logged in successfully');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const email = document.getElementById('register-email').value;
  const username = document.getElementById('register-username').value;
  const displayName = document.getElementById('register-display-name').value;
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;
  const errorEl = document.getElementById('register-error');

  if (password !== confirmPassword) {
    errorEl.textContent = 'Passwords do not match';
    errorEl.hidden = false;
    return;
  }

  try {
    await api.auth.register({
      email,
      username,
      display_name: displayName || username,
      password
    });
    // Auto-login after registration
    await api.auth.login(username, password);
    closeModal();
    await loadUserInfo();
    await loadSettings();
    await loadBibMaps();
    await loadReferences();
    await loadTaxonomies();
    announce('Account created and logged in');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

async function handleLogout() {
  try {
    await api.auth.logout();
    currentUser = null;
    updateAuthUI();
    await loadBibMaps();
    await loadReferences();
    await loadTaxonomies();
    showSection('bibmaps');
    announce('Logged out successfully');
  } catch (err) {
    announce(`Logout failed: ${err.message}`);
  }
}

async function handleProfileUpdate(e) {
  e.preventDefault();
  const email = document.getElementById('profile-email').value;
  const displayName = document.getElementById('profile-display-name').value;
  const errorEl = document.getElementById('profile-error');

  try {
    await api.auth.updateProfile({ email, display_name: displayName });
    await loadUserInfo();
    closeModal();
    announce('Profile updated');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-new-password').value;
  const errorEl = document.getElementById('password-error');

  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'New passwords do not match';
    errorEl.hidden = false;
    return;
  }

  try {
    await api.auth.changePassword(currentPassword, newPassword);
    document.getElementById('change-password-form').reset();
    errorEl.hidden = true;
    announce('Password changed successfully');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

// Admin user management
let allUsers = [];
let editingUserId = null;

async function loadUsers() {
  try {
    const search = document.getElementById('user-search')?.value || '';
    allUsers = await api.auth.listUsers(0, 100, search || null);
    renderUsersList();
  } catch (err) {
    announce(`Error loading users: ${err.message}`);
  }
}

function renderUsersList() {
  const container = document.getElementById('users-list');
  if (!container) return;

  if (allUsers.length === 0) {
    container.innerHTML = '<p class="empty-message">No users found</p>';
    return;
  }

  container.innerHTML = allUsers.map(user => `
    <div class="card user-card" role="listitem" data-user-id="${user.id}">
      <div class="card-header">
        <h3 class="card-title">${escapeHtml(user.display_name || user.username)}</h3>
        <span class="badge ${user.role === 'admin' ? 'badge-admin' : 'badge-user'}">${user.role}</span>
      </div>
      <p class="card-meta">@${escapeHtml(user.username)}</p>
      <p class="card-meta">${escapeHtml(user.email)}</p>
      <p class="card-meta ${user.is_active ? '' : 'text-danger'}">${user.is_active ? 'Active' : 'Inactive'}</p>
      <div class="card-actions">
        <button class="btn-secondary btn-sm edit-user-btn">Edit</button>
        ${user.id !== currentUser?.user_id ? '<button class="btn-danger btn-sm delete-user-btn">Delete</button>' : ''}
      </div>
    </div>
  `).join('');

  // Add event listeners
  container.querySelectorAll('.edit-user-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const userId = e.target.closest('.user-card').dataset.userId;
      openEditUserModal(parseInt(userId));
    });
  });

  container.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = e.target.closest('.user-card').dataset.userId;
      const user = allUsers.find(u => u.id === parseInt(userId));
      if (user && await showConfirm(`Delete user "${user.username}"? This will also delete all their data.`)) {
        try {
          await api.auth.deleteUser(userId);
          await loadUsers();
          announce('User deleted');
        } catch (err) {
          announce(`Error deleting user: ${err.message}`);
        }
      }
    });
  });
}

function openCreateUserModal() {
  editingUserId = null;
  document.getElementById('user-modal-title').textContent = 'Create User';
  document.getElementById('user-submit-btn').textContent = 'Create';
  document.getElementById('user-form').reset();
  document.getElementById('user-password').required = true;
  document.getElementById('user-password-group').querySelector('label').textContent = 'Password:';
  document.getElementById('user-error').hidden = true;
  document.getElementById('user-active').checked = true;
  openModal('user-modal');
}

function openEditUserModal(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  editingUserId = userId;
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('user-submit-btn').textContent = 'Save';
  document.getElementById('user-email').value = user.email;
  document.getElementById('user-username').value = user.username;
  document.getElementById('user-display-name').value = user.display_name || '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-password').required = false;
  document.getElementById('user-password-group').querySelector('label').textContent = 'New Password (leave blank to keep):';
  document.getElementById('user-role').value = user.role;
  document.getElementById('user-active').checked = user.is_active;
  document.getElementById('user-error').hidden = true;
  openModal('user-modal');
}

async function handleUserFormSubmit(e) {
  e.preventDefault();
  const errorEl = document.getElementById('user-error');
  const email = document.getElementById('user-email').value;
  const username = document.getElementById('user-username').value;
  const displayName = document.getElementById('user-display-name').value;
  const password = document.getElementById('user-password').value;
  const role = document.getElementById('user-role').value;
  const isActive = document.getElementById('user-active').checked;

  try {
    if (editingUserId) {
      // Update existing user
      const updateData = {
        email,
        username,
        display_name: displayName || username,
        role,
        is_active: isActive
      };
      await api.auth.updateUser(editingUserId, updateData);

      // Reset password if provided
      if (password) {
        await api.auth.resetPassword(editingUserId, password);
      }
      announce('User updated');
    } else {
      // Create new user
      await api.auth.createUser({
        email,
        username,
        display_name: displayName || username,
        password,
        role,
        is_active: isActive
      });
      announce('User created');
    }
    closeModal();
    await loadUsers();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

// User Settings
let userSettings = null;

async function loadSettings() {
  if (!currentUser) return;

  try {
    userSettings = await api.settings.get();
    applySettings();
    populateSettingsForm();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function applySettings() {
  if (!userSettings) return;

  // Apply theme
  applyTheme(userSettings.theme);

  // Apply references defaults
  refsPageSize = userSettings.default_refs_page_size || 20;
  refsSortBy = userSettings.default_refs_sort || 'imported-desc';

  // Update page size select if on references page
  const pageSizeSelect = document.getElementById('ref-page-size');
  if (pageSizeSelect) {
    pageSizeSelect.value = refsPageSize;
  }
  const sortSelect = document.getElementById('ref-sort');
  if (sortSelect) {
    sortSelect.value = refsSortBy;
  }
}

function applyTheme(theme) {
  const root = document.documentElement;

  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    // System default - check preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
  }
}

function populateSettingsForm() {
  if (!userSettings) return;

  document.getElementById('setting-theme').value = userSettings.theme || 'system';
  document.getElementById('setting-node-color').value = userSettings.default_node_color || '#3B82F6';
  document.getElementById('setting-text-color').value = userSettings.default_text_color || '#FFFFFF';
  document.getElementById('setting-node-shape').value = userSettings.default_node_shape || 'rectangle';
  document.getElementById('setting-snap-grid').checked = userSettings.snap_to_grid || false;
  document.getElementById('setting-grid-size').value = userSettings.grid_size || 20;
  document.getElementById('setting-auto-save').checked = userSettings.auto_save !== false;
  document.getElementById('setting-refs-page-size').value = userSettings.default_refs_page_size || 20;
  document.getElementById('setting-refs-sort').value = userSettings.default_refs_sort || 'imported-desc';
  document.getElementById('setting-email-notifications').checked = userSettings.email_notifications !== false;
}

async function updateSetting(key, value) {
  if (!currentUser) return;

  try {
    userSettings = await api.settings.update({ [key]: value });
    applySettings();
    announce('Setting saved');
  } catch (err) {
    announce(`Error saving setting: ${err.message}`);
  }
}

async function resetSettings() {
  if (!currentUser) return;

  const confirmed = await showConfirm(
    'Are you sure you want to reset all settings to defaults?',
    'Reset Settings',
    'Reset'
  );

  if (confirmed) {
    try {
      userSettings = await api.settings.reset();
      applySettings();
      populateSettingsForm();
      announce('Settings reset to defaults');
    } catch (err) {
      announce(`Error resetting settings: ${err.message}`);
    }
  }
}

// Taxonomies
async function loadTaxonomies() {
  try {
    taxonomies = await api.taxonomies.list();
    allTaxonomies = [...taxonomies];
    updateTaxonomySelects();
    applyTaxonomiesFilterAndSort();
  } catch (err) {
    announce(`Error loading taxonomies: ${err.message}`);
  }
}

function applyTaxonomiesFilterAndSort() {
  let tags = [...allTaxonomies];

  // Apply name filter
  if (taxNameFilter) {
    const filter = taxNameFilter.toLowerCase();
    tags = tags.filter(t => t.name.toLowerCase().includes(filter));
  }

  // Apply sorting
  tags = sortTaxonomies(tags, taxSortBy);

  filteredTaxonomies = tags;
  renderTaxonomiesList();
}

function sortTaxonomies(tags, sortBy) {
  const sorted = [...tags];

  switch (sortBy) {
    case 'created-desc':
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case 'created-asc':
      sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case 'modified-desc':
      sorted.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
      break;
    case 'modified-asc':
      sorted.sort((a, b) => new Date(a.updated_at || a.created_at) - new Date(b.updated_at || b.created_at));
      break;
    case 'name-asc':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
  }

  return sorted;
}

function updateTaxonomySelects() {
  const selects = [
    document.getElementById('prop-taxonomies'),
    document.getElementById('import-taxonomies'),
    document.getElementById('ref-taxonomy-filter'),
    document.getElementById('ref-edit-taxonomies')
  ];

  selects.forEach(select => {
    if (!select) return;

    const isFilter = select.id === 'ref-taxonomy-filter';
    const currentValues = Array.from(select.selectedOptions).map(o => o.value);

    select.innerHTML = isFilter ? '<option value="">All</option>' : '';

    taxonomies.forEach(tax => {
      const option = document.createElement('option');
      option.value = tax.id;
      option.textContent = tax.name;
      option.style.backgroundColor = tax.color;
      if (currentValues.includes(String(tax.id))) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  });
}

function renderTaxonomiesList() {
  const container = document.getElementById('taxonomies-list');
  const tagsToRender = filteredTaxonomies.length > 0 || taxNameFilter ? filteredTaxonomies : allTaxonomies;

  if (tagsToRender.length === 0) {
    container.innerHTML = taxNameFilter
      ? '<p>No tags match your filter.</p>'
      : '<p>No tags yet. Create one to get started!</p>';
    return;
  }

  container.innerHTML = tagsToRender.map(tax => `
    <div class="card taxonomy-card" role="listitem" data-id="${tax.id}">
      <h3><span class="tag-color-dot" style="background-color: ${tax.color}"></span>${escapeHtml(tax.name)}</h3>
      <p>${escapeHtml(tax.description || 'No description')}</p>
      <div class="card-footer">
        <span>Created ${formatDate(tax.created_at)}</span>
        <span class="edit-indicator">Click to edit</span>
        <button class="btn-secondary delete-taxonomy" data-id="${tax.id}" data-name="${escapeHtml(tax.name)}" aria-label="Delete ${tax.name}">Delete</button>
      </div>
    </div>
  `).join('');

  // Click to edit handlers
  container.querySelectorAll('.taxonomy-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-taxonomy')) {
        openEditTaxonomy(parseInt(card.dataset.id));
      }
    });
  });

  // Delete handlers
  container.querySelectorAll('.delete-taxonomy').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tagName = btn.dataset.name;
      const confirmed = await showConfirm(
        `Are you sure you want to delete the tag "${tagName}"? This action cannot be undone.`,
        'Delete Tag',
        'Delete'
      );
      if (confirmed) {
        try {
          await api.taxonomies.delete(btn.dataset.id);
          await loadTaxonomies();
          announce('Tag deleted');
        } catch (err) {
          announce(`Error: ${err.message}`);
        }
      }
    });
  });
}

function openEditTaxonomy(taxId) {
  const tax = taxonomies.find(t => t.id === taxId);
  if (!tax) return;

  editingTaxonomyId = taxId;
  document.getElementById('create-tax-title').textContent = 'Edit Tag';
  document.getElementById('tax-name').value = tax.name;
  document.getElementById('tax-description').value = tax.description || '';
  document.getElementById('tax-color').value = tax.color;
  document.getElementById('tax-submit-btn').textContent = 'Save';

  openModal('create-taxonomy-modal');
}

function resetTaxonomyModal() {
  editingTaxonomyId = null;
  document.getElementById('create-tax-title').textContent = 'Create Tag';
  document.getElementById('create-taxonomy-form').reset();
  document.getElementById('tax-color').value = '#6B7280';
  document.getElementById('tax-submit-btn').textContent = 'Create';
}

// Media
async function loadMedia(taxonomyId = null) {
  try {
    mediaTaxonomyFilter = taxonomyId || '';
    allMedia = await api.media.list(taxonomyId || null);
    applyMediaFilterAndSort();
  } catch (err) {
    announce(`Error loading media: ${err.message}`);
  }
}

function applyMediaFilterAndSort() {
  let items = [...allMedia];

  // Apply title filter
  if (mediaTitleFilter) {
    const filter = mediaTitleFilter.toLowerCase();
    items = items.filter(m =>
      (m.title && m.title.toLowerCase().includes(filter)) ||
      (m.description && m.description.toLowerCase().includes(filter))
    );
  }

  // Apply sorting
  items = sortMedia(items, mediaSortBy);

  filteredMedia = items;

  // Reset to page 1 when filters change
  const maxPage = Math.ceil(filteredMedia.length / mediaPageSize) || 1;
  if (mediaCurrentPage > maxPage) {
    mediaCurrentPage = 1;
  }

  renderMediaList();
}

function sortMedia(items, sortBy) {
  const sorted = [...items];

  switch (sortBy) {
    case 'created-desc':
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case 'created-asc':
      sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case 'title-asc':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
    case 'title-desc':
      sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      break;
  }

  return sorted;
}

function renderMediaList() {
  const container = document.getElementById('media-list');
  const totalItems = filteredMedia.length;
  const totalPages = Math.ceil(totalItems / mediaPageSize) || 1;

  // Ensure current page is valid
  if (mediaCurrentPage < 1) mediaCurrentPage = 1;
  if (mediaCurrentPage > totalPages) mediaCurrentPage = totalPages;

  // Calculate pagination
  const startIdx = (mediaCurrentPage - 1) * mediaPageSize;
  const endIdx = Math.min(startIdx + mediaPageSize, totalItems);
  const pageItems = filteredMedia.slice(startIdx, endIdx);

  if (totalItems === 0) {
    container.innerHTML = '<p>No media found. Click "Add Media" to add your first link!</p>';
  } else {
    container.innerHTML = pageItems.map(m => `
      <article class="reference-card media-card" role="listitem" data-id="${m.id}">
        <h3>${escapeHtml(m.title)}</h3>
        <p class="meta"><a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.url)}</a></p>
        ${m.description ? `<p class="description">${escapeHtml(m.description)}</p>` : ''}
        <div class="tags">
          ${m.taxonomies?.map(t => `
            <span class="tag" style="background: ${t.color}; color: white;">${escapeHtml(t.name)}</span>
          `).join('') || ''}
        </div>
        <p class="meta">Added ${formatDate(m.created_at)}</p>
      </article>
    `).join('');

    // Click handlers
    container.querySelectorAll('.media-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Don't open modal if clicking a link
        if (e.target.tagName === 'A') return;
        openMediaModal(parseInt(card.dataset.id));
      });
    });
  }

  // Update pagination UI
  updateMediaPaginationUI(totalItems, totalPages, startIdx, endIdx);
}

function updateMediaPaginationUI(totalItems, totalPages, startIdx, endIdx) {
  const info = document.getElementById('media-pagination-info');
  const pageIndicator = document.getElementById('media-page-indicator');
  const prevBtn = document.getElementById('media-prev-page');
  const nextBtn = document.getElementById('media-next-page');

  if (totalItems === 0) {
    info.textContent = 'No media';
  } else {
    info.textContent = `Showing ${startIdx + 1}-${endIdx} of ${totalItems} media`;
  }

  pageIndicator.textContent = `Page ${mediaCurrentPage} of ${totalPages}`;
  prevBtn.disabled = mediaCurrentPage <= 1;
  nextBtn.disabled = mediaCurrentPage >= totalPages;
}

function openMediaModal(mediaId = null) {
  const modal = document.getElementById('media-modal');

  if (mediaId) {
    // Edit mode
    const media = allMedia.find(m => m.id === mediaId);
    if (!media) return;

    editingMediaId = mediaId;
    document.getElementById('media-modal-title').textContent = 'Edit Media';
    document.getElementById('media-title').value = media.title;
    document.getElementById('media-url').value = media.url;
    document.getElementById('media-description').value = media.description || '';
    document.getElementById('media-submit-btn').textContent = 'Save';
    document.getElementById('delete-media-btn').hidden = false;

    // Set up tags
    mediaSelectedTags = media.taxonomies ? media.taxonomies.map(t => ({ id: t.id, name: t.name, color: t.color })) : [];
  } else {
    // Create mode
    editingMediaId = null;
    document.getElementById('media-modal-title').textContent = 'Add Media';
    document.getElementById('media-form').reset();
    document.getElementById('media-submit-btn').textContent = 'Add';
    document.getElementById('delete-media-btn').hidden = true;
    mediaSelectedTags = [];
  }

  renderSelectedTags('media');
  openModal('media-modal');
}

function updateMediaTaxonomySelect() {
  const select = document.getElementById('media-taxonomy-filter');
  if (!select) return;

  const currentValue = select.value;
  select.innerHTML = '<option value="">All</option>';

  taxonomies.forEach(tax => {
    const option = document.createElement('option');
    option.value = tax.id;
    option.textContent = tax.name;
    option.style.backgroundColor = tax.color;
    if (currentValue === String(tax.id)) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

// BibMaps
async function loadBibMaps() {
  try {
    const bibmaps = await api.bibmaps.list();
    renderBibMapsList(bibmaps);
  } catch (err) {
    announce(`Error loading BibMaps: ${err.message}`);
  }
}

function renderBibMapsList(bibmaps) {
  const container = document.getElementById('bibmaps-list');

  if (bibmaps.length === 0) {
    container.innerHTML = '<p>No BibMaps yet. Create one to get started!</p>';
    return;
  }

  container.innerHTML = bibmaps.map(bm => `
    <div class="card" role="listitem" data-id="${bm.id}">
      <h3>${escapeHtml(bm.title)}</h3>
      <p>${escapeHtml(bm.description || 'No description')}</p>
      <div class="card-footer">
        <span>Updated ${formatDate(bm.updated_at)}</span>
        <div class="card-actions">
          <button class="btn-download download-bibmap" data-id="${bm.id}" aria-label="Download ${bm.title}" title="Download .bibmap">
            <span aria-hidden="true">&#8595;</span>
          </button>
          <button class="btn-secondary delete-bibmap" data-id="${bm.id}" aria-label="Delete ${bm.title}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  // Click handlers
  container.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-bibmap') &&
          !e.target.classList.contains('download-bibmap') &&
          !e.target.closest('.download-bibmap')) {
        openBibMapEditor(card.dataset.id);
      }
    });
  });

  container.querySelectorAll('.download-bibmap').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await downloadBibMap(btn.dataset.id);
    });
  });

  container.querySelectorAll('.delete-bibmap').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirm(
        'Are you sure you want to delete this BibMap? All nodes and connections will be permanently deleted.',
        'Delete BibMap',
        'Delete'
      );
      if (confirmed) {
        try {
          await api.bibmaps.delete(btn.dataset.id);
          await loadBibMaps();
          announce('BibMap deleted');
        } catch (err) {
          announce(`Error: ${err.message}`);
        }
      }
    });
  });
}

async function importBibMapFile(file) {
  try {
    const zip = await JSZip.loadAsync(file);

    // Read bibmap.json
    const bibmapJsonFile = zip.file('bibmap.json');
    if (!bibmapJsonFile) {
      throw new Error('Invalid .bibmap file: missing bibmap.json');
    }

    const bibmapData = JSON.parse(await bibmapJsonFile.async('text'));

    // Create the BibMap
    const newBibmap = await api.bibmaps.create({
      title: bibmapData.title + ' (imported)',
      description: bibmapData.description || ''
    });

    // Import references if references.bib exists
    const refsBibFile = zip.file('references.bib');
    if (refsBibFile) {
      const bibtexContent = await refsBibFile.async('text');
      if (bibtexContent.trim()) {
        try {
          await api.references.import(bibtexContent, []);
        } catch (err) {
          console.warn('Some references may have already existed:', err.message);
        }
      }
    }

    // Create nodes with position offsets
    const nodeIdMap = {}; // old id -> new id
    for (const node of (bibmapData.nodes || [])) {
      const newNode = await api.nodes.create({
        bibmap_id: newBibmap.id,
        label: node.label,
        description: node.description,
        x: node.x,
        y: node.y,
        background_color: node.background_color,
        text_color: node.text_color,
        border_color: node.border_color,
        font_size: node.font_size,
        font_family: node.font_family,
        font_bold: node.font_bold,
        font_italic: node.font_italic,
        font_underline: node.font_underline,
        width: node.width,
        height: node.height,
        shape: node.shape,
        node_style: node.node_style,
        link_to_references: node.link_to_references,
        wrap_text: node.wrap_text,
        taxonomy_ids: [] // Tags need to be mapped separately
      });
      nodeIdMap[node.id] = newNode.id;
    }

    // Create connections
    for (const conn of (bibmapData.connections || [])) {
      const sourceId = nodeIdMap[conn.source_node_id];
      const targetId = nodeIdMap[conn.target_node_id];

      if (sourceId && targetId) {
        await api.connections.create({
          bibmap_id: newBibmap.id,
          source_node_id: sourceId,
          target_node_id: targetId,
          line_color: conn.line_color,
          line_width: conn.line_width,
          line_style: conn.line_style,
          arrow_type: conn.arrow_type,
          label: conn.label,
          show_label: conn.show_label
        });
      }
    }

    announce('BibMap imported successfully!');
    loadBibMaps();

    // Open the imported BibMap
    openBibMapEditor(newBibmap.id);
  } catch (err) {
    console.error('Import error:', err);
    throw err;
  }
}

async function downloadBibMap(bibmapId) {
  try {
    announce('Preparing download...');

    // Fetch the full BibMap with all data
    const bibmap = await api.bibmaps.get(bibmapId);

    // Fetch all references that are linked to this BibMap's nodes via tags
    const allRefs = await api.references.list();

    // Get linked references using tested export function
    const linkedRefs = getLinkedReferences(bibmap, allRefs);

    // Create the ZIP file
    const zip = new JSZip();

    // 1. bibmap.json - The map structure with nodes, connections, and their properties
    const bibmapData = buildBibmapJson(bibmap);
    zip.file('bibmap.json', JSON.stringify(bibmapData, null, 2));

    // 2. references.bib - BibTeX file with all linked references
    const bibtexContent = buildBibtexContent(linkedRefs);
    zip.file('references.bib', bibtexContent);

    // 3. tag-mappings.json - Mappings between tags and references for re-import
    const tagMappings = buildTagMappings(bibmap, linkedRefs);
    zip.file('tag-mappings.json', JSON.stringify(tagMappings, null, 2));

    // Generate the ZIP and trigger download
    const blob = await zip.generateAsync({ type: 'blob' });
    const filename = generateFilename(bibmap.title);

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    announce('Download started');
  } catch (err) {
    announce(`Error downloading: ${err.message}`);
    console.error('Download error:', err);
  }
}

async function openBibMapEditor(bibmapId) {
  showSection('editor');

  if (!bibmapCanvas) {
    bibmapCanvas = new BibMapCanvas('bibmap-container', {
      onNodeSelect: handleNodeSelect,
      onConnectionSelect: handleConnectionSelect,
      onCanvasClick: hidePropertiesPanel,
      announce: announce
    });
  }

  try {
    currentBibmap = await bibmapCanvas.load(bibmapId);
    document.getElementById('editor-heading').textContent = currentBibmap.title;

    // Update publish toggle state
    const publishToggle = document.getElementById('publish-toggle');
    const copyLinkBtn = document.getElementById('copy-link');
    publishToggle.checked = currentBibmap.is_published || false;
    copyLinkBtn.hidden = !currentBibmap.is_published;

    announce(`Opened BibMap: ${currentBibmap.title}`);
  } catch (err) {
    announce(`Error loading BibMap: ${err.message}`);
  }
}

function openEditBibMap() {
  if (!currentBibmap) return;

  editingBibmapId = currentBibmap.id;
  document.getElementById('create-bm-title').textContent = 'Edit BibMap';
  document.getElementById('bm-title').value = currentBibmap.title;
  document.getElementById('bm-description').value = currentBibmap.description || '';
  document.getElementById('bm-submit-btn').textContent = 'Save';
  document.getElementById('delete-bibmap-btn').hidden = false;

  openModal('create-bibmap-modal');
}

function resetBibMapModal() {
  editingBibmapId = null;
  document.getElementById('create-bm-title').textContent = 'Create BibMap';
  document.getElementById('create-bibmap-form').reset();
  document.getElementById('bm-submit-btn').textContent = 'Create';
  document.getElementById('delete-bibmap-btn').hidden = true;
}

function handleNodeSelect(node) {
  hideConnectionPanel();
  currentConnectionId = null;
  showPropertiesPanel(node);
  updateConnectButtonState(true);
  updateToolbarButtons();
}

function handleConnectionSelect(connection) {
  hidePropertiesPanel();
  if (connection) {
    currentConnectionId = connection.id;
    showConnectionPanel(connection);
  } else {
    currentConnectionId = null;
    hideConnectionPanel();
  }
  updateToolbarButtons();
}

function updateToolbarButtons() {
  const hasSelection = currentNodeId !== null || currentConnectionId !== null;
  document.getElementById('duplicate-btn').disabled = !hasSelection;
  document.getElementById('delete-btn').disabled = !hasSelection;
}

function showConnectionPanel(connection) {
  const panel = document.getElementById('connection-panel');
  panel.hidden = false;
  panel.dataset.connectionId = connection.id;

  document.getElementById('conn-label').value = connection.label || '';
  document.getElementById('conn-show-label').checked = connection.show_label || false;
  document.getElementById('conn-line-color').value = connection.line_color || '#6B7280';
  document.getElementById('conn-line-width').value = connection.line_width || 4;
  document.getElementById('conn-line-style').value = connection.line_style || 'solid';
  document.getElementById('conn-arrow-type').value = connection.arrow_type || 'end';
}

function hideConnectionPanel() {
  const panel = document.getElementById('connection-panel');
  panel.hidden = true;
  delete panel.dataset.connectionId;
  currentConnectionId = null;
  updateToolbarButtons();
}

function updateConnectButtonState(hasSelection) {
  const btn = document.getElementById('connect-mode');
  btn.disabled = !hasSelection;
}

function showPropertiesPanel(node) {
  const panel = document.getElementById('properties-panel');
  panel.hidden = false;
  currentNodeId = node.id;

  document.getElementById('prop-label').value = node.label || '';
  document.getElementById('prop-description').value = node.description || '';
  document.getElementById('prop-bg-color').value = node.background_color || '#3B82F6';
  document.getElementById('prop-text-color').value = node.text_color || '#FFFFFF';
  document.getElementById('prop-shape').value = node.shape || 'rectangle';
  document.getElementById('prop-node-style').value = node.node_style || 'flat';
  document.getElementById('prop-link-refs').checked = node.link_to_references !== false;
  document.getElementById('prop-wrap-text').checked = node.wrap_text !== false;

  // Text style fields
  document.getElementById('prop-font-family').value = node.font_family || 'system-ui';
  document.getElementById('prop-font-size').value = node.font_size || 14;

  // Set style button states
  document.getElementById('prop-bold').classList.toggle('active', node.font_bold || false);
  document.getElementById('prop-italic').classList.toggle('active', node.font_italic || false);
  document.getElementById('prop-underline').classList.toggle('active', node.font_underline || false);

  // Set up tag input with current tags
  nodeSelectedTags = node.taxonomies ? node.taxonomies.map(t => ({ id: t.id, name: t.name, color: t.color })) : [];
  renderSelectedTags('node');

  // Update link to references checkbox based on tags
  updateLinkRefsCheckbox(node.link_to_references !== false);

  // Load linked references
  loadNodeReferences(node.id, node.link_to_references !== false);

  panel.dataset.nodeId = node.id;
}

// Debounce helper for live updates
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Save node property immediately
async function saveNodeProperty(property, value) {
  const nodeId = parseInt(document.getElementById('properties-panel').dataset.nodeId);
  if (!nodeId || !bibmapCanvas) return;

  try {
    const data = { [property]: value };
    // Handle taxonomy_ids specially
    if (property === 'taxonomy_ids') {
      data.taxonomy_ids = Array.from(document.getElementById('prop-taxonomies').selectedOptions)
        .map(o => parseInt(o.value));
    }
    await bibmapCanvas.updateNode(nodeId, data);
  } catch (err) {
    announce(`Error: ${err.message}`);
  }
}

// Debounced version for text inputs
const debouncedSaveNodeProperty = debounce(saveNodeProperty, 300);

// Save connection property immediately
async function saveConnectionProperty(property, value) {
  const connectionId = parseInt(document.getElementById('connection-panel').dataset.connectionId);
  if (!connectionId || !bibmapCanvas) return;

  try {
    await bibmapCanvas.updateConnection(connectionId, { [property]: value });
  } catch (err) {
    announce(`Error: ${err.message}`);
  }
}

// Debounced version for connection text inputs
const debouncedSaveConnectionProperty = debounce(saveConnectionProperty, 300);

function updateLinkRefsCheckbox(currentValue = true) {
  const checkbox = document.getElementById('prop-link-refs');
  const helpText = document.getElementById('link-refs-help');
  const hasTags = nodeSelectedTags.length > 0;

  checkbox.disabled = !hasTags;

  if (hasTags) {
    // Enable and set to the current value (or auto-check if was disabled)
    checkbox.checked = currentValue;
    helpText.hidden = true;
  } else {
    // Disable and uncheck
    checkbox.checked = false;
    helpText.hidden = false;
  }
}

async function loadNodeReferences(nodeId, linkEnabled = true) {
  const container = document.getElementById('node-references');
  const countSpan = document.getElementById('node-refs-count');

  try {
    // Fetch both references and media counts
    const [refs, media] = await Promise.all([
      api.nodes.getReferences(nodeId),
      api.nodes.getMedia(nodeId)
    ]);
    const totalCount = refs.length + media.length;
    countSpan.textContent = totalCount;

    // Show the link button if there are references or media and linking is enabled
    container.hidden = !(totalCount > 0 && linkEnabled);
  } catch (err) {
    console.error('Failed to load node references:', err);
    container.hidden = true;
  }
}

function openNodeReferencesPage(nodeId) {
  // Get node info for the heading
  const node = bibmapCanvas ? bibmapCanvas.getNodeById(nodeId) : null;
  const nodeName = node ? node.label : 'Node';
  const nodeDesc = node && node.description ? node.description : '';

  document.getElementById('node-refs-node-name').textContent = nodeName;
  document.getElementById('node-refs-description').textContent = nodeDesc;
  document.getElementById('node-refs-description').hidden = !nodeDesc;

  // Show the full page section
  showSection('nodeRefs');
  loadFullNodeReferences(nodeId);
}

async function loadFullNodeReferences(nodeId) {
  const content = document.getElementById('node-refs-page-content');
  content.innerHTML = '<p>Loading references and media...</p>';

  try {
    // Fetch both references and media in parallel
    const [refs, media] = await Promise.all([
      api.nodes.getReferences(nodeId),
      api.nodes.getMedia(nodeId)
    ]);

    if (refs.length === 0 && media.length === 0) {
      content.innerHTML = '<p>No linked references or media found. Add tags to this node that match your references or media to see them here.</p>';
      return;
    }

    let html = '';

    // Add references section if any
    if (refs.length > 0) {
      html += '<h3 class="section-subheading">References (' + refs.length + ')</h3>';
      html += refs.map(ref => `
        <article class="reference-card" role="listitem" data-id="${ref.id}" data-type="reference">
          <h3>${escapeHtml(ref.title || ref.bibtex_key)}</h3>
          <p class="authors">${escapeHtml(ref.author || 'Unknown author')}</p>
          <p class="meta">
            ${ref.year ? `(${ref.year})` : ''}
            ${ref.journal ? `<em>${escapeHtml(ref.journal)}</em>` : ''}
            ${ref.booktitle ? `In <em>${escapeHtml(ref.booktitle)}</em>` : ''}
          </p>
          <div class="tags">
            ${ref.taxonomies?.map(t => `
              <span class="tag" style="background: ${t.color}; color: white;">${escapeHtml(t.name)}</span>
            `).join('') || ''}
          </div>
          ${ref.doi ? `<p class="meta"><a href="https://doi.org/${ref.doi}" target="_blank" rel="noopener noreferrer">DOI: ${ref.doi}</a></p>` : ''}
          ${ref.abstract ? `<p class="abstract">${escapeHtml(ref.abstract.substring(0, 300))}${ref.abstract.length > 300 ? '...' : ''}</p>` : ''}
        </article>
      `).join('');
    }

    // Add media section if any
    if (media.length > 0) {
      html += '<h3 class="section-subheading">Media (' + media.length + ')</h3>';
      html += media.map(m => `
        <article class="reference-card media-card" role="listitem" data-id="${m.id}" data-type="media">
          <h3>${escapeHtml(m.title)}</h3>
          <p class="meta"><a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.url)}</a></p>
          ${m.description ? `<p class="description">${escapeHtml(m.description)}</p>` : ''}
          <div class="tags">
            ${m.taxonomies?.map(t => `
              <span class="tag" style="background: ${t.color}; color: white;">${escapeHtml(t.name)}</span>
            `).join('') || ''}
          </div>
          <p class="meta">Added ${formatDate(m.created_at)}</p>
        </article>
      `).join('');
    }

    content.innerHTML = html;

    // Add click handlers for references
    content.querySelectorAll('.reference-card[data-type="reference"]').forEach(card => {
      card.addEventListener('click', () => openReferenceDetail(card.dataset.id));
    });

    // Media cards - clicking on them doesn't open a modal (links are clickable directly)
  } catch (err) {
    content.innerHTML = `<p>Error loading: ${err.message}</p>`;
  }
}

function hidePropertiesPanel() {
  document.getElementById('properties-panel').hidden = true;
  currentNodeId = null;
  updateConnectButtonState(false);
  updateToolbarButtons();
  // Reset connect mode when panel is closed
  const connectBtn = document.getElementById('connect-mode');
  if (connectBtn.getAttribute('aria-pressed') === 'true') {
    connectBtn.setAttribute('aria-pressed', 'false');
    if (bibmapCanvas) {
      bibmapCanvas.setConnectMode(false);
    }
  }
}

// References
async function loadReferences(taxonomyId = null) {
  try {
    // Store the taxonomy filter
    refsTaxonomyFilter = taxonomyId || '';

    // Fetch all references (the API will filter by taxonomy if provided)
    allReferences = await api.references.list(taxonomyId || null);

    // Apply client-side filters and sort
    applyReferencesFilterAndSort();
  } catch (err) {
    announce(`Error loading references: ${err.message}`);
  }
}

function applyReferencesFilterAndSort() {
  // Start with all references
  let refs = [...allReferences];

  // Apply title/author filter
  if (refsTitleFilter) {
    const filter = refsTitleFilter.toLowerCase();
    refs = refs.filter(ref =>
      (ref.title && ref.title.toLowerCase().includes(filter)) ||
      (ref.author && ref.author.toLowerCase().includes(filter)) ||
      (ref.bibtex_key && ref.bibtex_key.toLowerCase().includes(filter))
    );
  }

  // Apply sorting
  refs = sortReferences(refs, refsSortBy);

  // Store filtered results
  filteredReferences = refs;

  // Reset to page 1 when filters change
  const maxPage = Math.ceil(filteredReferences.length / refsPageSize) || 1;
  if (refsCurrentPage > maxPage) {
    refsCurrentPage = 1;
  }

  // Render the current page
  renderReferencesList();
}

function sortReferences(refs, sortBy) {
  const sorted = [...refs];

  switch (sortBy) {
    case 'imported-desc':
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case 'imported-asc':
      sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case 'year-desc':
      sorted.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
      break;
    case 'year-asc':
      sorted.sort((a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0));
      break;
    case 'title-asc':
      sorted.sort((a, b) => (a.title || a.bibtex_key || '').localeCompare(b.title || b.bibtex_key || ''));
      break;
    case 'title-desc':
      sorted.sort((a, b) => (b.title || b.bibtex_key || '').localeCompare(a.title || a.bibtex_key || ''));
      break;
    case 'author-asc':
      sorted.sort((a, b) => (a.author || '').localeCompare(b.author || ''));
      break;
    case 'author-desc':
      sorted.sort((a, b) => (b.author || '').localeCompare(a.author || ''));
      break;
  }

  return sorted;
}

function renderReferencesList() {
  const container = document.getElementById('references-list');
  const totalRefs = filteredReferences.length;
  const totalPages = Math.ceil(totalRefs / refsPageSize) || 1;

  // Ensure current page is valid
  if (refsCurrentPage < 1) refsCurrentPage = 1;
  if (refsCurrentPage > totalPages) refsCurrentPage = totalPages;

  // Calculate pagination
  const startIdx = (refsCurrentPage - 1) * refsPageSize;
  const endIdx = Math.min(startIdx + refsPageSize, totalRefs);
  const pageRefs = filteredReferences.slice(startIdx, endIdx);

  if (totalRefs === 0) {
    container.innerHTML = '<p>No references found. Try adjusting your filters or import BibTeX to get started!</p>';
  } else {
    container.innerHTML = pageRefs.map(ref => `
      <article class="reference-card" role="listitem" data-id="${ref.id}">
        <h3>${escapeHtml(ref.title || ref.bibtex_key)}</h3>
        <p class="authors">${escapeHtml(ref.author || 'Unknown author')}</p>
        <p class="meta">
          ${ref.year ? `(${ref.year})` : ''}
          ${ref.journal ? `<em>${escapeHtml(ref.journal)}</em>` : ''}
          ${ref.booktitle ? `In <em>${escapeHtml(ref.booktitle)}</em>` : ''}
        </p>
        <div class="tags">
          ${ref.taxonomies?.map(t => `
            <span class="tag" style="background: ${t.color}; color: white;">${escapeHtml(t.name)}</span>
          `).join('') || ''}
        </div>
      </article>
    `).join('');

    // Click handlers
    container.querySelectorAll('.reference-card').forEach(card => {
      card.addEventListener('click', () => openReferenceDetail(card.dataset.id));
    });
  }

  // Update pagination UI
  updatePaginationUI(totalRefs, totalPages, startIdx, endIdx);
}

function updatePaginationUI(totalRefs, totalPages, startIdx, endIdx) {
  const info = document.getElementById('ref-pagination-info');
  const pageIndicator = document.getElementById('ref-page-indicator');
  const prevBtn = document.getElementById('ref-prev-page');
  const nextBtn = document.getElementById('ref-next-page');

  if (totalRefs === 0) {
    info.textContent = 'No references';
  } else {
    info.textContent = `Showing ${startIdx + 1}-${endIdx} of ${totalRefs} references`;
  }

  pageIndicator.textContent = `Page ${refsCurrentPage} of ${totalPages}`;
  prevBtn.disabled = refsCurrentPage <= 1;
  nextBtn.disabled = refsCurrentPage >= totalPages;
}

async function openReferenceDetail(refId) {
  try {
    const ref = await api.references.get(refId);
    currentReferenceId = refId;
    const content = document.getElementById('reference-detail-content');

    content.innerHTML = `
      <h3>${escapeHtml(ref.title || ref.bibtex_key)}</h3>
      <p><strong>Authors:</strong> ${escapeHtml(ref.author || 'Unknown')}</p>
      <p><strong>Year:</strong> ${ref.year || 'N/A'}</p>
      ${ref.journal ? `<p><strong>Journal:</strong> ${escapeHtml(ref.journal)}</p>` : ''}
      ${ref.booktitle ? `<p><strong>Book/Proceedings:</strong> ${escapeHtml(ref.booktitle)}</p>` : ''}
      ${ref.doi ? `<p><strong>DOI:</strong> <a href="https://doi.org/${ref.doi}" target="_blank">${ref.doi}</a></p>` : ''}
      ${ref.url ? `<p><strong>URL:</strong> <a href="${ref.url}" target="_blank">${ref.url}</a></p>` : ''}
      ${ref.abstract ? `<p><strong>Abstract:</strong> ${escapeHtml(ref.abstract)}</p>` : ''}
    `;

    // Set up tag input with current tags
    refSelectedTags = ref.taxonomies ? ref.taxonomies.map(t => ({ id: t.id, name: t.name, color: t.color })) : [];
    renderSelectedTags('ref');

    // Set up BibTeX editor
    document.getElementById('ref-edit-bibtex').value = ref.raw_bibtex;

    document.getElementById('reference-detail-modal').dataset.refId = refId;
    openModal('reference-detail-modal');
  } catch (err) {
    announce(`Error: ${err.message}`);
  }
}

// Utility
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Tag Input Component Functions
function getSelectedTags(prefix) {
  if (prefix === 'ref') return refSelectedTags;
  if (prefix === 'node') return nodeSelectedTags;
  if (prefix === 'media') return mediaSelectedTags;
  return importSelectedTags;
}

function setSelectedTags(prefix, tags) {
  if (prefix === 'ref') {
    refSelectedTags = tags;
  } else if (prefix === 'node') {
    nodeSelectedTags = tags;
  } else if (prefix === 'media') {
    mediaSelectedTags = tags;
  } else {
    importSelectedTags = tags;
  }
}

function renderSelectedTags(prefix) {
  const container = document.getElementById(`${prefix}-selected-tags`);
  const selectedTags = getSelectedTags(prefix);

  container.innerHTML = selectedTags.map(tag => `
    <span class="selected-tag" style="background-color: ${tag.color}" data-id="${tag.id}">
      ${escapeHtml(tag.name)}
      <button type="button" class="remove-tag" data-id="${tag.id}" aria-label="Remove ${tag.name}">&times;</button>
    </span>
  `).join('');

  // Add remove handlers
  container.querySelectorAll('.remove-tag').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tagId = parseInt(btn.dataset.id);
      removeTag(prefix, tagId);
    });
  });
}

function removeTag(prefix, tagId) {
  const selectedTags = getSelectedTags(prefix);
  setSelectedTags(prefix, selectedTags.filter(t => t.id !== tagId));
  renderSelectedTags(prefix);
  saveTagsForReference(prefix);
}

function addTag(prefix, tag) {
  const selectedTags = getSelectedTags(prefix);
  if (!selectedTags.find(t => t.id === tag.id)) {
    setSelectedTags(prefix, [...selectedTags, tag]);
    renderSelectedTags(prefix);
    saveTagsForReference(prefix);
  }
  // Clear search input
  document.getElementById(`${prefix}-tag-search`).value = '';
  hideSuggestions(prefix);
}

async function saveTagsForReference(prefix) {
  if (prefix === 'ref' && currentReferenceId) {
    try {
      const taxonomyIds = refSelectedTags.map(t => t.id);
      await api.references.update(currentReferenceId, { taxonomy_ids: taxonomyIds });
      loadReferences(); // Refresh the list in background
    } catch (err) {
      announce(`Error saving tags: ${err.message}`);
    }
  } else if (prefix === 'node' && currentNodeId && bibmapCanvas) {
    try {
      const taxonomyIds = nodeSelectedTags.map(t => t.id);

      // Auto-enable link to references when tags are added (if currently disabled)
      const checkbox = document.getElementById('prop-link-refs');
      const wasDisabled = checkbox.disabled;
      const hasTags = nodeSelectedTags.length > 0;

      // Update the checkbox state
      updateLinkRefsCheckbox(checkbox.checked || (wasDisabled && hasTags));

      // If we auto-enabled linking, save that too
      const linkToRefs = checkbox.checked;

      await bibmapCanvas.updateNode(currentNodeId, {
        taxonomy_ids: taxonomyIds,
        link_to_references: linkToRefs
      });

      // Reload node references since tags changed
      loadNodeReferences(currentNodeId, linkToRefs);
    } catch (err) {
      announce(`Error saving tags: ${err.message}`);
    }
  }
  // For import, tags are collected when form is submitted
}

function showSuggestions(prefix, query) {
  const container = document.getElementById(`${prefix}-tag-suggestions`);
  const selectedTags = getSelectedTags(prefix);
  const selectedIds = selectedTags.map(t => t.id);

  // Filter taxonomies based on query and exclude already selected
  const filtered = taxonomies.filter(t =>
    !selectedIds.includes(t.id) &&
    t.name.toLowerCase().includes(query.toLowerCase())
  );

  if (filtered.length === 0) {
    container.innerHTML = '<div class="no-suggestions">No matching tags</div>';
  } else {
    container.innerHTML = filtered.map(tax => `
      <div class="tag-suggestion" data-id="${tax.id}">
        <span class="tag-color-dot" style="background-color: ${tax.color}"></span>
        <span class="tag-suggestion-name">${escapeHtml(tax.name)}</span>
      </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.tag-suggestion').forEach(el => {
      el.addEventListener('click', () => {
        const tagId = parseInt(el.dataset.id);
        const tag = taxonomies.find(t => t.id === tagId);
        if (tag) {
          addTag(prefix, { id: tag.id, name: tag.name, color: tag.color });
        }
      });
    });
  }

  container.hidden = false;
}

function hideSuggestions(prefix) {
  document.getElementById(`${prefix}-tag-suggestions`).hidden = true;
}

function setupTagInput(prefix) {
  const searchInput = document.getElementById(`${prefix}-tag-search`);
  const suggestionsContainer = document.getElementById(`${prefix}-tag-suggestions`);

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length > 0) {
      showSuggestions(prefix, query);
    } else {
      hideSuggestions(prefix);
    }
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim().length > 0) {
      showSuggestions(prefix, searchInput.value.trim());
    } else {
      // Show all available tags on focus
      showSuggestions(prefix, '');
    }
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    const container = document.getElementById(`${prefix}-tag-input-container`);
    if (container && !container.contains(e.target)) {
      hideSuggestions(prefix);
    }
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', (e) => {
    const suggestions = suggestionsContainer.querySelectorAll('.tag-suggestion');
    const highlighted = suggestionsContainer.querySelector('.tag-suggestion.highlighted');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!highlighted && suggestions.length > 0) {
        suggestions[0].classList.add('highlighted');
      } else if (highlighted && highlighted.nextElementSibling?.classList.contains('tag-suggestion')) {
        highlighted.classList.remove('highlighted');
        highlighted.nextElementSibling.classList.add('highlighted');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (highlighted && highlighted.previousElementSibling?.classList.contains('tag-suggestion')) {
        highlighted.classList.remove('highlighted');
        highlighted.previousElementSibling.classList.add('highlighted');
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted) {
        highlighted.click();
      }
    } else if (e.key === 'Escape') {
      hideSuggestions(prefix);
    }
  });
}

// Event Listeners
function setupEventListeners() {
  // Navigation
  navButtons.bibmaps.addEventListener('click', () => {
    showSection('bibmaps');
    loadBibMaps();
  });

  navButtons.references.addEventListener('click', () => {
    showSection('references');
    loadReferences();
  });

  navButtons.media.addEventListener('click', () => {
    showSection('media');
    loadMedia();
    updateMediaTaxonomySelect();
  });

  navButtons.taxonomies.addEventListener('click', () => {
    showSection('taxonomies');
    loadTaxonomies();
  });

  navButtons.settings.addEventListener('click', () => {
    showSection('settings');
    loadSettings();
  });

  navButtons.admin.addEventListener('click', () => {
    showSection('admin');
    loadUsers();
  });

  navButtons.about.addEventListener('click', () => {
    showSection('about');
  });

  // Auth buttons
  document.getElementById('auth-toggle-btn').addEventListener('click', () => {
    if (currentUser) {
      handleLogout();
    } else {
      showLoginModal();
    }
  });
  document.getElementById('register-btn').addEventListener('click', showRegisterModal);
  document.getElementById('profile-btn').addEventListener('click', showProfileModal);

  // Auth forms
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('profile-form').addEventListener('submit', handleProfileUpdate);
  document.getElementById('change-password-form').addEventListener('submit', handlePasswordChange);

  // Switch between login/register
  document.getElementById('switch-to-register').addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
    showRegisterModal();
  });
  document.getElementById('switch-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
    showLoginModal();
  });

  // Google OAuth buttons
  document.getElementById('google-login-btn').addEventListener('click', () => {
    api.auth.googleLogin();
  });
  document.getElementById('google-register-btn').addEventListener('click', () => {
    api.auth.googleLogin();
  });

  // Admin user management
  document.getElementById('create-user')?.addEventListener('click', openCreateUserModal);
  document.getElementById('user-form').addEventListener('submit', handleUserFormSubmit);
  document.getElementById('user-search')?.addEventListener('input', debounce(() => loadUsers(), 300));

  // Settings
  document.getElementById('reset-settings')?.addEventListener('click', resetSettings);
  document.getElementById('setting-theme')?.addEventListener('change', (e) => updateSetting('theme', e.target.value));
  document.getElementById('setting-node-color')?.addEventListener('input', debounce((e) => updateSetting('default_node_color', e.target.value), 300));
  document.getElementById('setting-text-color')?.addEventListener('input', debounce((e) => updateSetting('default_text_color', e.target.value), 300));
  document.getElementById('setting-node-shape')?.addEventListener('change', (e) => updateSetting('default_node_shape', e.target.value));
  document.getElementById('setting-snap-grid')?.addEventListener('change', (e) => updateSetting('snap_to_grid', e.target.checked));
  document.getElementById('setting-grid-size')?.addEventListener('change', (e) => updateSetting('grid_size', parseInt(e.target.value) || 20));
  document.getElementById('setting-auto-save')?.addEventListener('change', (e) => updateSetting('auto_save', e.target.checked));
  document.getElementById('setting-refs-page-size')?.addEventListener('change', (e) => updateSetting('default_refs_page_size', parseInt(e.target.value) || 20));
  document.getElementById('setting-refs-sort')?.addEventListener('change', (e) => updateSetting('default_refs_sort', e.target.value));
  document.getElementById('setting-email-notifications')?.addEventListener('change', (e) => updateSetting('email_notifications', e.target.checked));

  // Create BibMap
  document.getElementById('create-bibmap').addEventListener('click', () => {
    resetBibMapModal();
    openModal('create-bibmap-modal');
  });

  // Import BibMap
  document.getElementById('import-bibmap').addEventListener('click', () => {
    document.getElementById('bibmap-file-input').click();
  });

  document.getElementById('bibmap-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      announce('Importing BibMap...');
      await importBibMapFile(file);
      e.target.value = ''; // Reset file input
    } catch (err) {
      announce(`Error importing: ${err.message}`);
    }
  });

  document.getElementById('create-bibmap-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = {
        title: document.getElementById('bm-title').value,
        description: document.getElementById('bm-description').value
      };

      if (editingBibmapId) {
        // Update existing BibMap
        currentBibmap = await api.bibmaps.update(editingBibmapId, data);
        document.getElementById('editor-heading').textContent = currentBibmap.title;
        announce('BibMap updated');
      } else {
        // Create new BibMap
        const bm = await api.bibmaps.create(data);
        announce('BibMap created');
        closeAllModals();
        resetBibMapModal();
        openBibMapEditor(bm.id);
        return;
      }

      closeAllModals();
      resetBibMapModal();
    } catch (err) {
      announce(`Error: ${err.message}`);
    }
  });

  // Delete BibMap from edit modal
  document.getElementById('delete-bibmap-btn').addEventListener('click', async () => {
    if (!editingBibmapId) return;

    closeAllModals();
    const confirmed = await showConfirm(
      'Are you sure you want to delete this BibMap? All nodes and connections will be permanently deleted.',
      'Delete BibMap',
      'Delete'
    );
    if (confirmed) {
      try {
        await api.bibmaps.delete(editingBibmapId);
        resetBibMapModal();
        showSection('bibmaps');
        loadBibMaps();
        announce('BibMap deleted');
      } catch (err) {
        announce(`Error: ${err.message}`);
      }
    }
  });

  // Editor toolbar
  document.getElementById('back-to-list').addEventListener('click', () => {
    hidePropertiesPanel();
    showSection('bibmaps');
    loadBibMaps();
  });

  // Back to editor from node references page
  document.getElementById('back-to-editor').addEventListener('click', () => {
    showSection('editor');
  });

  document.getElementById('add-node').addEventListener('click', () => {
    if (bibmapCanvas) {
      // Add node at a random position in view
      const x = 100 + Math.random() * 400;
      const y = 100 + Math.random() * 300;
      bibmapCanvas.addNode(x, y);
    }
  });

  document.getElementById('connect-mode').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;

    const enabled = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', enabled);
    if (bibmapCanvas) {
      bibmapCanvas.startDragConnection(enabled);
    }
  });

  // Duplicate button
  document.getElementById('duplicate-btn').addEventListener('click', async () => {
    if (!bibmapCanvas) return;

    try {
      if (currentNodeId) {
        const newNode = await bibmapCanvas.duplicateNode(currentNodeId);
        if (newNode) {
          currentNodeId = newNode.id;
          showPropertiesPanel(newNode);
        }
      } else if (currentConnectionId) {
        await bibmapCanvas.duplicateConnection(currentConnectionId);
      }
    } catch (err) {
      announce(`Error: ${err.message}`);
    }
  });

  // Delete button
  document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!bibmapCanvas) return;

    if (currentNodeId) {
      const confirmed = await showConfirm(
        'Are you sure you want to delete this node?',
        'Delete Node',
        'Delete'
      );
      if (confirmed) {
        try {
          await bibmapCanvas.deleteNode(currentNodeId);
          hidePropertiesPanel();
        } catch (err) {
          announce(`Error: ${err.message}`);
        }
      }
    } else if (currentConnectionId) {
      const confirmed = await showConfirm(
        'Are you sure you want to delete this connection?',
        'Delete Connection',
        'Delete'
      );
      if (confirmed) {
        try {
          await bibmapCanvas.deleteConnection(currentConnectionId);
          hideConnectionPanel();
        } catch (err) {
          announce(`Error: ${err.message}`);
        }
      }
    }
  });

  // Publish toggle
  document.getElementById('publish-toggle').addEventListener('change', async (e) => {
    if (!currentBibmap) return;

    try {
      if (e.target.checked) {
        currentBibmap = await api.bibmaps.publish(currentBibmap.id);
        announce('BibMap published');
      } else {
        currentBibmap = await api.bibmaps.unpublish(currentBibmap.id);
        announce('BibMap unpublished');
      }
      document.getElementById('copy-link').hidden = !currentBibmap.is_published;
    } catch (err) {
      // Revert checkbox state on error
      e.target.checked = !e.target.checked;
      announce(`Error: ${err.message}`);
    }
  });

  // Copy link button
  document.getElementById('copy-link').addEventListener('click', async () => {
    if (!currentBibmap || !currentBibmap.is_published) return;

    const shareUrl = `${window.location.origin}/share/${currentBibmap.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      announce('Link copied to clipboard');
    } catch (err) {
      // Fallback for browsers without clipboard API
      prompt('Copy this link:', shareUrl);
    }
  });

  // Edit BibMap button
  document.getElementById('edit-bibmap').addEventListener('click', () => {
    openEditBibMap();
  });

  // Node references link
  document.getElementById('node-refs-link').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentNodeId) {
      openNodeReferencesPage(currentNodeId);
    }
  });

  // Node properties - live updates
  document.getElementById('prop-label').addEventListener('input', (e) => {
    debouncedSaveNodeProperty('label', e.target.value);
  });

  document.getElementById('prop-description').addEventListener('input', (e) => {
    debouncedSaveNodeProperty('description', e.target.value);
  });

  document.getElementById('prop-bg-color').addEventListener('input', (e) => {
    saveNodeProperty('background_color', e.target.value);
  });

  document.getElementById('prop-text-color').addEventListener('input', (e) => {
    saveNodeProperty('text_color', e.target.value);
  });

  document.getElementById('prop-shape').addEventListener('change', (e) => {
    saveNodeProperty('shape', e.target.value);
  });

  document.getElementById('prop-node-style').addEventListener('change', (e) => {
    saveNodeProperty('node_style', e.target.value);
  });

  document.getElementById('prop-link-refs').addEventListener('change', (e) => {
    saveNodeProperty('link_to_references', e.target.checked);
  });

  document.getElementById('prop-wrap-text').addEventListener('change', (e) => {
    saveNodeProperty('wrap_text', e.target.checked);
  });

  // Snap to Grid checkbox
  document.getElementById('snap-to-grid').addEventListener('change', (e) => {
    if (bibmapCanvas) {
      bibmapCanvas.snapToGrid = e.target.checked;
    }
  });

  document.getElementById('prop-font-family').addEventListener('change', (e) => {
    saveNodeProperty('font_family', e.target.value);
  });

  document.getElementById('prop-font-size').addEventListener('input', (e) => {
    saveNodeProperty('font_size', parseInt(e.target.value) || 14);
  });

  document.getElementById('prop-bold').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle('active');
    saveNodeProperty('font_bold', btn.classList.contains('active'));
  });

  document.getElementById('prop-italic').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle('active');
    saveNodeProperty('font_italic', btn.classList.contains('active'));
  });

  document.getElementById('prop-underline').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle('active');
    saveNodeProperty('font_underline', btn.classList.contains('active'));
  });

  document.getElementById('delete-node').addEventListener('click', async () => {
    const nodeId = parseInt(document.getElementById('properties-panel').dataset.nodeId);
    if (!nodeId) return;

    const confirmed = await showConfirm(
      'Are you sure you want to delete this node?',
      'Delete Node',
      'Delete'
    );
    if (confirmed) {
      try {
        await bibmapCanvas.deleteNode(nodeId);
        hidePropertiesPanel();
      } catch (err) {
        announce(`Error: ${err.message}`);
      }
    }
  });

  document.getElementById('delete-connection').addEventListener('click', async () => {
    const connectionId = parseInt(document.getElementById('connection-panel').dataset.connectionId);
    if (!connectionId) return;

    const confirmed = await showConfirm(
      'Are you sure you want to delete this connection?',
      'Delete Connection',
      'Delete'
    );
    if (confirmed) {
      try {
        await bibmapCanvas.deleteConnection(connectionId);
        hideConnectionPanel();
      } catch (err) {
        announce(`Error: ${err.message}`);
      }
    }
  });

  // Connection properties - live updates
  document.getElementById('conn-label').addEventListener('input', (e) => {
    debouncedSaveConnectionProperty('label', e.target.value);
  });

  document.getElementById('conn-show-label').addEventListener('change', (e) => {
    saveConnectionProperty('show_label', e.target.checked);
  });

  document.getElementById('conn-line-color').addEventListener('input', (e) => {
    saveConnectionProperty('line_color', e.target.value);
  });

  document.getElementById('conn-line-width').addEventListener('input', (e) => {
    saveConnectionProperty('line_width', parseInt(e.target.value) || 2);
  });

  document.getElementById('conn-line-style').addEventListener('change', (e) => {
    saveConnectionProperty('line_style', e.target.value);
  });

  document.getElementById('conn-arrow-type').addEventListener('change', (e) => {
    saveConnectionProperty('arrow_type', e.target.value);
  });

  // Import BibTeX
  document.getElementById('import-bibtex').addEventListener('click', () => {
    // Reset import state
    importSelectedTags = [];
    renderSelectedTags('import');
    document.getElementById('import-result').hidden = true;
    document.getElementById('import-duplicates').hidden = true;
    document.getElementById('import-errors-container').hidden = true;
    openModal('import-bibtex-modal');
  });

  // File upload handler
  document.getElementById('bibtex-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const text = await file.text();
        document.getElementById('bibtex-content').value = text;
        announce(`Loaded ${file.name}`);
      } catch (err) {
        announce(`Error reading file: ${err.message}`);
      }
    }
  });

  document.getElementById('import-bibtex-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bibtex = document.getElementById('bibtex-content').value;

    if (!bibtex.trim()) {
      announce('Please provide BibTeX content');
      return;
    }

    const taxonomyIds = importSelectedTags.map(t => t.id);

    try {
      const result = await api.references.import(bibtex, taxonomyIds);
      document.getElementById('import-result').hidden = false;

      // Separate duplicates from other errors
      const duplicates = result.errors.filter(e => e.startsWith('Skipped duplicate:'));
      const otherErrors = result.errors.filter(e => !e.startsWith('Skipped duplicate:'));

      document.getElementById('import-summary').textContent =
        `Imported ${result.imported} reference${result.imported !== 1 ? 's' : ''}.`;

      // Show duplicates
      const duplicatesContainer = document.getElementById('import-duplicates');
      const duplicatesList = document.getElementById('import-duplicates-list');
      if (duplicates.length > 0) {
        duplicatesContainer.hidden = false;
        duplicatesList.innerHTML = duplicates.map(d => {
          const key = d.replace('Skipped duplicate: ', '');
          return `<li>${escapeHtml(key)} (already exists)</li>`;
        }).join('');
      } else {
        duplicatesContainer.hidden = true;
      }

      // Show other errors
      const errorsContainer = document.getElementById('import-errors-container');
      const errorsList = document.getElementById('import-errors');
      if (otherErrors.length > 0) {
        errorsContainer.hidden = false;
        errorsList.innerHTML = otherErrors.map(e => `<li>${escapeHtml(e)}</li>`).join('');
      } else {
        errorsContainer.hidden = true;
      }

      if (result.imported > 0) {
        document.getElementById('bibtex-content').value = '';
        document.getElementById('bibtex-file').value = '';
        importSelectedTags = [];
        renderSelectedTags('import');
        loadReferences();
      }

      announce(`Imported ${result.imported} references`);
    } catch (err) {
      announce(`Error: ${err.message}`);
    }
  });

  // Create Taxonomy
  document.getElementById('create-taxonomy').addEventListener('click', () => {
    resetTaxonomyModal();
    openModal('create-taxonomy-modal');
  });

  document.getElementById('create-taxonomy-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = {
        name: document.getElementById('tax-name').value,
        description: document.getElementById('tax-description').value,
        color: document.getElementById('tax-color').value
      };

      if (editingTaxonomyId) {
        await api.taxonomies.update(editingTaxonomyId, data);
        announce('Tag updated');
      } else {
        await api.taxonomies.create(data);
        announce('Tag created');
      }

      closeAllModals();
      resetTaxonomyModal();
      await loadTaxonomies();
    } catch (err) {
      announce(`Error: ${err.message}`);
    }
  });

  // Reference taxonomy filter
  document.getElementById('ref-taxonomy-filter').addEventListener('change', (e) => {
    refsCurrentPage = 1;
    loadReferences(e.target.value || null);
  });

  // Reference title/author filter
  const titleFilterInput = document.getElementById('ref-title-filter');
  const debouncedTitleFilter = debounce((value) => {
    refsTitleFilter = value;
    refsCurrentPage = 1;
    applyReferencesFilterAndSort();
  }, 300);

  titleFilterInput.addEventListener('input', (e) => {
    debouncedTitleFilter(e.target.value);
  });

  // Reference sort
  document.getElementById('ref-sort').addEventListener('change', (e) => {
    refsSortBy = e.target.value;
    applyReferencesFilterAndSort();
  });

  // Pagination controls
  document.getElementById('ref-prev-page').addEventListener('click', () => {
    if (refsCurrentPage > 1) {
      refsCurrentPage--;
      renderReferencesList();
    }
  });

  document.getElementById('ref-next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredReferences.length / refsPageSize) || 1;
    if (refsCurrentPage < totalPages) {
      refsCurrentPage++;
      renderReferencesList();
    }
  });

  document.getElementById('ref-page-size').addEventListener('change', (e) => {
    refsPageSize = parseInt(e.target.value) || 20;
    refsCurrentPage = 1;
    renderReferencesList();
  });

  // Media section event listeners
  document.getElementById('add-media').addEventListener('click', () => {
    openMediaModal();
  });

  document.getElementById('media-taxonomy-filter').addEventListener('change', (e) => {
    mediaCurrentPage = 1;
    loadMedia(e.target.value || null);
  });

  const mediaTitleFilterInput = document.getElementById('media-title-filter');
  const debouncedMediaTitleFilter = debounce((value) => {
    mediaTitleFilter = value;
    mediaCurrentPage = 1;
    applyMediaFilterAndSort();
  }, 300);

  mediaTitleFilterInput.addEventListener('input', (e) => {
    debouncedMediaTitleFilter(e.target.value);
  });

  document.getElementById('media-sort').addEventListener('change', (e) => {
    mediaSortBy = e.target.value;
    applyMediaFilterAndSort();
  });

  // Media pagination controls
  document.getElementById('media-prev-page').addEventListener('click', () => {
    if (mediaCurrentPage > 1) {
      mediaCurrentPage--;
      renderMediaList();
    }
  });

  document.getElementById('media-next-page').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredMedia.length / mediaPageSize) || 1;
    if (mediaCurrentPage < totalPages) {
      mediaCurrentPage++;
      renderMediaList();
    }
  });

  document.getElementById('media-page-size').addEventListener('change', (e) => {
    mediaPageSize = parseInt(e.target.value) || 20;
    mediaCurrentPage = 1;
    renderMediaList();
  });

  // Media form submit
  document.getElementById('media-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = {
        title: document.getElementById('media-title').value,
        url: document.getElementById('media-url').value,
        description: document.getElementById('media-description').value || null,
        taxonomy_ids: mediaSelectedTags.map(t => t.id)
      };

      if (editingMediaId) {
        await api.media.update(editingMediaId, data);
        announce('Media updated');
      } else {
        await api.media.create(data);
        announce('Media added');
      }

      closeAllModals();
      await loadMedia();
    } catch (err) {
      announce(`Error: ${err.message}`);
    }
  });

  // Delete media button
  document.getElementById('delete-media-btn').addEventListener('click', async () => {
    if (!editingMediaId) return;

    closeAllModals();
    const confirmed = await showConfirm(
      'Are you sure you want to delete this media entry?',
      'Delete Media',
      'Delete'
    );
    if (confirmed) {
      try {
        await api.media.delete(editingMediaId);
        await loadMedia();
        announce('Media deleted');
      } catch (err) {
        announce(`Error: ${err.message}`);
      }
    }
  });

  // Update BibTeX for reference
  document.getElementById('update-bibtex-btn').addEventListener('click', async () => {
    if (!currentReferenceId) return;

    const bibtex = document.getElementById('ref-edit-bibtex').value;
    if (!bibtex.trim()) {
      announce('Please provide BibTeX content');
      return;
    }

    try {
      await api.references.updateBibtex(currentReferenceId, bibtex);
      announce('Reference updated from BibTeX');
      // Reload and refresh the modal
      const ref = await api.references.get(currentReferenceId);
      const content = document.getElementById('reference-detail-content');
      content.innerHTML = `
        <h3>${escapeHtml(ref.title || ref.bibtex_key)}</h3>
        <p><strong>Authors:</strong> ${escapeHtml(ref.author || 'Unknown')}</p>
        <p><strong>Year:</strong> ${ref.year || 'N/A'}</p>
        ${ref.journal ? `<p><strong>Journal:</strong> ${escapeHtml(ref.journal)}</p>` : ''}
        ${ref.booktitle ? `<p><strong>Book/Proceedings:</strong> ${escapeHtml(ref.booktitle)}</p>` : ''}
        ${ref.doi ? `<p><strong>DOI:</strong> <a href="https://doi.org/${ref.doi}" target="_blank">${ref.doi}</a></p>` : ''}
        ${ref.url ? `<p><strong>URL:</strong> <a href="${ref.url}" target="_blank">${ref.url}</a></p>` : ''}
        ${ref.abstract ? `<p><strong>Abstract:</strong> ${escapeHtml(ref.abstract)}</p>` : ''}
      `;
      loadReferences();
    } catch (err) {
      announce(`Error: ${err.message}`);
    }
  });

  // Delete reference
  document.getElementById('delete-reference-btn').addEventListener('click', async () => {
    if (!currentReferenceId) return;

    closeAllModals();
    const confirmed = await showConfirm(
      'Are you sure you want to delete this reference? This action cannot be undone.',
      'Delete Reference',
      'Delete'
    );
    if (confirmed) {
      try {
        await api.references.delete(currentReferenceId);
        currentReferenceId = null;
        loadReferences();
        announce('Reference deleted');
      } catch (err) {
        announce(`Error: ${err.message}`);
      }
    }
  });

  // Confirmation modal buttons
  document.getElementById('confirm-yes').addEventListener('click', () => {
    if (confirmResolver) {
      confirmResolver(true);
      confirmResolver = null;
    }
    closeAllModals();
  });

  document.getElementById('confirm-no').addEventListener('click', () => {
    if (confirmResolver) {
      confirmResolver(false);
      confirmResolver = null;
    }
    closeAllModals();
  });

  // Taxonomy filter and sort
  const taxNameFilterInput = document.getElementById('tax-name-filter');
  const debouncedTaxFilter = debounce((value) => {
    taxNameFilter = value;
    applyTaxonomiesFilterAndSort();
  }, 300);

  taxNameFilterInput.addEventListener('input', (e) => {
    debouncedTaxFilter(e.target.value);
  });

  document.getElementById('tax-sort').addEventListener('change', (e) => {
    taxSortBy = e.target.value;
    applyTaxonomiesFilterAndSort();
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  // Close modal on overlay click
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') {
      closeAllModals();
    }
  });

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

// Check if this is a share URL
function getShareId() {
  const match = window.location.pathname.match(/^\/share\/(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

// Initialize share view (read-only, no chrome)
async function initShareView(bibmapId) {
  // Hide all UI chrome
  document.querySelector('header').hidden = true;
  document.querySelector('main').innerHTML = `
    <div id="share-view">
      <div id="share-header">
        <h1 id="share-title">Loading...</h1>
      </div>
      <div id="bibmap-container" role="application" aria-label="BibMap view">
        <svg id="bibmap-svg" aria-hidden="true">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280"/>
            </marker>
          </defs>
          <g id="connections-layer"></g>
          <g id="nodes-layer"></g>
        </svg>
        <div id="sr-node-list" class="sr-only" role="list" aria-label="BibMap nodes"></div>
      </div>
    </div>
  `;

  try {
    const bibmap = await api.bibmaps.getPublic(bibmapId);
    document.getElementById('share-title').textContent = bibmap.title;
    document.title = `${bibmap.title} - BibMap`;

    // Create canvas in read-only mode
    const canvas = new BibMapCanvas('bibmap-container', {
      onNodeSelect: () => {},
      onConnectionSelect: () => {},
      announce: () => {}
    });

    // Manually set the data and render (without API call since we already have it)
    canvas.bibmapId = bibmapId;
    canvas.nodes = bibmap.nodes || [];
    canvas.connections = bibmap.connections || [];
    canvas.render();
    canvas.setReadOnly(true);
  } catch (err) {
    document.getElementById('share-title').textContent = 'BibMap not found';
    document.getElementById('bibmap-container').innerHTML = `
      <div class="share-error">
        <p>${err.message === 'This bib map is not published' ? 'This BibMap is not published or does not exist.' : err.message}</p>
        <a href="/">Go to BibMap</a>
      </div>
    `;
  }
}

// Initialize
async function init() {
  const shareId = getShareId();

  if (shareId) {
    // Share view - minimal UI, read-only
    await initShareView(shareId);
  } else {
    // Normal app view
    setupEventListeners();
    setupTagInput('ref');
    setupTagInput('import');
    setupTagInput('node');
    setupTagInput('media');
    handleOAuthErrors();
    await checkGoogleOAuth();
    await loadUserInfo();
    await loadSettings();
    await loadTaxonomies();
    await loadBibMaps();
    showSection('bibmaps');
  }
}

init().catch(console.error);
