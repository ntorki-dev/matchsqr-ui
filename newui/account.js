
/**
 * account.js
 */

window.Account = (() => {
  const el = (sel) => document.querySelector(sel);
  const html = String.raw;

  /** Parse query params from location.hash (supports #/route?x=1&y=2) */
  function parseHashQuery() {
    const hash = window.location.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex === -1) return {};
    const query = hash.substring(qIndex + 1);
    const params = new URLSearchParams(query);
    const out = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
  }

  /** Show a notification area inside the target container */
  function setNotice(container, type, message) {
    const host = container.querySelector(".notice") || document.createElement("div");
    host.className = `notice ${type}`; // types: success | error | info
    host.textContent = message;
    if (!host.parentNode) container.prepend(host);
  }

  function clearNotice(container) {
    const host = container.querySelector(".notice");
    if (host) host.remove();
  }

  /** Minor util: compute age from YYYY-MM-DD */
  function ageFromISO(dateStr) {
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return null;
      const today = new Date();
      let age = today.getFullYear() - d.getFullYear();
      const m = today.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
      return age;
    } catch {
      return null;
    }
  }

  /** ensureProfileOnce: checks public.profiles row and inserts if missing */
  async function ensureProfileOnce() {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) return;

      const userId = user.id;
      // Has this already been ensured in this browser?
      const key = `ms_prof_ensured_${userId}`;
      if (localStorage.getItem(key) === "1") return;

      // Check if a profile exists
      const { data: prof, error: selErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (selErr) {
        console.warn("ensureProfileOnce select error:", selErr);
        return;
      }
      if (prof) {
        localStorage.setItem(key, "1");
        return; // already exists
      }

      // Create from user metadata
      const meta = user.user_metadata || {};
      const payload = {
        id: userId,
        name: meta.name || "",
        birthdate: meta.birthdate || null,
        gender: (meta.gender === "man" || meta.gender === "woman" || meta.gender === "other") ? meta.gender : null,
      };

      const { error: insErr } = await supabase.from("profiles").insert(payload);
      if (!insErr) localStorage.setItem(key, "1");
      else console.warn("ensureProfileOnce insert error:", insErr);
    } catch (e) {
      console.warn("ensureProfileOnce error:", e);
    }
  }

  /** attachGuestIfPending: calls edge function convert_guest_to_user if payload exists */
  async function attachGuestIfPending(container) {
    try {
      const raw = localStorage.getItem("ms_attach_payload");
      if (!raw) return;
      const payload = JSON.parse(raw);
      if (!payload?.game_id || !payload?.temp_player_id) return;

      // Verify we have an authenticated user
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes?.user) return;

      // Call edge function
      const { data, error } = await supabase.functions.invoke("convert_guest_to_user", {
        body: { game_id: payload.game_id, temp_player_id: payload.temp_player_id },
      });

      if (error) {
        console.warn("convert_guest_to_user error:", error);
        if (container) setNotice(container, "error", "We couldn't attach your previous session automatically. You can still view your report after your next game.");
      } else {
        if (container) setNotice(container, "success", "Your previous session was attached to your account. You can now receive your full report.");
        localStorage.removeItem("ms_attach_payload");
      }
    } catch (e) {
      console.warn("attachGuestIfPending error:", e);
    }
  }

  /** Login View */
  function renderLogin() {
    const root = el("#app");
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

    const container = root.querySelector(".auth-card");
    const btn = root.querySelector("#btn-login");

    btn.addEventListener("click", async () => {
      clearNotice(container);
      const email = root.querySelector("#login-email").value.trim();
      const password = root.querySelector("#login-password").value;

      if (!email || !password) {
        setNotice(container, "error", "Please enter your email and password.");
        return;
      }

      btn.disabled = true;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      btn.disabled = false;

      if (error) {
        setNotice(container, "error", error.message || "Login failed.");
        return;
      }

      // Ensure profile and attach guest if any
      await ensureProfileOnce();
      await attachGuestIfPending(container);
      window.location.hash = "#/account";
    });
  }

  /** Register View (Male/Female UI -> man/woman saved) */
  function renderRegister() {
    const root = el("#app");
    const q = parseHashQuery();
    // If we came with ?gameId=...&tempPlayerId=..., persist for later attachment
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

    const container = root.querySelector(".auth-card");
    const btn = root.querySelector("#btn-register");

    btn.addEventListener("click", async () => {
      clearNotice(container);
      const name = root.querySelector("#reg-name").value.trim();
      const dob = root.querySelector("#reg-dob").value; // yyyy-mm-dd from native input
      const email = root.querySelector("#reg-email").value.trim();
      const password = root.querySelector("#reg-password").value;
      const consent = root.querySelector("#reg-consent").checked;
      const genderEl = root.querySelector('input[name="gender"]:checked');
      const gender = genderEl ? genderEl.value : null;

      if (!name || !dob || !email || !password || !gender) {
        setNotice(container, "error", "Please complete all fields.");
        return;
      }
      if (password.length < 6) {
        setNotice(container, "error", "Password should be at least 6 characters.");
        return;
      }
      if (!consent) {
        setNotice(container, "error", "You must agree to the Terms and Privacy Policy.");
        return;
      }
      const age = ageFromISO(dob);
      if (age === null || age < 12 || age > 100) {
        setNotice(container, "error", "Please enter a valid date of birth (age must be 12–100).");
        return;
      }

      btn.disabled = true;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, birthdate: dob, gender },
          emailRedirectTo: `${location.origin}/#/account`,
        },
      });
      btn.disabled = false;

      if (error) {
        setNotice(container, "error", error.message || "Registration failed.");
        return;
      }

      // If email confirmation is required, no session is returned
      if (!data.session) {
        setNotice(container, "success", "Check your email to confirm your account. You’ll be redirected to your Account after confirmation.");
      } else {
        // Session exists (confirmation disabled). Ensure profile and attach guest.
        await ensureProfileOnce();
        await attachGuestIfPending(container);
        window.location.hash = "#/account";
      }
    });
  }

  /** Account View (very light) */
  async function renderAccount() {
    const root = el("#app");
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      window.location.hash = "#/login";
      return;
    }

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

    const container = root.querySelector(".auth-card");
    // Make sure profile exists and attach guest if needed
    await ensureProfileOnce();
    await attachGuestIfPending(container);

    root.querySelector("#btn-logout").addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.hash = "#/login";
    });
  }

  /** Public render entry */
  async function render(ctx = {}) {
    const tab = ctx.tab || (location.hash.includes("/register") ? "register" :
                            location.hash.includes("/account") ? "account" : "login");
    if (tab === "register") return renderRegister();
    if (tab === "account") return renderAccount();
    return renderLogin();
  }

  return { render };
})();
