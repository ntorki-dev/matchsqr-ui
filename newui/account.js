/* account.js
 * Account screen renderer with defensive auth check.
 * Fixes: When visiting /#/account while logged out, it should not show "Welcome, Account"
 * or a Logout button. We confirm Supabase session before rendering the protected UI.
 *
 * Public API preserved:
 *   Account.render({ tab?: 'login' | 'account' })
 */

// Simple qs helper
function qs(sel, root) { return (root || document).querySelector(sel); }
function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

// Keep key consistent with ui.js cache to avoid stale headers after logout
const AUTH_CACHE_KEY = 'ms_lastKnownUser';

function clearAuthCache() {
  try { localStorage.removeItem(AUTH_CACHE_KEY); } catch (_) {}
}

function accountSkeleton() {
  return `
    <section class="screen screen-account">
      <div class="container">
        <div class="section-header">
          <h1>Account</h1>
        </div>
        <div class="card">
          <div class="card-content">
            <div class="loading-row">
              <div class="skeleton avatar"></div>
              <div class="skeleton line" style="width: 40%"></div>
            </div>
            <div class="skeleton line" style="width: 60%"></div>
            <div class="skeleton line" style="width: 30%"></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function loginRedirect(nextHash) {
  const encNext = encodeURIComponent(nextHash || '#/account');
  location.hash = `#/login?next=${encNext}`;
}

function renderLoggedOut(root) {
  // If the app has a dedicated login view routed by hash, defer to router via redirect
  loginRedirect('#/account');
  // As a safety net, also show an inline login link in case router is slow
  root.innerHTML = `
    <section class="screen screen-account">
      <div class="container">
        <div class="section-header"><h1>Account</h1></div>
        <div class="card">
          <div class="card-content">
            <p>You need to log in to view your account.</p>
            <p><a class="btn btn-primary" href="#/login?next=%2F#%2Faccount">Go to Login</a></p>
          </div>
        </div>
      </div>
    </section>
  `;
}

function accountTemplate(user) {
  const display = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Account';
  const avatar = user?.user_metadata?.avatar_url || '/assets/avatar-default.png';
  return `
    <section class="screen screen-account">
      <div class="container">
        <div class="section-header">
          <h1>Welcome, ${escapeHtml(display)}</h1>
        </div>

        <div class="card">
          <div class="card-content">
            <div class="profile-row">
              <img class="avatar-img" src="${avatar}" alt="Avatar" width="56" height="56"/>
              <div class="profile-meta">
                <div class="meta-line"><strong>Email:</strong> ${escapeHtml(user?.email || '')}</div>
                ${user?.id ? `<div class="meta-line"><strong>User ID:</strong> ${escapeHtml(user.id)}</div>` : ''}
              </div>
            </div>

            <div class="actions">
              <button id="btnLogout" class="btn">Logout</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function handleLogout() {
  try {
    // Sign out from Supabase
    await supabase.auth.signOut();
  } catch (_) {
    // ignore
  } finally {
    // Clear our local cache used by the header to avoid stale avatar
    clearAuthCache();
    // Redirect to login
    loginRedirect('#/account');
  }
}

async function confirmedSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data?.session?.user || null;
  } catch (_e) {
    return null;
  }
}

// Public API
const Account = {
  /**
   * Render Account screen.
   * - If not authenticated, redirect to #/login and render a simple message.
   * - If authenticated, render profile and a working Logout button.
   */
  async render(_opts = {}) {
    const root = qs('#app') || document.body;
    root.innerHTML = accountSkeleton();

    const user = await confirmedSession();
    if (!user) {
      renderLoggedOut(root);
      return;
    }

    root.innerHTML = accountTemplate(user);
    const btn = qs('#btnLogout', root);
    if (btn) btn.addEventListener('click', handleLogout);
  }
};

export { Account };
export default Account;
