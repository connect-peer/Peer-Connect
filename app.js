/*
 * Peer Connect app.js
 * ------------------------------------------------------------
 * All behavior lives in this file. There is no framework and no build step.
 * Supabase handles Auth, profiles, verified tutors, private verification files,
 * connections, doubts, and answers.
 *
 * Map of this file (search for these names):
 *   STATE        tutors, posts, sent, user, mine, fSub, fSort, openR
 *   TUTORS PAGE  drawChips(), draw()
 *   PRICING      Student/tutor free; optional one-time tutor Blue Tick is planned
 *   SIGN IN      paintSign(), openSign()    (Supabase email and Google Auth)
 *   TUTOR FORM   openTutor()                (creates a tutor profile)
 *   DOUBTS PAGE  who(), hasBlue(), postHtml(), drawFeed()
 *   MY PAGE      drawMe()
 *   ROUTER       route()                    (hash routes include #dashboard for tutors)
 *
 * Data shapes:
 *   tutor = { n, g, s:[subjects], h, r, x, m, c, me?, blue? }
 *   post  = { id, n, g, sub, t, ago, likes, liked?, rep:[{ n, t }] }
 */
var BT =
  ' <svg width="18" height="18" viewBox="0 0 24 24" role="img" aria-label="Blue tick"><circle cx="12" cy="12" r="11" fill="#1D9BF0"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var tutors = [];
var subjects = ["All"].concat(
  Array.from(
    new Set(
      tutors.reduce(function (a, t) {
        return a.concat(t.s);
      }, []),
    ),
  ),
);
var active = "All",
  query = "",
  sent = {},
  tutorState = "",
  tutorCity = "";
var grid = document.getElementById("grid"),
  chips = document.getElementById("chips");
function ini(n) {
  return n
    .split(" ")
    .map(function (w) {
      return w[0];
    })
    .join("");
}
function esc(s) {
  return s.replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
function drawChips() {
  chips.innerHTML = subjects
    .map(function (s) {
      return (
        '<button class="chip" aria-pressed="' +
        (s === active) +
        '" data-s="' +
        s +
        '">' +
        s +
        "</button>"
      );
    })
    .join("");
}
function draw() {
  var list = tutors.filter(function (t) {
    var okS = active === "All" || t.s.indexOf(active) > -1;
    var hay = (t.n + " " + t.h + " " + t.s.join(" ") + " " + [t.school, t.city, t.state, t.country].filter(Boolean).join(" ")).toLowerCase();
    return okS && hay.indexOf(query.toLowerCase()) > -1 &&
      (!tutorState || t.state === tutorState) && (!tutorCity || t.city === tutorCity);
  });
  list.sort(function (a, b) {
    return (b.blue ? 1 : 0) - (a.blue ? 1 : 0);
  });
  document.getElementById("count").textContent = list.length + (list.length === 1 ? " verified tutor" : " verified tutors");
  if (!list.length) {
    grid.innerHTML = tutors.length
      ? '<div class="empty">No tutors match. Try another subject or a shorter search.</div>'
      : '<div class="empty">No tutor profiles have been approved for search yet.</div>';
    return;
  }
  grid.innerHTML = list
    .map(function (t) {
      var i = tutors.indexOf(t),
        done = sent[t.user_id] || t.me;
      return (
        '<article class="card" data-profile-index="' + i + '" tabindex="0" aria-label="View ' + esc(t.n) + ' tutor profile"><div class="cover" style="--c:' +
        t.c +
        '"></div><div class="body">' +
        '<div class="av">' +
        ini(t.n) +
        "</div>" +
        '<h3><span class="tutor-name">' +
        esc(t.n) +
        (t.blue ? BT : "") +
        (t.verified ? ' <span class="verify-badge">Verified</span>' : '') +
        '</span><span class="tutor-online" title="Available"></span></h3>' +
        '<div class="sub">' +
        esc(t.g) + " · " + esc(t.h) + '<br>' + esc([t.school, t.city, t.state].filter(Boolean).join(" · ")) +
        "</div>" +
        '<div class="tags">' +
        t.s
          .map(function (s) {
            return '<span class="tag">' + s + "</span>";
          })
          .join("") +
        "</div>" +
        '<button class="btn' +
        (done ? " ghost" : "") +
        '" data-i="' +
        i +
        '"' +
        (done ? " disabled" : "") +
        ">" +
        (t.me ? "Your profile" : done ? "Request sent" : "Connect") +
        "</button>" +
        "</div></article>"
      );
    })
    .join("");
}
chips.addEventListener("click", function (e) {
  var b = e.target.closest(".chip");
  if (!b) return;
  active = b.dataset.s;
  drawChips();
  draw();
});
document.getElementById("q").addEventListener("input", function (e) {
  query = e.target.value;
  draw();
});
function setLocationOptions(select, values, emptyLabel, selected) {
  if (!select) return;
  select.innerHTML = '<option value="">' + emptyLabel + '</option>' + values.map(function (value) {
    return '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(value) + '</option>';
  }).join("");
}
function drawTutorLocationFilters() {
  var states = Array.from(new Set(tutors.map(function (t) { return t.state; }).filter(Boolean))).sort();
  var cities = Array.from(new Set(tutors.filter(function (t) { return !tutorState || t.state === tutorState; }).map(function (t) { return t.city; }).filter(Boolean))).sort();
  if (states.indexOf(tutorState) < 0) tutorState = "";
  if (cities.indexOf(tutorCity) < 0) tutorCity = "";
  setLocationOptions(document.getElementById("tutorStateFilter"), states, "All states", tutorState);
  setLocationOptions(document.getElementById("tutorCityFilter"), cities, "All cities", tutorCity);
}
document.getElementById("tutorStateFilter").addEventListener("change", function (event) {
  tutorState = event.target.value;
  tutorCity = "";
  drawTutorLocationFilters();
  draw();
});
document.getElementById("tutorCityFilter").addEventListener("change", function (event) {
  tutorCity = event.target.value;
  draw();
});
grid.addEventListener("click", async function (e) {
  var b = e.target.closest("button[data-i]");
  if (!b) {
    var card = e.target.closest("[data-profile-index]");
    if (card) showTutorProfile(tutors[Number(card.dataset.profileIndex)]);
    return;
  }
  if (b.disabled) return;
  if (!user) {
    openSign();
    return;
  }
  if (user.role !== "student") {
    document.getElementById("count").textContent =
      "Student accounts can send connection requests.";
    return;
  }
  var tutor = tutors[Number(b.dataset.i)];
  var result = await supabaseClient.from("connections").insert({
    requester_id: user.id,
    recipient_id: tutor.user_id,
  });
  if (result.error) {
    document.getElementById("count").textContent = authErrorText(result.error);
    return;
  }
  sent[tutor.user_id] = true;
  draw();
});
grid.addEventListener("keydown", function (e) {
  var card = e.target.closest("[data-profile-index]");
  if (!card || e.target.closest("button")) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showTutorProfile(tutors[Number(card.dataset.profileIndex)]); }
});

async function showTutorProfile(tutor) {
  if (!tutor) return;
  var locationText = [tutor.school, tutor.city, tutor.state, tutor.country].filter(Boolean).join(" · ");
  dbody.innerHTML = '<div class="profile-cover"></div><section class="profile-head"><div class="av">' + esc(ini(tutor.n)) + '</div><h2>' + esc(tutor.n) + (tutor.verified ? ' <span class="verify-badge">Verified</span>' : '') + '</h2><div class="profile-meta">' + esc(tutor.g) + ' · ' + esc(locationText) + '</div><p>' + esc(tutor.h) + '</p><div class="tags">' + tutor.s.map(function (subject) { return '<span class="tag">' + esc(subject) + '</span>'; }).join("") + '</div><button class="btn" id="profileConnect" ' + ((sent[tutor.user_id] || tutor.me) ? 'disabled' : '') + '>' + (tutor.me ? 'Your profile' : sent[tutor.user_id] ? 'Request sent' : 'Connect') + '</button></section><div class="profile-tabs"><button class="btn ghost" data-profile-tab="about" aria-pressed="true">About</button><button class="btn ghost" data-profile-tab="answers" aria-pressed="false">Answers</button></div><div class="profile-content" id="profileContent"><h3>About</h3><p>' + esc(tutor.h || 'Student tutor') + '</p><p class="muted">School: ' + esc(tutor.school || '—') + '<br>Location: ' + esc([tutor.city, tutor.state, tutor.country].filter(Boolean).join(', ') || '—') + '</p></div>';
  if (!dlg.open) dlg.showModal();
  document.getElementById("profileConnect").onclick = async function () {
    if (!user) { openSign(); return; }
    if (user.role !== "student") { document.getElementById("profileContent").textContent = "Student accounts can send connection requests."; return; }
    var result = await supabaseClient.from("connections").insert({ requester_id: user.id, recipient_id: tutor.user_id });
    if (result.error) { document.getElementById("profileContent").textContent = authErrorText(result.error); return; }
    sent[tutor.user_id] = true;
    this.disabled = true;
    this.textContent = "Request sent";
    draw();
  };
  dbody.querySelectorAll("[data-profile-tab]").forEach(function (button) {
    button.onclick = async function () {
      dbody.querySelectorAll("[data-profile-tab]").forEach(function (tab) { tab.setAttribute("aria-pressed", String(tab === button)); });
      var content = document.getElementById("profileContent");
      if (button.dataset.profileTab === "about") {
        content.innerHTML = '<h3>About</h3><p>' + esc(tutor.h || 'Student tutor') + '</p><p class="muted">School: ' + esc(tutor.school || '—') + '<br>Location: ' + esc([tutor.city, tutor.state, tutor.country].filter(Boolean).join(', ') || '—') + '</p>';
        return;
      }
      content.innerHTML = '<p class="muted">Loading answers…</p>';
      var result = await supabaseClient.from("answers").select("content, created_at, doubts(title, subject)").eq("author_id", tutor.user_id).order("created_at", { ascending: false }).limit(10);
      if (result.error) { content.innerHTML = '<p class="muted">Answers are unavailable right now.</p>'; return; }
      content.innerHTML = (result.data || []).length ? '<h3>Recent answers</h3>' + result.data.map(function (answer) { var doubt = Array.isArray(answer.doubts) ? answer.doubts[0] : answer.doubts || {}; return '<article class="box"><b>' + esc(doubt.subject || 'Answer') + '</b><p>' + esc(answer.content || '') + '</p>' + (doubt.title ? '<p class="muted">On: ' + esc(doubt.title) + '</p>' : '') + '</article>'; }).join("") : '<p class="muted">No answers yet.</p>';
    };
  });
}

