
/**
 * account.js (reverted interface, minimal + correct exposure)
 * Exposes a single global: window.Account.render(ctx)
 * Keeps: Login, Register (Male/Female -> man/woman), Account, ensureProfileOnce, attachGuestIfPending
 */

(function () {
  const html = String.raw;
  const $ = (s) => document.querySelector(s);

  function parseHashQuery() {
    const h = location.hash || "";
    const i = h.indexOf("?");
    if (i === -1) return {};
    const p = new URLSearchParams(h.substring(i + 1));
    const o = {}; for (const [k, v] of p.entries()) o[k] = v; return o;
  }

  function setNotice(container, type, message) {
    let host = container.querySelector(".notice");
    if (!host) { host = document.createElement("div"); container.prepend(host); }
    host.className = `notice ${type}`;
    host.textContent = message;
    host.style.display = "";
  }
  function clearNotice(container) {
    const host = container.querySelector(".notice");
    if (host) host.remove();
  }

  function ageFromISO(dateStr) {
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return null;
      const t = new Date();
      let a = t.getFullYear() - d.getFullYear();
      const m = t.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
      return a;
    } catch { return null; }
  }

  async function ensureProfileOnce() {
    try {
      const { data: ur } = await supabase.auth.getUser();
      const user = ur?.user; if (!user) return;
      const key = `ms_prof_ensured_${user.id}`;
      if (localStorage.getItem(key) === "1") return;

      const { data: prof, error: selErr } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (selErr) { console.warn("ensureProfileOnce select error:", selErr); return; }
      if (prof) { localStorage.setItem(key, "1"); return; }

      const meta = user.user_metadata || {};
      const payload = {
        id: user.id,
        name: meta.name || "",
        birthdate: meta.birthdate || null,
        gender: (meta.gender === "man" || meta.gender === "woman" || meta.gender === "other") ? meta.gender : null,
      };
      const { error: insErr } = await supabase.from("profiles").insert(payload);
      if (!insErr) localStorage.setItem(key, "1"); else console.warn("ensureProfileOnce insert error:", insErr);
    } catch (e) { console.warn("ensureProfileOnce error:", e); }
  }

  async function attachGuestIfPending(container) {
    try {
      const raw = localStorage.getItem("ms_attach_payload");
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload?.game_id || !payload?.temp_player_id) return;

      const { data: ur } = await supabase.auth.getUser();
      if (!ur?.user) return;

      const { error } = await supabase.functions.invoke("convert_guest_to_user", {
        body: { game_id: payload.game_id, temp_player_id: payload.temp_player_id },
      });
      if (error) {
        console.warn("convert_guest_to_user error:", error);
        if (container) setNotice(container, "error", "We couldn't attach your previous session automatically. You can still view your report after your next game.");
      } else {
        if (container) setNotice(container, "success", "Your previous session was attached to your account. You can now receive your full report.");
        localStorage.removeItem("ms_attach_payload");
      }
    } catch (e) { console.warn("attachGuestIfPending error:", e); }
  }

  function renderLogin() {
    const root = $("#app");
    root.innerHTML = html`
      <section class="auth auth-login">
        <h2>Login</h2>
        <div class="auth-card">
          <div class="notice" style="display:none;"></div>
          <label>Email
            <input id="login-email" type="email" placeholder="you@example.com" autocomplete="email"/>
          </label>
          <label>Password
            <input id="login-password" type="password" placeholder="••••••••" autocomplete="current-password"/>
          </label>
          <button id="btn-login">Login</button>
          <p class="muted">Don’t have an account? <a href="#/register">Create one</a></p>
        </div>
      </section>
    `;

    const c = root.querySelector(".auth-card");
    $("#btn-login").addEventListener("click", async () => {
      clearNotice(c);
      const email = $("#login-email").value.trim();
      const password = $("#login-password").value;
      if (!email || !password) { setNotice(c, "error", "Please enter your email and password."); return; }
      const btn = $("#btn-login"); btn.disabled = true;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      btn.disabled = false;
      if (error) { setNotice(c, "error", error.message || "Login failed."); return; }
      await ensureProfileOnce();
      await attachGuestIfPending(c);
      location.hash = "#/account";
    });
  }

  function renderRegister() {
    const root = $("#app");
    const q = parseHashQuery();
    if (q.gameId && q.tempPlayerId) {
      localStorage.setItem("ms_attach_payload", JSON.stringify({ game_id: q.gameId, temp_player_id: q.tempPlayerId }));
    }

    root.innerHTML = html`
      <section class="auth auth-register">
        <h2>Hey, happy to see you!</h2>
        <div class="auth-card">
          <div class="notice" style="display:none;"></div>

          <div class="grid two">
            <label>Name
              <input id="reg-name" type="text" placeholder="Your name"/>
            </label>
            <label>Date of birth
              <input id="reg-dob" type="date" placeholder="DD-MM-YYYY"/>
              <small class="muted">DD-MM-YYYY (we’ll convert on submit)</small>
            </label>
          </div>

          <div class="grid two">
            <fieldset class="gender">
              <legend>Gender</legend>
              <label><input type="radio" name="gender" value="man"/> Male</label>
              <label><input type="radio" name="gender" value="woman"/> Female</label>
            </fieldset>

            <div>
              <label>Email
                <input id="reg-email" type="email" placeholder="you@example.com" autocomplete="email"/>
              </label>
            </div>
          </div>

          <label>Password
            <input id="reg-password" type="password" placeholder="At least 6 characters" autocomplete="new-password"/>
          </label>

          <label class="consent">
            <input id="reg-consent" type="checkbox"/> I agree to the Terms and Privacy Policy
          </label>

          <button id="btn-register">Submit</button>

          <p class="muted">Already have an account? <a href="#/login">Login</a></p>
        </div>
      </section>
    `;

    const c = root.querySelector(".auth-card");
    $("#btn-register").addEventListener("click", async () => {
      clearNotice(c);
      const name = $("#reg-name").value.trim();
      const dob = $("#reg-dob").value;
      const email = $("#reg-email").value.trim();
      const password = $("#reg-password").value;
      const consent = $("#reg-consent").checked;
      const genderEl = root.querySelector('input[name="gender"]:checked');
      const gender = genderEl ? genderEl.value : null;

      if (!name || !dob || !email || !password || !gender) { setNotice(c, "error", "Please complete all fields."); return; }
      if (password.length < 6) { setNotice(c, "error", "Password should be at least 6 characters."); return; }
      if (!consent) { setNotice(c, "error", "You must agree to the Terms and Privacy Policy."); return; }
      const age = ageFromISO(dob);
      if (age === null || age < 12 || age > 100) { setNotice(c, "error", "Please enter a valid date of birth (age must be 12–100)."); return; }

      const btn = $("#btn-register"); btn.disabled = true;
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: { name, birthdate: dob, gender },
          emailRedirectTo: `${location.origin}/#/account`,
        },
      });
      btn.disabled = false;

      if (error) { setNotice(c, "error", error.message || "Registration failed."); return; }

      if (!data.session) {
        setNotice(c, "success", "Check your email to confirm your account. You’ll be redirected to your Account after confirmation.");
      } else {
        await ensureProfileOnce();
        await attachGuestIfPending(c);
        location.hash = "#/account";
      }
    });
  }

  async function renderAccount() {
    const root = $("#app");
    const { data: ur } = await supabase.auth.getUser();
    const user = ur?.user;
    if (!user) { location.hash = "#/login"; return; }

    root.innerHTML = html`
      <section class="auth auth-account">
        <h2>Your Account</h2>
        <div class="auth-card">
          <div class="notice" style="display:none;"></div>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Name:</strong> ${user.user_metadata?.name || ""}</p>
          <p><strong>Gender:</strong> ${user.user_metadata?.gender || ""}</p>
          <p><strong>Birthdate:</strong> ${user.user_metadata?.birthdate || ""}</p>
          <button id="btn-logout">Logout</button>
        </div>
      </section>
    `;

    const c = root.querySelector(".auth-card");
    await ensureProfileOnce();
    await attachGuestIfPending(c);

    $("#btn-logout").addEventListener("click", async () => {
      await supabase.auth.signOut();
      location.hash = "#/login";
    });
  }

  async function render(ctx = {}) {
    const tab =
      ctx.tab ||
      (location.hash.includes("/register") ? "register" :
       location.hash.includes("/account") ? "account" : "login");
    if (tab === "register") return renderRegister();
    if (tab === "account") return renderAccount();
    return renderLogin();
  }

  // ***** Critical: expose exactly what app.core.js expects *****
  window.Account = { render };
})();
