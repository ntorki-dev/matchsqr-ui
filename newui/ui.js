/* ui.js
 * Shared UI helpers for headers, footers, toasts.
 * Surgical update to remove auth flash on refresh:
 * 1) Instant render from localStorage cache
 * 2) Placeholder while checking Supabase session
 * 3) Reconcile and update slot, keep cache in sync with auth state
 */

// Minimal user payload to cache
const AUTH_CACHE_KEY = 'ms_lastKnownUser';

function getCachedUser() {
  try {
    const raw = localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    // Require id at minimum
    if (!parsed.id) return null;
    return parsed;
  } catch (_e) {
    return null;
  }
}

function setCachedUser(user) {
  try {
    if (user && user.id) {
      const payload = {
        id: user.id,
        email: user.email || user.user_metadata?.email || null,
        name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || null
      };
      localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(payload));
    } else {
      localStorage.removeItem(AUTH_CACHE_KEY);
    }
  } catch (_e) {
    // ignore storage errors
  }
}

function createEl(tag, className, html) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (html !== undefined) el.innerHTML = html;
  return el;
}

function avatarImg(src, alt) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt || 'Profile';
  img.className = 'avatar-img';
  img.decoding = 'async';
  img.loading = 'lazy';
  return img;
}

function headerTemplate(leftHtml) {
  const header = createEl('header', 'app-header');
  const left = createEl('div', 'header-left', leftHtml || '');
  const right = createEl('div', 'header-right');
  // The auth slot is what we update as session resolves
  const authSlot = createEl('div', 'auth-slot auth-loading');
  right.appendChild(authSlot);
  header.appendChild(left);
  header.appendChild(right);
  return header;
}

function renderLoginButton() {
  const btn = createEl('a', 'btn btn-primary', 'Login');
  btn.href = '/login.html';
  btn.setAttribute('data-nav', 'login');
  return btn;
}

function renderProfileButton(user) {
  const wrapper = createEl('a', 'profile-btn');
  wrapper.href = '/account.html';
  const img = avatarImg(
    user?.avatar_url || '/assets/avatar-default.png',
    user?.name || user?.email || 'Account'
  );
  const label = createEl('span', 'profile-label', user?.name || 'Account');
  wrapper.appendChild(img);
  wrapper.appendChild(label);
  return wrapper;
}

function replaceAuthSlotEl(slot, newChild) {
  slot.innerHTML = '';
  if (newChild) slot.appendChild(newChild);
  slot.classList.remove('auth-loading');
}

function updateHeaderAuthSlot(user) {
  const slot = document.querySelector('.app-header .auth-slot');
  if (!slot) return;
  if (user && user.id) {
    replaceAuthSlotEl(slot, renderProfileButton(user));
  } else {
    replaceAuthSlotEl(slot, renderLoginButton());
  }
}

// Reconcile session from Supabase, keep cache in sync, update UI only if changed
async function reconcileAuthSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      // keep cache as is, but show login if no cached user
      const cached = getCachedUser();
      updateHeaderAuthSlot(cached);
      return;
    }
    const liveUser = data?.session?.user || null;
    const cached = getCachedUser();
    if ((liveUser?.id || null) !== (cached?.id || null)) {
      setCachedUser(liveUser);
      updateHeaderAuthSlot(liveUser);
    } else {
      // Even if same, remove loading state
      const slot = document.querySelector('.app-header .auth-slot');
      if (slot) slot.classList.remove('auth-loading');
    }
  } catch (_e) {
    const cached = getCachedUser();
    updateHeaderAuthSlot(cached);
  }
}

// Public API: renderHeader
// leftHtml can contain logo or navigation
export function renderHeader(leftHtml) {
  // Build skeleton immediately
  const header = headerTemplate(leftHtml);
  // Mount or replace existing header
  const mount = document.querySelector('#app-header') || document.body;
  // If a container exists, replace its first .app-header, else append
  const existing = document.querySelector('.app-header');
  if (existing && existing.parentElement === mount) {
    existing.replaceWith(header);
  } else {
    // If #app-header is a placeholder element, append inside it
    if (mount.id === 'app-header') {
      mount.innerHTML = '';
      mount.appendChild(header);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }
  }

  // Instant paint from cache
  const cachedUser = getCachedUser();
  if (cachedUser) {
    updateHeaderAuthSlot(cachedUser);
  } else {
    // Keep placeholder hidden, no Login flash
    const slot = header.querySelector('.auth-slot');
    if (slot) slot.classList.add('auth-loading');
  }

  // Reconcile from Supabase
  queueMicrotask(reconcileAuthSession);

  // Subscribe to auth state changes to keep cache and UI in sync
  if (window.__msAuthBound !== true) {
    window.__msAuthBound = true;
    try {
      supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user || null;
        setCachedUser(user);
        updateHeaderAuthSlot(user);
      });
    } catch (_e) {
      // no-op
    }
  }

  return header;
}

// Optional helper for pages that need to know initial user synchronously
export function getLastKnownUser() {
  return getCachedUser();
}