async function loadTutorDirectory() {
  if (!supabaseClient || !user) return;
  var result = await supabaseClient.rpc("get_verified_tutor_directory", { p_state: null, p_city: null });
  if (result.error) {
    document.getElementById("count").textContent = authErrorText(result.error);
    return;
  }
  tutors = (result.data || []).map(function (row) {
    return {
      user_id: row.user_id,
      n: row.display_name || "Peer Connect tutor",
      g: row.grade ? "Class " + row.grade : "Student tutor",
      s: row.subjects || [],
      h: row.headline || "Peer tutor",
      school: row.school || "",
      city: row.city || "",
      state: row.state || "",
      country: row.country || "",
      verified: !!row.verified,
      c: "#2B4EFF",
      me: row.user_id === user.id,
    };
  });
  subjects = ["All"].concat(
    Array.from(new Set(tutors.reduce(function (all, tutor) {
      return all.concat(tutor.s);
    }, []))),
  );
  drawChips();
  drawTutorLocationFilters();
  draw();
}

async function loadStudentConnections() {
  if (!supabaseClient || !user || user.role !== "student") return;
  var result = await supabaseClient.from("connections")
    .select("recipient_id, status")
    .eq("requester_id", user.id);
  if (!result.error) {
    sent = {};
    (result.data || []).forEach(function (row) {
      if (row.status === "pending" || row.status === "accepted") sent[row.recipient_id] = true;
    });
    draw();
  }
}
drawChips();
draw();

var dlg = document.getElementById("dlg"),
  dbody = document.getElementById("dbody");

var user = null,
  gs = document.getElementById("gsign"),
  supabaseClient = null,
  onboardingOpen = false,
  passwordRecoveryPending = false;
var isVerificationAdmin = false;
var studentEntryPending = true;
var G =
  '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.5-4.2 7-10.3 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

function paintSign() {
  if (!gs) return;
  if (user) {
    gs.className = "btn ghost";
    gs.innerHTML =
      '<span class="ini2">' +
      esc(ini(user.n)) +
      "</span> " +
      esc(user.n.split(" ")[0]);
  } else {
    gs.className = "btn gbtn";
    gs.textContent = "Sign up / Sign in";
  }
}

async function restoreAuthSession() {
  var params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  passwordRecoveryPending = params.get("type") === "recovery";
  var accessToken = params.get("access_token");
  var refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    var restored = await supabaseClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (restored.error) {
      console.error("Could not restore Peer Connect session:", restored.error.message);
      dbody.innerHTML = '<h3 id="dt">Google sign-in did not finish</h3><p class="muted">Please start sign-in again. If it keeps happening, send us the error: ' + esc(restored.error.message) + '</p><button class="btn" id="retryAuth">Try again</button>';
      if (!dlg.open) dlg.showModal();
      document.getElementById("retryAuth").onclick = function () { dlg.close(); openSign(); };
      return null;
    }
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    return restored.data.session;
  }
  var current = await supabaseClient.auth.getSession();
  if (current.error) console.error("Could not restore Peer Connect session:", current.error.message);
  return current.data.session;
}

async function syncAuthUser(authUser) {
  if (!authUser) {
    user = null;
    isVerificationAdmin = false;
    studentEntryPending = true;
    posts = [];
    openR = {};
    paintSign();
    paintRoleUI();
    drawFeed();
    if (typeof drawMe === "function" && curRoute === "me") drawMe();
    return;
  }
  var name =
    (authUser.user_metadata &&
      (authUser.user_metadata.display_name ||
        authUser.user_metadata.full_name ||
        authUser.user_metadata.name)) ||
    (authUser.email ? authUser.email.split("@")[0] : "Student");
  var profileResult = null;
  if (supabaseClient) {
    profileResult = await supabaseClient
      .from("profiles")
      .select("display_name, role, grade")
      .eq("id", authUser.id)
      .maybeSingle();
    if (!profileResult.error && profileResult.data && profileResult.data.display_name) {
      name = profileResult.data.display_name;
    }
  }
  var locationResult = supabaseClient ? await supabaseClient.from("profile_locations")
    .select("city, state, country, school").eq("user_id", authUser.id).maybeSingle() : null;
  user = {
    id: authUser.id,
    n: name,
    e: authUser.email || "",
    role: profileResult && profileResult.data ? profileResult.data.role : null,
    grade: profileResult && profileResult.data ? profileResult.data.grade : null,
    location: locationResult && !locationResult.error ? locationResult.data : null,
  };
  var adminResult = await supabaseClient.from("verification_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  isVerificationAdmin = !adminResult.error && !!adminResult.data;
  paintSign();
  paintRoleUI();
  if ((!user.role || !user.grade || missingProfileLocation(user.location)) && !onboardingOpen) openOnboarding(false);
  if (user.role) loadTutorDirectory();
  if (user.role === "student") loadStudentConnections();
  if (curRoute === "dashboard" && user.role === "tutor") drawTutorDashboard();
  if (typeof drawMe === "function" && curRoute === "me") drawMe();
  route();
}

function authErrorText(error) {
  return error && error.message ? error.message : "Something went wrong. Please try again.";
}
function missingProfileLocation(location) {
  return !location || [location.school, location.city, location.state, location.country].some(function (value) {
    return !value || String(value).trim() === "" || String(value).toLowerCase() === "not set";
  });
}

function showPasswordResetForm(email) {
  dlg.classList.remove("auth-screen");
  dbody.innerHTML =
    '<h3 id="dt">Reset your password</h3>' +
    '<p style="color:var(--muted);margin:6px 0 12px">We’ll email you a secure link to choose a new password.</p>' +
    '<label for="resetEmail">Email</label><input id="resetEmail" type="email" autocomplete="email" placeholder="you@example.com" value="' + esc(email || "") + '">' +
    '<div class="err" id="resetErr" role="alert"></div>' +
    '<button class="btn gfull" id="sendReset">Send reset link</button>' +
    '<button class="btn ghost gfull" id="backToSignIn">Back to sign in</button>';
  if (!dlg.open) dlg.showModal();
  document.getElementById("backToSignIn").onclick = function () {
    showAuthForm("signin");
  };
  document.getElementById("sendReset").onclick = async function () {
    var button = document.getElementById("sendReset");
    var message = document.getElementById("resetErr");
    var resetEmail = document.getElementById("resetEmail").value.trim();
    if (!resetEmail) {
      message.textContent = "Enter the email address for your account.";
      return;
    }
    button.disabled = true;
    button.textContent = "Sending…";
    message.textContent = "";
    try {
      var result = await supabaseClient.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (result.error) message.textContent = authErrorText(result.error);
      else message.textContent = "If an account uses that email, a reset link is on its way. Check your inbox and spam folder.";
    } catch (error) {
      message.textContent = authErrorText(error);
    } finally {
      button.disabled = false;
      button.textContent = "Send reset link";
    }
  };
}

function showPasswordUpdateForm() {
  dlg.classList.remove("auth-screen");
  dbody.innerHTML =
    '<h3 id="dt">Choose a new password</h3>' +
    '<p style="color:var(--muted);margin:6px 0 12px">Use at least 8 characters.</p>' +
    '<label for="newPassword">New password</label><input id="newPassword" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters">' +
    '<div class="err" id="passwordUpdateErr" role="alert"></div>' +
    '<button class="btn gfull" id="saveNewPassword">Save new password</button>';
  if (!dlg.open) dlg.showModal();
  document.getElementById("saveNewPassword").onclick = async function () {
    var button = document.getElementById("saveNewPassword");
    var message = document.getElementById("passwordUpdateErr");
    var password = document.getElementById("newPassword").value;
    if (password.length < 8) {
      message.textContent = "Use a password with at least 8 characters.";
      return;
    }
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      var result = await supabaseClient.auth.updateUser({ password: password });
      if (result.error) message.textContent = authErrorText(result.error);
      else {
        dlg.close();
        await syncAuthUser(result.data.user);
      }
    } catch (error) {
      message.textContent = authErrorText(error);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = "Save new password";
      }
    }
  };
}

function showAuthForm(mode) {
  var signingUp = mode === "signup";
  dlg.classList.add("auth-screen");
  dbody.innerHTML =
    '<section class="auth-form-panel"><h3 id="dt">' + (signingUp ? "Create your account" : "Sign in") + '</h3>' +
    '<p style="color:var(--muted);margin:6px 0 12px">' +
    (signingUp ? "Start with email and password, then finish your profile." : "Use your email and password to sign in.") +
    '</p>' +
    (signingUp
      ? '<label for="authName">Name</label><input id="authName" autocomplete="name" placeholder="Your name">'
      : "") +
    '<label for="authEmail">Email</label><input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com">' +
    '<label for="authPassword">Password</label><input id="authPassword" type="password" minlength="8" autocomplete="' +
    (signingUp ? "new-password" : "current-password") +
    '" placeholder="' + (signingUp ? "At least 8 characters" : "Your password") + '">' +
    '<div class="err" id="authErr" role="alert"></div>' +
    '<button class="btn gfull" id="emailSubmit">' + (signingUp ? "Create account" : "Sign in") + '</button>' +
    '<div class="auth-separator">or</div>' +
    '<button class="btn gbtn gfull" id="googleSignIn">' + G + " Continue with Google</button>" +
    '<p class="note auth-switch">' +
    (signingUp
      ? 'Already have an account? <button class="text-button" id="switchAuth">Sign in</button>'
      : 'New to Peer Connect? <button class="text-button" id="switchAuth">Create an account</button>') +
    (signingUp ? "" : '<br><button class="text-button" id="forgotPassword">Forgot password?</button>') +
    '</p></section>' +
    '<aside class="auth-brand-panel" aria-label="About Peer Connect"><div class="auth-brand-top"><span class="auth-brand-mark">P</span>Peer Connect</div>' +
    '<div class="auth-brand-copy"><div class="auth-brand-eyebrow">Learn together, move forward</div><h2>Good guidance starts peer to peer.</h2>' +
    '<p>Meet students who understand your classes, questions, and goals. Share what you know and get unstuck together.</p>' +
    '<div class="auth-feature-stack"><div class="auth-feature"><b>◎</b><span><strong>Find a tutor</strong> who knows your subject</span></div>' +
    '<div class="auth-feature"><b>↗</b><span><strong>Ask a doubt</strong> and learn from the community</span></div>' +
    '<div class="auth-feature"><b>✓</b><span><strong>Build connections</strong> around learning</span></div></div></div>' +
    '<div class="auth-brand-foot">A student peer-learning community</div></aside>';
  if (!dlg.open) dlg.showModal();
  document.getElementById("switchAuth").onclick = function () {
    showAuthForm(signingUp ? "signin" : "signup");
  };
  var forgotPassword = document.getElementById("forgotPassword");
  if (forgotPassword) {
    forgotPassword.onclick = function () {
      showPasswordResetForm(document.getElementById("authEmail").value.trim());
    };
  }
  document.getElementById("emailSubmit").onclick = async function () {
    var button = document.getElementById("emailSubmit");
    var email = document.getElementById("authEmail").value.trim();
    var password = document.getElementById("authPassword").value;
    var message = document.getElementById("authErr");
    if (!email || !password) {
      message.textContent = "Enter your email and password.";
      return;
    }
    if (signingUp) {
      var name = document.getElementById("authName").value.trim();
      if (!name) {
        message.textContent = "Enter your name.";
        return;
      }
      if (password.length < 8) {
        message.textContent = "Use a password with at least 8 characters.";
        return;
      }
    }
    button.disabled = true;
    button.textContent = signingUp ? "Creating account…" : "Signing in…";
    message.textContent = "";
    try {
      if (signingUp) {
        var signup = await supabaseClient.auth.signUp({
          email: email,
          password: password,
          options: {
            data: { display_name: name },
            emailRedirectTo: window.location.origin + window.location.pathname,
          },
        });
        if (signup.error) {
          message.textContent = authErrorText(signup.error);
        } else if (signup.data.session) {
          dlg.close();
          await syncAuthUser(signup.data.user);
        } else {
          message.textContent = "Account created. Check your email to confirm it, then return here to sign in.";
        }
      } else {
        var signin = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
        if (signin.error) message.textContent = authErrorText(signin.error);
        else if (signin.data && signin.data.user) {
          dlg.close();
          await syncAuthUser(signin.data.user);
        }
        else message.textContent = "Sign-in finished without a user session. Please try again.";
      }
    } catch (error) {
      message.textContent = authErrorText(error);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = signingUp ? "Create account" : "Sign in";
      }
    }
  };
  document.getElementById("googleSignIn").onclick = async function () {
    var result = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (result.error) document.getElementById("authErr").textContent = authErrorText(result.error);
  };
}

function openSign() {
  if (!supabaseClient) {
    dlg.classList.remove("auth-screen");
    dbody.innerHTML =
      '<h3 id="dt">Sign-in is not configured</h3><p style="color:var(--muted)">Add the Supabase project settings in supabase-config.js, then reload this page.</p><div class="row"><button class="btn" id="cx">Close</button></div>';
    dlg.showModal();
    document.getElementById("cx").onclick = function () { dlg.close(); };
    return;
  }
  if (user && (!user.role || !user.grade)) {
    openOnboarding(false);
    return;
  }
  if (user) {
    dlg.classList.remove("auth-screen");
    dbody.innerHTML =
      '<h3 id="dt">Your Peer Connect account</h3><p style="color:var(--muted)">' +
      esc(user.n) +
      "<br>" +
      esc(user.e) +
      (user.role
        ? "<br>Account type: " + (user.role === "tutor" ? "Tutor" : "Student")
        : "") +
      '</p><div class="row"><button class="btn ghost" id="cx">Close</button><button class="btn" id="so">Sign out</button></div>';
    dlg.showModal();
    document.getElementById("cx").onclick = function () { dlg.close(); };
    document.getElementById("so").onclick = async function () {
      var result = await supabaseClient.auth.signOut();
      if (result.error) {
        var message = document.getElementById("authErr");
        if (message) message.textContent = authErrorText(result.error);
        return;
      }
      dlg.close();
    };
    return;
  }
  showAuthForm("signin");
}

function openOnboarding(changeRole) {
  if (!user || !supabaseClient || onboardingOpen) return;
  dlg.classList.remove("auth-screen");
  onboardingOpen = true;
  var selectedRole = changeRole ? "" : (user.role || "");
  var savedLocation = user.location || {};
  var rolePicker = (!user.role || changeRole)
    ? '<label>Choose your account type</label><div class="role-options"><button type="button" class="role-option' + (selectedRole === "student" ? " selected" : "") + '" data-role="student"><strong>Student</strong><span>Find tutors, ask questions, and connect without monthly limits.</span></button><button type="button" class="role-option' + (selectedRole === "tutor" ? " selected" : "") + '" data-role="tutor"><strong>Tutor</strong><span>Build a tutor profile, manage requests, and help students.</span></button></div>'
    : '<p class="muted">Account type: ' + esc(user.role === "tutor" ? "Tutor" : "Student") + '</p>';
  dbody.innerHTML =
    '<h3 id="dt">Set up your profile</h3><p style="color:var(--muted);margin:6px 0 14px">Add your school and location so you can find peers nearby. Students’ location details are shared only with a tutor after they send you a request.</p>' +
    '<label for="profileName">Name</label><input id="profileName" autocomplete="name" value="' + esc(user.n) + '">' +
    '<label for="profileGrade">Class</label><select id="profileGrade"><option value="">Choose your class</option>' +
    [9, 10, 11, 12].map(function (grade) {
      return '<option value="' + grade + '"' + (Number(user.grade) === grade ? " selected" : "") + '>Class ' + grade + '</option>';
    }).join("") +
    '</select><label for="profileSchool">School</label><input id="profileSchool" maxlength="180" autocomplete="organization" value="' + esc(savedLocation.school || "") + '" placeholder="Your school name">' +
    '<label for="profileCity">City</label><input id="profileCity" maxlength="100" autocomplete="address-level2" value="' + esc(savedLocation.city || "") + '">' +
    '<label for="profileState">State</label><input id="profileState" maxlength="100" autocomplete="address-level1" value="' + esc(savedLocation.state || "") + '">' +
    '<label for="profileCountry">Country</label><input id="profileCountry" maxlength="100" autocomplete="country-name" value="' + esc(savedLocation.country || "") + '">' +
    rolePicker + '<div class="err" id="profileErr" role="alert"></div>' +
    '<div class="row"><button class="btn ghost" id="cancelProfile">Cancel</button><button class="btn" id="saveProfile">Continue</button></div>';
  if (!dlg.open) dlg.showModal();
  document.getElementById("cancelProfile").onclick = function () { dlg.close(); };
  dbody.querySelectorAll("[data-role]").forEach(function (button) {
    button.onclick = function () {
      selectedRole = button.dataset.role;
      dbody.querySelectorAll("[data-role]").forEach(function (option) {
        option.classList.toggle("selected", option.dataset.role === selectedRole);
      });
    };
  });
  document.getElementById("saveProfile").onclick = async function () {
    var name = document.getElementById("profileName").value.trim();
    var grade = Number(document.getElementById("profileGrade").value);
    var school = document.getElementById("profileSchool").value.trim();
    var city = document.getElementById("profileCity").value.trim();
    var state = document.getElementById("profileState").value.trim();
    var country = document.getElementById("profileCountry").value.trim();
    var message = document.getElementById("profileErr");
    if (!name || !grade || !selectedRole || !school || !city || !state || !country) {
      message.textContent = "Add your name, class, school, city, state, country, and account type.";
      return;
    }
    var result = await supabaseClient.from("profiles")
      .update({ display_name: name, grade: grade, role: selectedRole })
      .eq("id", user.id)
      .select("id")
      .single();
    if (result.error) {
      message.textContent = authErrorText(result.error);
      return;
    }
    var locationSave = await supabaseClient.from("profile_locations").upsert({ user_id: user.id, school: school, city: city, state: state, country: country });
    if (locationSave.error) {
      message.textContent = authErrorText(locationSave.error) + " — run the Peer Connect setup SQL first.";
      return;
    }
    user.n = name;
    user.grade = grade;
    user.role = selectedRole;
    user.location = { school: school, city: city, state: state, country: country };
    onboardingOpen = false;
    paintSign();
    paintRoleUI();
    dlg.close();
    await loadTutorDirectory();
    if (selectedRole === "student") await loadStudentConnections();
    if (selectedRole === "tutor") openTutor();
    else {
      location.hash = "home";
      route();
    }
  };
}

gs.addEventListener("click", openSign);
paintSign();

if (
  window.supabase &&
  window.STUDYLINK_SUPABASE_URL &&
  window.STUDYLINK_SUPABASE_PUBLISHABLE_KEY
) {
  supabaseClient = window.supabase.createClient(
    window.STUDYLINK_SUPABASE_URL,
    window.STUDYLINK_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    },
  );
  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    window.setTimeout(async function () {
      await syncAuthUser(session ? session.user : null);
      if (_event === "PASSWORD_RECOVERY") showPasswordUpdateForm();
      else if (_event === "SIGNED_OUT") showAuthForm("signin");
    }, 0);
  });
  restoreAuthSession().then(async function (session) {
    await syncAuthUser(session ? session.user : null);
    if (passwordRecoveryPending) {
      passwordRecoveryPending = false;
      showPasswordUpdateForm();
    } else if (!session) {
      showAuthForm("signin");
    }
  }).catch(function (error) {
    console.error("Could not restore Peer Connect session:", error.message);
    if (!user) showAuthForm("signin");
  });
}

var mine = false;
var allSubs = [
  "Maths",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "Computer Science",
  "History",
  "Accountancy",
  "Economics",
];
async function openTutor() {
  if (!user) {
    openSign();
    return;
  }
  if (user.role !== "tutor") {
    onboardingOpen = false;
    openOnboarding(true);
    return;
  }
  var existing = await supabaseClient.from("tutor_profiles")
    .select("user_id, headline, subjects")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing.data) {
    mine = true;
  }
  if (mine && !existing.data) {
    location.hash = "dashboard";
    return;
  }
  var pick = existing.data ? (existing.data.subjects || []).slice() : [];
  dbody.innerHTML =
    '<h3 id="dt">' + (existing.data ? "Edit your tutor profile" : "Set up your tutor profile") + '</h3><p style="color:var(--muted);margin:6px 0 0">Your class is saved as Class ' + user.grade + '.</p>' +
    '<label for="tn">Name</label><input id="tn" placeholder="Full name" autocomplete="name" value="' +
    (user ? esc(user.n) : "") +
    '">' +
    '<label>Subjects you can teach (pick up to 3)</label><div class="sp" id="sp">' +
    allSubs
      .map(function (s) {
        return (
          '<button type="button" class="chip" aria-pressed="false" data-sub="' +
          s +
          '">' +
          s +
          "</button>"
        );
      })
      .join("") +
    "</div>" +
    '<label for="th">One line about what you teach best</label><input id="th" maxlength="70" placeholder="For example: Algebra and trigonometry, 95% in Class 10" value="' + esc(existing.data ? existing.data.headline || "" : "") + '">' +
    '<div class="err" id="err" role="alert"></div>' +
    '<div class="row"><button class="btn ghost" id="cx">Cancel</button><button class="btn" id="ok">Create profile</button></div>' +
    '<div class="note">New tutor profiles stay out of search until the school ID and fee receipt are reviewed.</div>';
  dlg.showModal();
  document.getElementById("cx").onclick = function () {
    dlg.close();
  };
  pick.forEach(function (s) {
    var selected = document.querySelector('#sp [data-sub="' + s + '"]');
    if (selected) selected.setAttribute("aria-pressed", "true");
  });
  document.getElementById("sp").onclick = function (e) {
    var b = e.target.closest("[data-sub]");
    if (!b) return;
    var s = b.dataset.sub,
      k = pick.indexOf(s);
    if (k > -1) {
      pick.splice(k, 1);
      b.setAttribute("aria-pressed", "false");
    } else if (pick.length < 3) {
      pick.push(s);
      b.setAttribute("aria-pressed", "true");
    }
  };
  document.getElementById("ok").onclick = async function () {
    var n = document.getElementById("tn").value.trim(),
      h = document.getElementById("th").value.trim(),
      g = "Class " + user.grade,
      er = document.getElementById("err");
    if (!n) {
      er.textContent = "Enter your name.";
      return;
    }
    if (!pick.length) {
      er.textContent = "Pick at least one subject.";
      return;
    }
    if (!h) {
      er.textContent = "Add a short line about what you teach.";
      return;
    }
    var profileResult = await supabaseClient
      .from("profiles")
      .update({ display_name: n })
      .eq("id", user.id);
    if (profileResult.error) {
      er.textContent = authErrorText(profileResult.error);
      return;
    }
    var tutorResult = await supabaseClient.from("tutor_profiles").upsert({
      user_id: user.id,
      headline: h,
      subjects: pick,
      skills: pick,
      experience: h,
      is_available: true,
    });
    if (tutorResult.error) {
      er.textContent = authErrorText(tutorResult.error);
      return;
    }
    user.n = n;
    paintSign();
    mine = true;
    user.n = n;
    paintSign();
    dlg.close();
    await loadTutorDirectory();
    location.hash = "dashboard";
  };
}
document.getElementById("btnTutor").addEventListener("click", openTutor);
document.getElementById("btnFree").addEventListener("click", function () { showAuthForm("signup"); });
document.getElementById("btnTutor2").addEventListener("click", openTutor);

function paintRoleUI() {
  var isTutor = !!user && user.role === "tutor";
  var isSignedIn = !!user;
  document.querySelectorAll('[data-role-nav="tutor"]').forEach(function (el) { el.hidden = !isTutor; });
  document.querySelectorAll('.admin-only').forEach(function (el) { el.hidden = !isVerificationAdmin; });
  var become = document.getElementById("btnTutor");
  var becomeFromPricing = document.getElementById("btnTutor2");
  if (become) become.hidden = isSignedIn;
  if (becomeFromPricing) becomeFromPricing.hidden = isSignedIn;
  var title = document.getElementById("homeTitle");
  var intro = document.getElementById("homeIntro");
  var actions = document.getElementById("homeActions");
  var cards = document.getElementById("homeCards");
  if (isTutor) {
    title.textContent = "Help classmates learn with confidence.";
    intro.textContent = "Manage your tutor profile, choose when you are available, and respond to students who want your help.";
    actions.innerHTML = '<a class="btn" href="#dashboard">Open tutor dashboard</a><a class="btn ghost" href="#doubts">Answer a doubt</a>';
    cards.innerHTML = '<a href="#dashboard"><b>Your dashboard</b><span>Manage tutor requests, profile, and availability in one place.</span></a><a href="#doubts"><b>Share what you know</b><span>Answer questions and build your reputation with students.</span></a><a href="#pricing"><b>Blue Tick</b><span>Optional one-time payment; price and launch date to be decided.</span></a>';
  } else {
    title.textContent = "Find a classmate who gets it.";
    intro.textContent = "Peer Connect is a peer tutoring network for your school. Find tutors, ask your doubts, and learn from students who have been through the same exams.";
    actions.innerHTML = '<a class="btn" href="#tutors">Find a tutor</a><a class="btn ghost" href="#doubts">Ask a doubt</a>';
    cards.innerHTML = '<a href="#tutors"><b>Tutors</b><span>Search tutors by subject and send unlimited connection requests.</span></a><a href="#doubts"><b>Doubts</b><span>Ask questions, upvote the best ones, and answer what you know.</span></a><a href="#pricing"><b>Pricing</b><span>Free for students and tutors. Optional tutor Blue Tick may come later.</span></a>';
  }
}
document.querySelectorAll('[data-nav="verification"]').forEach(function (link) {
  link.addEventListener("click", function () { window.setTimeout(drawVerificationAdmin, 0); });
});

var requestLocationState = "", requestLocationCity = "";
function tutorVerificationPanel(status) {
  if (Number(user && user.grade) < 11) return '<section class="box verify-status"><b>Tutor verification is for senior students</b><p class="muted">Class 11 and 12 students can apply. A reviewer checks the school ID, fee receipt, tutor subjects, and class before approving.</p></section>';
  if (status && status.status === "verified") return '<section class="box verify-status"><b><span class="verify-badge">Verified</span> Your tutor profile is approved</b><p class="muted">Your profile can appear in tutor search while availability is on.</p></section>';
  if (status && status.status === "pending") return '<section class="box verify-status"><b>Verification pending</b><p class="muted">Your school ID and fee receipt are private. A reviewer will check them before your tutor profile becomes visible.</p></section>';
  if (status && status.status === "rejected") return '<section class="box verify-status"><b>Verification needs another review</b><p class="muted">Resubmit both documents if a reviewer declined them, or if your verified name, class, school, or tutor subjects changed.</p><button class="btn" data-start-verification>Submit documents again</button></section>';
  return '<section class="box verify-status"><b>Verify your tutor profile</b><p class="muted">Class 11 and 12 tutors can submit a school ID and fee receipt. A trusted reviewer checks your class, school, and tutor subjects before approving the green badge. Files stay private and are removed after review.</p><button class="btn" data-start-verification>Submit for review</button></section>';
}
async function drawTutorDashboard() {
  var body = document.getElementById("tutorDashboardBody");
  if (!body) return;
  if (!user || user.role !== "tutor") {
    body.innerHTML = '<div class="box">Sign in with a tutor account to see this dashboard.</div>';
    return;
  }
  body.innerHTML = '<div class="box">Loading your tutor dashboard…</div>';
  var results = await Promise.all([
    supabaseClient.from("tutor_profiles").select("headline, subjects, is_available").eq("user_id", user.id).maybeSingle(),
    supabaseClient.from("tutor_verification_requests").select("id, status, submitted_at").eq("user_id", user.id).order("submitted_at", { ascending: false }).limit(1),
    supabaseClient.rpc("get_tutor_student_requests", { p_state: null, p_city: null }),
  ]);
  if (results[0].error || results[1].error || results[2].error) {
    body.innerHTML = '<div class="box err">' + esc(authErrorText(results[0].error || results[1].error || results[2].error)) + '</div>';
    return;
  }
  var profile = results[0].data, status = (results[1].data || [])[0] || null, requests = results[2].data || [];
  var pending = requests.filter(function (r) { return r.status === "pending"; }).length;
  var accepted = requests.filter(function (r) { return r.status === "accepted"; }).length;
  var states = Array.from(new Set(requests.map(function (r) { return r.state; }).filter(Boolean))).sort();
  var cities = Array.from(new Set(requests.filter(function (r) { return !requestLocationState || r.state === requestLocationState; }).map(function (r) { return r.city; }).filter(Boolean))).sort();
  if (states.indexOf(requestLocationState) < 0) requestLocationState = "";
  if (cities.indexOf(requestLocationCity) < 0) requestLocationCity = "";
  var filteredRequests = requests.filter(function (r) { return (!requestLocationState || r.state === requestLocationState) && (!requestLocationCity || r.city === requestLocationCity); });
  body.innerHTML = '<div class="dash-stats"><div class="dash-stat"><b>' + pending + '</b><span>Requests to review</span></div><div class="dash-stat"><b>' + accepted + '</b><span>Connections</span></div><div class="dash-stat"><b>' + (profile && profile.is_available ? "Available" : "Paused") + '</b><span>Profile visibility</span></div></div>' +
    tutorVerificationPanel(status) +
    '<div class="dash-grid"><section class="box"><div class="dash-heading"><div><b>Your tutor profile</b><p class="muted">' + esc(profile ? profile.headline || "Add a headline" : "Create your profile so classmates can find you.") + '</p></div><button class="btn ghost" data-edit-tutor>Edit profile</button></div><p class="muted">Subjects: ' + esc(profile && profile.subjects ? profile.subjects.join(", ") : "Not set") + '<br>School: ' + esc(user.location && user.location.school || "—") + '<br>Location: ' + esc(user.location ? [user.location.city,user.location.state,user.location.country].join(", ") : "—") + '</p><label class="availability"><input type="checkbox" data-available ' + (profile && profile.is_available ? "checked" : "") + ' ' + (!profile || !status || status.status !== "verified" ? "disabled" : "") + '> Show my profile in tutor search</label></section><section class="box"><b>Privacy</b><p class="muted">Your school and location appear on your tutor profile only after you are verified. Student locations are shared with the tutor receiving their request.</p></section></div>' +
    '<section class="box request-box"><div class="dash-heading"><div><b>Student requests</b><p class="muted">Accept requests from classmates you can help.</p></div></div><div class="location-filters"><select id="requestStateFilter"><option value="">All states</option>' + states.map(function (s) { return '<option' + (s === requestLocationState ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join("") + '</select><select id="requestCityFilter"><option value="">All cities</option>' + cities.map(function (s) { return '<option' + (s === requestLocationCity ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join("") + '</select></div>' + (filteredRequests.length ? filteredRequests.map(function (r) { return '<article class="request-row"><div><b>' + esc(r.display_name || "Student") + '</b><p class="muted">Class ' + esc(String(r.grade || "—")) + ' · ' + esc([r.school,r.city,r.state,r.country].filter(Boolean).join(", ") || "Location not added") + ' · ' + esc(r.status) + '</p></div>' + (r.status === "pending" ? '<div class="row"><button class="btn" data-request-action="accepted" data-request-id="' + esc(r.connection_id) + '">Accept</button><button class="btn ghost" data-request-action="rejected" data-request-id="' + esc(r.connection_id) + '">Decline</button></div>' : '') + '</article>'; }).join("") : '<p class="muted">No student requests match those filters.</p>') + '</section>';
  document.getElementById("requestStateFilter").onchange = function (event) { requestLocationState = event.target.value; requestLocationCity = ""; drawTutorDashboard(); };
  document.getElementById("requestCityFilter").onchange = function (event) { requestLocationCity = event.target.value; drawTutorDashboard(); };
}
document.getElementById("tutorDashboardBody").addEventListener("click", async function (e) {
  var action = e.target.closest("[data-request-action]");
  if (action) {
    action.disabled = true;
    var result = await supabaseClient.from("connections").update({ status: action.dataset.requestAction }).eq("id", action.dataset.requestId).eq("recipient_id", user.id);
    if (result.error) window.alert(authErrorText(result.error));
    await drawTutorDashboard();
  } else if (e.target.closest("[data-edit-tutor]")) openTutor();
  else if (e.target.closest("[data-start-verification]")) openTutorVerificationForm();
});
document.getElementById("tutorDashboardBody").addEventListener("change", async function (e) {
  if (!e.target.matches("[data-available]")) return;
  var result = await supabaseClient.from("tutor_profiles").update({ is_available: e.target.checked }).eq("user_id", user.id);
  if (result.error) window.alert(authErrorText(result.error));
  await loadTutorDirectory();
  await drawTutorDashboard();
});

function openTutorVerificationForm() {
  if (!user || user.role !== "tutor") return;
  dlg.classList.remove("auth-screen");
  dbody.innerHTML = '<h3 id="dt">Submit tutor verification</h3><p class="muted">Upload a school ID card and a school fee receipt. These files are private and can only be viewed by you and the trusted reviewer.</p><div class="verify-doc-fields"><label>School ID card<input id="verifySchoolId" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><label>Fee receipt<input id="verifyFeeReceipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label></div><p class="note">Each file must be JPG, PNG, WebP, or PDF and no larger than 5 MB. Do not upload unrelated personal documents.</p><div class="err" id="verificationError" role="alert"></div><div class="row"><button class="btn ghost" id="cancelVerification">Cancel</button><button class="btn" id="submitVerification">Send for review</button></div>';
  if (!dlg.open) dlg.showModal();
  document.getElementById("cancelVerification").onclick = function () { dlg.close(); };
  document.getElementById("submitVerification").onclick = async function () {
    var schoolId = document.getElementById("verifySchoolId").files[0];
    var receipt = document.getElementById("verifyFeeReceipt").files[0];
    var errorEl = document.getElementById("verificationError");
    var button = document.getElementById("submitVerification");
    if (!schoolId || !receipt) { errorEl.textContent = "Choose both the school ID card and fee receipt."; return; }
    var allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if ([schoolId, receipt].some(function (file) { return file.size > 5 * 1024 * 1024 || allowed.indexOf(file.type) < 0; })) {
      errorEl.textContent = "Each file must be JPG, PNG, WebP, or PDF and no larger than 5 MB."; return;
    }
    if (!window.crypto || !window.crypto.randomUUID) { errorEl.textContent = "Update your browser before submitting verification."; return; }
    button.disabled = true; button.textContent = "Uploading privately…"; errorEl.textContent = "";
    var requestId = window.crypto.randomUUID(), uploaded = [];
    var request = await supabaseClient.from("tutor_verification_requests").insert({ id: requestId, user_id: user.id, status: "pending" }).select("id").single();
    if (request.error) { errorEl.textContent = authErrorText(request.error); button.disabled = false; button.textContent = "Send for review"; return; }
    var inputs = [{ file: schoolId, type: "school_id" }, { file: receipt, type: "fee_receipt" }];
    for (var i = 0; i < inputs.length; i++) {
      var safeName = inputs[i].file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-90) || "document";
      var path = user.id + "/" + requestId + "/" + inputs[i].type + "-" + safeName;
      var uploadedFile = await supabaseClient.storage.from("tutor-verification").upload(path, inputs[i].file, { contentType: inputs[i].file.type, upsert: false });
      if (uploadedFile.error) {
        if (uploaded.length) await supabaseClient.storage.from("tutor-verification").remove(uploaded.map(function (item) { return item.path; }));
        await supabaseClient.from("tutor_verification_requests").delete().eq("id", requestId).eq("user_id", user.id);
        errorEl.textContent = authErrorText(uploadedFile.error); button.disabled = false; button.textContent = "Send for review"; return;
      }
      uploaded.push({ path: path, type: inputs[i].type });
    }
    var metadata = await supabaseClient.from("tutor_verification_documents").insert(uploaded.map(function (item) { return { request_id: requestId, document_type: item.type, storage_path: item.path }; }));
    if (metadata.error) {
      await supabaseClient.from("tutor_verification_requests").delete().eq("id", requestId).eq("user_id", user.id);
      await supabaseClient.storage.from("tutor-verification").remove(uploaded.map(function (item) { return item.path; }));
      errorEl.textContent = authErrorText(metadata.error); button.disabled = false; button.textContent = "Send for review"; return;
    }
    dlg.close();
    await drawTutorDashboard();
  };
}

async function drawVerificationAdmin() {
  var body = document.getElementById("verificationAdminBody");
  if (!body) return;
  if (!user || !isVerificationAdmin) { body.innerHTML = '<div class="box">This area is for trusted reviewers only.</div>'; return; }
  body.innerHTML = '<div class="box">Loading review queue…</div>';
  var result = await supabaseClient.from("tutor_verification_requests").select("id, user_id, submitted_at").eq("status", "pending").order("submitted_at", { ascending: true });
  if (result.error) { body.innerHTML = '<div class="box err">' + esc(authErrorText(result.error)) + '</div>'; return; }
  if (!result.data || !result.data.length) { body.innerHTML = '<div class="box">No tutor verification requests waiting.</div>'; return; }
  var ids = result.data.map(function (r) { return r.user_id; }), reqIds = result.data.map(function (r) { return r.id; });
  var extra = await Promise.all([
    supabaseClient.from("profiles").select("id, display_name, grade").in("id", ids),
    supabaseClient.from("profile_locations").select("user_id, school, city, state, country").in("user_id", ids),
    supabaseClient.from("tutor_verification_documents").select("request_id, document_type, storage_path").in("request_id", reqIds),
    supabaseClient.from("tutor_profiles").select("user_id, headline, subjects").in("user_id", ids),
  ]);
  if (extra.some(function (item) { return item.error; })) { body.innerHTML = '<div class="box err">' + esc(authErrorText(extra.filter(function (item) { return item.error; })[0].error)) + '</div>'; return; }
  var profiles = {}, locations = {}, docs = {}, tutorProfiles = {};
  (extra[0].data || []).forEach(function (p) { profiles[p.id] = p; });
  (extra[1].data || []).forEach(function (l) { locations[l.user_id] = l; });
  (extra[2].data || []).forEach(function (d) { (docs[d.request_id] = docs[d.request_id] || []).push(d); });
  (extra[3].data || []).forEach(function (tp) { tutorProfiles[tp.user_id] = tp; });
  var cards = [];
  for (var j = 0; j < result.data.length; j++) {
    var row = result.data[j], p = profiles[row.user_id] || {}, l = locations[row.user_id] || {}, items = docs[row.id] || [], links = [], allDocsAvailable = true;
    for (var k = 0; k < items.length; k++) {
      var signed = await supabaseClient.storage.from("tutor-verification").createSignedUrl(items[k].storage_path, 300);
      if (signed.error) allDocsAvailable = false;
      links.push('<div class="admin-doc"><span>' + (items[k].document_type === "school_id" ? "School ID card" : "Fee receipt") + '</span>' + (signed.error ? '<span class="muted">Preview unavailable</span>' : '<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(signed.data.signedUrl) + '">Open private file</a>') + '</div>');
    }
    var tp = tutorProfiles[row.user_id] || {}, hasId = items.some(function (d) { return d.document_type === "school_id"; }), hasReceipt = items.some(function (d) { return d.document_type === "fee_receipt"; });
    cards.push('<article class="box"><h3>' + esc(p.display_name || "Tutor") + ' · Class ' + esc(String(p.grade || "—")) + '</h3><p class="muted">' + esc([l.school,l.city,l.state,l.country].filter(Boolean).join(" · ") || "Location not set") + '<br>Subjects: ' + esc((tp.subjects || []).join(", ") || "Not set") + '<br>About: ' + esc(tp.headline || "Not set") + '<br>Submitted ' + esc(new Date(row.submitted_at).toLocaleString()) + '</p>' + (links.join("") || '<p class="err">No documents attached.</p>') + '<label>Reviewer note (optional)<input data-review-note="' + esc(row.id) + '" maxlength="500" placeholder="Private note; not shown on the tutor profile"></label><div class="row"><button class="btn" data-review="verified" data-review-id="' + esc(row.id) + '" data-user-id="' + esc(row.user_id) + '" ' + (!(hasId && hasReceipt && Number(p.grade) >= 11 && allDocsAvailable) ? 'disabled title="Both documents must be available and the profile must be Class 11 or 12"' : '') + '>Approve and verify</button><button class="btn ghost" data-review="rejected" data-review-id="' + esc(row.id) + '" data-user-id="' + esc(row.user_id) + '">Reject</button></div></article>');
  }
  body.innerHTML = cards.join("");
}
document.getElementById("verificationAdminBody").addEventListener("click", async function (event) {
  var button = event.target.closest("[data-review]");
  if (!button || !isVerificationAdmin) return;
  button.disabled = true;
  var requestId = button.dataset.reviewId, decision = button.dataset.review, userId = button.dataset.userId;
  var noteInput = document.querySelector('[data-review-note="' + requestId + '"]');
  var review = await supabaseClient.from("tutor_verification_requests").update({ status: decision, reviewed_at: new Date().toISOString() }).eq("id", requestId).eq("status", "pending");
  if (review.error) { window.alert(authErrorText(review.error)); button.disabled = false; return; }
  var note = await supabaseClient.from("tutor_verification_reviews").upsert({ request_id: requestId, reviewer_id: user.id, note: noteInput ? noteInput.value.trim() || null : null });
  var docs = await supabaseClient.from("tutor_verification_documents").select("id, storage_path").eq("request_id", requestId);
  var cleanupError = null;
  if (!docs.error && docs.data && docs.data.length) {
    var removed = await supabaseClient.storage.from("tutor-verification").remove(docs.data.map(function (doc) { return doc.storage_path; }));
    if (removed.error) cleanupError = removed.error;
    else {
      var deletedMetadata = await supabaseClient.from("tutor_verification_documents").delete().eq("request_id", requestId);
      if (deletedMetadata.error) cleanupError = deletedMetadata.error;
    }
  } else if (docs.error) cleanupError = docs.error;
  if (note.error) window.alert("Decision saved, but the private reviewer note could not be saved: " + authErrorText(note.error));
  if (cleanupError) window.alert("Decision saved. Private files could not be removed automatically; please retry cleanup from Supabase Storage.");
  await drawVerificationAdmin();
  await loadTutorDirectory();
  if (userId === user.id && curRoute === "dashboard") await drawTutorDashboard();
});

var posts = [];
var fSub = "All",
  openR = {};
var fsel = document.getElementById("fSub"),
  fch = document.getElementById("fchips"),
  flist = document.getElementById("flist");
fsel.innerHTML = allSubs
  .map(function (s) {
    return "<option>" + s + "</option>";
  })
  .join("");
function who() {
  var me = tutors.filter(function (t) {
    return t.me;
  })[0];
  if (me) return { n: me.n, g: me.g };
  return { n: user ? user.n : "You", g: "Student" };
}
function hasBlue(n) {
  return tutors.some(function (t) {
    return t.n === n && t.blue;
  });
}

function relationRow(value) {
  return Array.isArray(value) ? (value[0] || {}) : (value || {});
}

function relativeTime(value) {
  var seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h";
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d";
  return new Date(value).toLocaleDateString();
}

async function loadHomeCommunityQuestions() {
  var list = document.getElementById("homeQuestionList");
  if (!list || !supabaseClient || !user) return;
  var loadingUserId = user.id;
  list.innerHTML = '<div class="community-empty">Loading recent questions…</div>';
  var result = await supabaseClient
    .from("doubts")
    .select("id, body, title, subject, created_at, answers(id)")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(15);
  if (!user || user.id !== loadingUserId || curRoute !== "home") return;
  if (result.error) {
    list.innerHTML = '<div class="community-empty">The community questions could not load right now.</div>';
    return;
  }
  var unanswered = (result.data || []).filter(function (row) {
    return !Array.isArray(row.answers) || row.answers.length === 0;
  }).slice(0, 3);
  if (!unanswered.length) {
    list.innerHTML = '<div class="community-empty">No unanswered questions right now. Ask a doubt or browse the feed.</div>';
    return;
  }
  list.innerHTML = unanswered.map(function (row) {
    var question = String(row.body || row.title || "Question");
    if (question.length > 140) question = question.slice(0, 137) + "…";
    return '<article class="community-question"><div class="community-question-meta"><span class="tag">' + esc(String(row.subject || "General")) + '</span><span>' + esc(relativeTime(row.created_at)) + '</span></div><h3>' + esc(question) + '</h3><a href="#doubts">Join the discussion <span aria-hidden="true">→</span></a></article>';
  }).join("");
}

async function loadDoubtsFromSupabase() {
  if (!supabaseClient || !user) {
    posts = [];
    drawFeed();
    return;
  }
  var loadingUserId = user.id;
  flist.innerHTML = '<div class="empty">Loading saved doubts…</div>';
  var result = await supabaseClient
    .from("doubts")
    .select("id, author_id, title, body, subject, grade, created_at, profiles!doubts_author_id_fkey(display_name, grade), answers(id, author_id, content, is_accepted, created_at, profiles!answers_author_id_fkey(display_name, grade))")
    .order("created_at", { ascending: false });
  if (!user || user.id !== loadingUserId) return;
  if (result.error) {
    posts = [];
    drawFeed();
    flist.innerHTML = '<div class="empty">Could not load saved doubts: ' + esc(authErrorText(result.error)) + '</div>';
    return;
  }
  posts = (result.data || []).map(function (row) {
    var author = relationRow(row.profiles);
    var authorGrade = author.grade || row.grade;
    var answers = Array.isArray(row.answers) ? row.answers.slice() : [];
    answers.sort(function (a, b) {
      if (a.is_accepted !== b.is_accepted) return a.is_accepted ? -1 : 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return {
      id: row.id,
      authorId: row.author_id,
      n: author.display_name || "Peer Connect member",
      g: authorGrade ? "Class " + authorGrade : "Student",
      sub: row.subject || "General",
      t: row.body || row.title,
      created_at: row.created_at,
      ago: relativeTime(row.created_at),
      likes: 0,
      liked: false,
      rep: answers.map(function (answer) {
        var answerAuthor = relationRow(answer.profiles);
        return {
          id: answer.id,
          authorId: answer.author_id,
          n: answerAuthor.display_name || "Peer Connect member",
          t: answer.content,
          isAccepted: answer.is_accepted,
        };
      }),
    };
  });
  drawFeed();
}
fch.addEventListener("click", function (e) {
  var b = e.target.closest("[data-fs]");
  if (!b) return;
  fSub = b.dataset.fs;
  drawFeed();
});
flist.addEventListener("click", async function (e) {
  var b = e.target.closest("[data-act]");
  if (!b) return;
  var id = b.dataset.id,
    p = posts.filter(function (x) {
      return String(x.id) === String(id);
    })[0],
    a = b.dataset.act;
  if (!p) return;
  if (a === "like") {
    p.liked = !p.liked;
    p.likes += p.liked ? 1 : -1;
    drawFeed();
  } else if (a === "reply") {
    if (!user) {
      openSign();
      return;
    }
    openR[id] = !openR[id];
    drawFeed();
    if (openR[id]) {
      var i = document.getElementById("ri" + id);
      if (i) i.focus();
    }
  } else if (a === "delete-doubt") {
    if (!user || p.authorId !== user.id) return;
    if (!window.confirm("Delete this doubt and all of its answers? This cannot be undone.")) return;
    b.disabled = true;
    b.textContent = "Deleting…";
    var deletedDoubt = await supabaseClient.from("doubts").delete().eq("id", p.id).eq("author_id", user.id);
    if (deletedDoubt.error) {
      document.getElementById("ferr").textContent = authErrorText(deletedDoubt.error);
      b.disabled = false;
      b.textContent = "Delete doubt";
      return;
    }
    posts = posts.filter(function (post) { return String(post.id) !== String(p.id); });
    delete openR[id];
    document.getElementById("ferr").textContent = "Doubt deleted.";
    drawFeed();
    if (curRoute === "me") drawMe();
  } else if (a === "delete-answer") {
    var ownedAnswer = p.rep.filter(function (answer) { return String(answer.id) === String(b.dataset.aid); })[0];
    if (!user || !ownedAnswer || ownedAnswer.authorId !== user.id) return;
    if (!window.confirm("Delete your answer? This cannot be undone.")) return;
    b.disabled = true;
    b.textContent = "Deleting…";
    var deletedAnswer = await supabaseClient.from("answers").delete()
      .eq("id", ownedAnswer.id)
      .eq("author_id", user.id);
    if (deletedAnswer.error) {
      document.getElementById("ferr").textContent = authErrorText(deletedAnswer.error);
      b.disabled = false;
      b.textContent = "Delete answer";
      return;
    }
    p.rep = p.rep.filter(function (answer) { return String(answer.id) !== String(ownedAnswer.id); });
    document.getElementById("ferr").textContent = "Answer deleted.";
    drawFeed();
  } else if (a === "send") {
    var inp = document.getElementById("ri" + id),
      v = inp.value.trim();
    if (!v) {
      inp.focus();
      return;
    }
    if (!user) {
      openSign();
      return;
    }
    b.disabled = true;
    var answer = await supabaseClient.from("answers").insert({
      doubt_id: p.id,
      author_id: user.id,
      content: v,
    }).select("id, author_id, content, is_accepted, created_at").single();
    if (answer.error) {
      document.getElementById("ferr").textContent = authErrorText(answer.error);
      b.disabled = false;
      return;
    }
    p.rep.push({ id: answer.data.id, authorId: user.id, n: user.n, t: answer.data.content, isAccepted: answer.data.is_accepted });
    drawFeed();
  }
});
var ft = document.getElementById("fText"),
  fc = document.getElementById("fCount");
ft.addEventListener("input", function () {
  fc.textContent = 200 - ft.value.length;
});
document.getElementById("fPost").addEventListener("click", async function () {
  var v = ft.value.trim(),
    er = document.getElementById("ferr");
  if (!user) {
    er.textContent = "Sign in to post a doubt and see saved questions.";
    openSign();
    return;
  }
  if (!v) {
    er.textContent = "Write your doubt first.";
    return;
  }
  er.textContent = "";
  var button = this;
  button.disabled = true;
  button.textContent = "Saving…";
  var created = await supabaseClient.from("doubts").insert({
    author_id: user.id,
    title: v.length > 120 ? v.slice(0, 117) + "…" : v,
    body: v,
    subject: fsel.value,
    grade: user.grade ? Number(user.grade) : null,
  }).select("id, author_id, title, body, subject, grade, created_at").single();
  button.disabled = false;
  button.textContent = "Post doubt";
  if (created.error) {
    er.textContent = authErrorText(created.error);
    return;
  }
  posts.unshift({
    id: created.data.id,
    authorId: user.id,
    n: user.n,
    g: user.grade ? "Class " + user.grade : "Student",
    sub: created.data.subject || "General",
    t: created.data.body,
    created_at: created.data.created_at,
    ago: "just now",
    likes: 0,
    liked: false,
    rep: [],
  });
  ft.value = "";
  fc.textContent = 200;
  fSub = "All";
  drawFeed();
});
var fSort = "hot",
  curRoute = "home";
function postHtml(p) {
  var open = openR[p.id],
    n = p.rep.length;
  return (
    '<article class="post"><div class="votecol"><button class="vbtn" data-act="like" data-id="' +
    p.id +
    '" aria-pressed="' +
    !!p.liked +
    '" aria-label="Upvote">&#9650;</button><span class="vn">' +
    p.likes +
    '</span></div><div class="pm">' +
    '<div class="sub2"><span class="tag">#' +
    esc(p.sub).replace(/ /g, "") +
    "</span> Asked by <b>" +
    esc(p.n) +
    "</b>" +
    (hasBlue(p.n) ? BT : "") +
    ", " +
    esc(p.g) +
    ", " +
    p.ago +
    (p.ago === "now" ? "" : " ago") +
    "</div>" +
    '<div class="pt ptitle">' +
    esc(p.t) +
    "</div>" +
    p.rep
      .map(function (r, i) {
        return (
          '<div class="rep">' +
          (i === 0 ? '<div class="best">Top answer</div>' : "") +
          '<div class="rep-meta"><b>' +
          esc(r.n) +
          "</b>" +
          (hasBlue(r.n) ? BT : "") +
          (user && r.authorId === user.id
            ? '<button class="act delete-action" data-act="delete-answer" data-id="' + p.id + '" data-aid="' + esc(String(r.id)) + '">Delete answer</button>'
            : "") +
          '</div>' +
          "<div>" +
          esc(r.t) +
          "</div></div>"
        );
      })
      .join("") +
    '<div class="pa"><button class="act" data-act="reply" data-id="' +
    p.id +
    '" aria-expanded="' +
    !!open +
    '">' +
    (n ? "Add an answer (" + n + ")" : "Be the first to answer") +
    "</button>" +
    (user && p.authorId === user.id
      ? '<button class="act delete-action" data-act="delete-doubt" data-id="' + p.id + '">Delete doubt</button>'
      : "") +
    "</div>" +
    (open
      ? '<div class="rrow"><input id="ri' +
        p.id +
        '" maxlength="200" placeholder="Write your answer" aria-label="Write your answer"><button class="btn" data-act="send" data-id="' +
        p.id +
        '">Answer</button></div>'
      : "") +
    "</div></article>"
  );
}
function drawFeed() {
  var counts = {};
  posts.forEach(function (p) {
    counts[p.sub] = (counts[p.sub] || 0) + 1;
  });
  document.getElementById("ftabs").innerHTML = [
    ["hot", "Hot"],
    ["new", "New"],
    ["top", "Top"],
  ]
    .map(function (s) {
      return (
        '<button class="chip" aria-pressed="' +
        (fSort === s[0]) +
        '" data-sort="' +
        s[0] +
        '">' +
        s[1] +
        "</button>"
      );
    })
    .join("");
  fch.innerHTML = ["All"]
    .concat(Object.keys(counts))
    .map(function (s) {
      return (
        '<button class="chip" aria-pressed="' +
        (s === fSub) +
        '" data-fs="' +
        s +
        '">' +
        (s === "All"
          ? "All doubts"
          : "#" + s.replace(/ /g, "") + " (" + counts[s] + ")") +
        "</button>"
      );
    })
    .join("");
  var list = posts.filter(function (p) {
    return fSub === "All" || p.sub === fSub;
  });
  list.sort(function (a, b) {
    if (fSort === "new") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (fSort === "top") return b.likes - a.likes;
    return b.likes + 2 * b.rep.length - (a.likes + 2 * a.rep.length);
  });
  flist.innerHTML = list.length
    ? list.map(postHtml).join("")
    : user
      ? '<div class="empty">No saved doubts yet. Be the first to ask one.</div>'
      : '<div class="empty">Sign in to view saved doubts and post a question.</div>';
}
document.getElementById("ftabs").addEventListener("click", function (e) {
  var b = e.target.closest("[data-sort]");
  if (!b) return;
  fSort = b.dataset.sort;
  drawFeed();
});
function drawMe() {
  var h = "";
  var mu = 'style="margin:6px 0 12px;color:var(--muted)"';
  h += '<div class="box"><b>Account</b><p ' + mu + '>' + (user ? esc(user.n) + " · " + esc(user.e) + "<br>" + (user.role === "tutor" ? "Tutor" : "Student") + " · Class " + esc(String(user.grade || "")) + '<br>' + esc(user.location ? [user.location.school,user.location.city,user.location.state,user.location.country].join(" · ") : "Location not set") : "You are not signed in.") + '</p>' + (user ? '<button class="btn ghost" data-edit-details>Edit school and location</button>' : '<button class="btn" data-go="signin">Sign up / Sign in</button>') + '</div>';
  h += '<div class="box"><b>Connections</b><p ' + mu + '>Unlimited connection requests for every student account.</p><a class="btn ghost" href="#tutors">Find a tutor</a></div>';
  h += '<div class="box"><b>Tutor profile</b><p ' + mu + '>' + (user && user.role === "tutor" ? 'Your tutor tools and incoming requests are on your <a href="#dashboard">dashboard</a>.' : 'Want to help classmates? Choose Tutor in your account profile.') + '</p>' + (user && user.role === "tutor" ? '<a class="btn" href="#dashboard">Tutor dashboard</a>' : '') + '</div>';
  var w = who();
  var mp = posts.filter(function (p) { return p.n === w.n; });
  h += '<div class="box"><b>Your doubts (' + mp.length + ')</b>' + (mp.length ? '<ul style="margin:8px 0 0;padding-left:20px">' + mp.map(function (p) { return "<li>" + esc(p.t) + "</li>"; }).join("") + '</ul>' : '<p ' + mu + '>You have not asked a doubt yet.</p><a class="btn ghost" href="#doubts">Ask a doubt</a>') + '</div>';
  document.getElementById("meBody").innerHTML = h;
}
document.getElementById("meBody").addEventListener("click", function (e) {
  var b = e.target.closest("[data-go]");
  if (!b) {
    if (e.target.closest("[data-edit-details]")) openOnboarding(false);
    return;
  }
  if (b.dataset.go === "signin") openSign();
  else openTutor();
});
dlg.addEventListener("close", function () {
  if (user && (!user.role || !user.grade || missingProfileLocation(user.location))) onboardingOpen = false;
  if (curRoute === "me") drawMe();
});
var routes = ["home", "tutors", "doubts", "pricing", "me", "dashboard", "verification"],
  names = {
    home: "Home",
    tutors: "Tutors",
    doubts: "Doubts",
    pricing: "Pricing",
    me: "My page",
    dashboard: "Tutor dashboard",
    verification: "Tutor verification review",
  };
function hasSeenStudentIntro(key) {
  try { if (window.localStorage.getItem(key) === "1") return true; } catch (_localReadError) {}
  try { if (window.sessionStorage.getItem(key) === "1") return true; } catch (_sessionReadError) {}
  return false;
}
function markStudentIntroSeen(key) {
  try { window.localStorage.setItem(key, "1"); return; } catch (_localWriteError) {}
  try { window.sessionStorage.setItem(key, "1"); } catch (_sessionWriteError) {}
}
function route() {
  var h = location.hash.replace("#", "");
  if (routes.indexOf(h) < 0) h = "home";
  var isStudent = user && String(user.role || "").trim().toLowerCase() === "student";
  if (isStudent && studentEntryPending) {
    studentEntryPending = false;
    var introKey = "peerConnectIntroSeen:" + user.id;
    if (hasSeenStudentIntro(introKey)) {
      h = "doubts";
    } else {
      markStudentIntroSeen(introKey);
      h = "home";
    }
    if (location.hash !== "#" + h) history.replaceState(null, document.title, location.pathname + location.search + "#" + h);
  }
  if (h === "dashboard" && (!user || user.role !== "tutor")) h = "home";
  if (h === "verification" && (!user || !isVerificationAdmin)) h = "home";
  curRoute = h;
  document.querySelectorAll("[data-v]").forEach(function (el) {
    el.hidden = el.dataset.v.split(" ").indexOf(h) < 0;
  });
  document.querySelectorAll("[data-nav]").forEach(function (a) {
    if (a.dataset.nav === h) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = names[h] + " | Peer Connect";
  if (h === "doubts") {
    if (user) loadDoubtsFromSupabase();
    else drawFeed();
  }
  if (h === "verification") drawVerificationAdmin();
  if (h === "home" && user) loadHomeCommunityQuestions();
  if (h === "me") drawMe();
  if (h === "dashboard") drawTutorDashboard();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
dlg.addEventListener("cancel", function (event) {
  if (dlg.classList.contains("auth-screen") && !user) event.preventDefault();
});
drawFeed();
route();
