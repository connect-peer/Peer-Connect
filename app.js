/*
 * Peer Connect app.js
 * ------------------------------------------------------------
 * All behavior lives in this file. There is no framework and no build step.
 * Supabase handles Auth and profiles; demo tutor and doubt data is in memory.
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
  sent = {};
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
    var hay = (t.n + " " + t.h + " " + t.s.join(" ")).toLowerCase();
    return okS && hay.indexOf(query.toLowerCase()) > -1;
  });
  list.sort(function (a, b) {
    return (b.blue ? 1 : 0) - (a.blue ? 1 : 0);
  });
  document.getElementById("count").textContent =
    list.length +
    (list.length === 1 ? " tutor" : " tutors") +
    " at your school";
  if (!list.length) {
    grid.innerHTML = tutors.length
      ? '<div class="empty">No tutors match. Try another subject or a shorter search.</div>'
      : '<div class="empty">No tutors have joined yet. Use Become a tutor to be the first.</div>';
    return;
  }
  grid.innerHTML = list
    .map(function (t) {
      var i = tutors.indexOf(t),
        done = sent[t.user_id] || t.me;
      return (
        '<article class="card"><div class="cover" style="--c:' +
        t.c +
        '"></div><div class="body">' +
        '<div class="av">' +
        ini(t.n) +
        "</div>" +
        "<h3>" +
        esc(t.n) +
        (t.blue ? BT : "") +
        (t.me
          ? ' <span class="ver" style="color:var(--muted);border-color:var(--line)">Pending</span>'
          : ' <span class="ver">Verified</span>') +
        "</h3>" +
        '<div class="sub">' +
        t.g +
        " · " +
        esc(t.h) +
        "</div>" +
        '<div class="tags">' +
        t.s
          .map(function (s) {
            return '<span class="tag">' + s + "</span>";
          })
          .join("") +
        "</div>" +
        '<div class="stats"><span><b>' +
        t.r +
        "</b> rating</span><span><b>" +
        t.x +
        "</b> sessions</span></div>" +
        '<div class="mutual">' +
        t.m +
        " mutual connections</div>" +
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
grid.addEventListener("click", async function (e) {
  var b = e.target.closest("button[data-i]");
  if (!b || b.disabled) return;
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

async function loadTutorDirectory() {
  if (!supabaseClient || !user) return;
  var result = await supabaseClient
    .from("tutor_profiles")
    .select("user_id, headline, subjects, is_available, profiles!tutor_profiles_user_id_fkey(display_name, grade)")
    .eq("is_available", true)
    .order("created_at", { ascending: false });
  if (result.error) {
    document.getElementById("count").textContent = authErrorText(result.error);
    return;
  }
  tutors = (result.data || []).map(function (row) {
    var profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    profile = profile || {};
    return {
      user_id: row.user_id,
      n: profile.display_name || "Peer Connect tutor",
      g: profile.grade ? "Class " + profile.grade : "Student tutor",
      s: row.subjects || [],
      h: row.headline || "Peer tutor",
      r: "New",
      x: 0,
      m: 0,
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
    paintSign();
    paintRoleUI();
    if (curRoute === "workspace") location.hash = "home";
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
  user = {
    id: authUser.id,
    n: name,
    e: authUser.email || "",
    role: profileResult && profileResult.data ? profileResult.data.role : null,
    grade: profileResult && profileResult.data ? profileResult.data.grade : null,
  };
  paintSign();
  paintRoleUI();
  if ((!user.role || !user.grade) && !onboardingOpen) openOnboarding(false);
  if (user.role) loadTutorDirectory();
  if (user.role === "student") loadStudentConnections();
  if (curRoute === "dashboard" && user.role === "tutor") drawTutorDashboard();
  if (typeof drawMe === "function" && curRoute === "me") drawMe();
  if (curRoute === "home") location.hash = "workspace";
  if (curRoute === "workspace") drawWorkspace();
}

function authErrorText(error) {
  return error && error.message ? error.message : "Something went wrong. Please try again.";
}

function drawWorkspace() {
  if (!user) return;
  var tutor = user.role === "tutor";
  var roleName = tutor ? "Tutor" : user.role === "student" ? "Student" : "Profile setup";
  document.getElementById("workspaceWelcome").textContent = "Welcome back, " + user.n;
  document.getElementById("workspaceRoleLabel").textContent = roleName + " workspace";
  document.getElementById("workspaceIntro").textContent = tutor
    ? "Manage your tutor space, respond to students, and share what you know."
    : "Find support, ask study questions, and keep your peer learning in one place.";
  document.getElementById("workspaceAccountRole").textContent = roleName;
  document.getElementById("workspaceAccountGrade").textContent = user.grade ? "Class " + user.grade : "Not set yet";
  document.getElementById("workspaceAccountEmail").textContent = user.e || "No email on file";
  document.getElementById("workspaceStatusText").textContent = user.role
    ? "Signed in as a " + roleName.toLowerCase() + " · Class " + (user.grade || "not set") + "."
    : "Signed in, but your profile setup is not finished yet.";
  document.getElementById("workspaceActions").innerHTML = tutor
    ? '<a class="workspace-action" href="#dashboard"><strong>Open tutor dashboard</strong><span>Review student requests and update your availability.</span></a><a class="workspace-action" href="#doubts"><strong>Answer a study doubt</strong><span>Share an explanation with classmates.</span></a><a class="workspace-action" href="#me"><strong>View your profile</strong><span>Check the account details saved in Peer Connect.</span></a>'
    : '<a class="workspace-action" href="#tutors"><strong>Find a tutor</strong><span>Search by subject and request help from a classmate.</span></a><a class="workspace-action" href="#doubts"><strong>Ask a study doubt</strong><span>Post a question or browse what classmates are asking.</span></a><a class="workspace-action" href="#me"><strong>View your profile</strong><span>Check your class and account details.</span></a>';
}

function showPasswordResetForm(email) {
  dlg.classList.add("auth-dialog");
  dbody.innerHTML =
    '<div class="auth-brandline"><span class="auth-brandmark">P</span><span>Peer Connect</span><span class="auth-mode-tag">ACCOUNT RECOVERY</span></div>' +
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
  dlg.classList.add("auth-dialog");
  dbody.innerHTML =
    '<div class="auth-brandline"><span class="auth-brandmark">P</span><span>Peer Connect</span><span class="auth-mode-tag">SECURE ACCOUNT</span></div>' +
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
  dlg.classList.add("auth-dialog");
  dbody.innerHTML =
    '<div class="auth-brandline"><span class="auth-brandmark">P</span><span>Peer Connect</span><span class="auth-mode-tag">' + (signingUp ? "CREATE ACCOUNT" : "SIGN IN") + '</span></div>' +
    '<h3 id="dt">' + (signingUp ? "Create your account" : "Sign in") + '</h3>' +
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
    '</p><button class="btn ghost gfull" id="cx">Cancel</button>';
  if (!dlg.open) dlg.showModal();
  document.getElementById("cx").onclick = function () { dlg.close(); };
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
        else if (signin.data && signin.data.user) await syncAuthUser(signin.data.user);
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
    dlg.classList.remove("auth-dialog");
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
    dlg.classList.remove("auth-dialog");
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
  dlg.classList.remove("auth-dialog");
  onboardingOpen = true;
  var selectedRole = changeRole ? "" : (user.role || "");
  dbody.innerHTML =
    '<h3 id="dt">Set up your profile</h3><p style="color:var(--muted);margin:6px 0 14px">Tell us your name, class, and how you want to use Peer Connect.</p>' +
    '<label for="profileName">Name</label><input id="profileName" autocomplete="name" value="' + esc(user.n) + '">' +
    '<label for="profileGrade">Class</label><select id="profileGrade"><option value="">Choose your class</option>' +
    [9, 10, 11, 12].map(function (grade) {
      return '<option value="' + grade + '"' + (Number(user.grade) === grade ? " selected" : "") + '>Class ' + grade + '</option>';
    }).join("") +
    '</select><label>Choose your account type</label><div class="role-options">' +
    '<button type="button" class="role-option' + (selectedRole === "student" ? " selected" : "") + '" data-role="student"><strong>Student</strong><span>Find tutors, ask questions, and connect without monthly limits.</span></button>' +
    '<button type="button" class="role-option' + (selectedRole === "tutor" ? " selected" : "") + '" data-role="tutor"><strong>Tutor</strong><span>Build a tutor profile, manage requests, and help students.</span></button>' +
    '</div><div class="err" id="profileErr" role="alert"></div>' +
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
    var message = document.getElementById("profileErr");
    if (!name || !grade || !selectedRole) {
      message.textContent = "Add your name, choose your class, and select Student or Tutor.";
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
    user.n = name;
    user.grade = grade;
    user.role = selectedRole;
    onboardingOpen = false;
    paintSign();
    paintRoleUI();
    dlg.close();
    await loadTutorDirectory();
    if (selectedRole === "student") await loadStudentConnections();
    if (selectedRole === "tutor") openTutor();
    else location.hash = "home";
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
    }, 0);
  });
  restoreAuthSession().then(async function (session) {
    await syncAuthUser(session ? session.user : null);
    if (passwordRecoveryPending) {
      passwordRecoveryPending = false;
      showPasswordUpdateForm();
    }
  }).catch(function (error) {
    console.error("Could not restore Peer Connect session:", error.message);
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
  dlg.classList.remove("auth-dialog");
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
    '<div class="note">Your badge shows Pending until a teacher or a short topic test verifies you.</div>';
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
document.getElementById("workspaceSignOut").addEventListener("click", async function () {
  var button = this;
  var message = document.getElementById("workspaceSignOutError");
  button.disabled = true;
  message.textContent = "";
  try {
    var result = await supabaseClient.auth.signOut();
    if (result.error) message.textContent = authErrorText(result.error);
  } catch (error) {
    message.textContent = authErrorText(error);
  } finally {
    button.disabled = false;
  }
});

function paintRoleUI() {
  var isTutor = !!user && user.role === "tutor";
  var isSignedIn = !!user;
  document.body.classList.toggle("is-signed-in", isSignedIn);
  document.querySelectorAll('[data-role-nav="tutor"]').forEach(function (el) { el.hidden = !isTutor; });
  var become = document.getElementById("btnTutor");
  var becomeFromPricing = document.getElementById("btnTutor2");
  if (become) become.hidden = isSignedIn;
  if (becomeFromPricing) becomeFromPricing.hidden = isSignedIn;
  var railName = document.getElementById("workspaceRailName");
  var railRole = document.getElementById("workspaceRailRole");
  if (railName) railName.textContent = user ? user.n : "Signed-in account";
  if (railRole) railRole.textContent = user ? ((user.role === "tutor" ? "Tutor" : user.role === "student" ? "Student" : "Member") + (user.grade ? " · Class " + user.grade : "")) : "Peer Connect member";
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
    supabaseClient.from("connections").select("id, requester_id, status, created_at, requester:profiles!connections_requester_id_fkey(display_name, grade)").eq("recipient_id", user.id).order("created_at", { ascending: false }),
  ]);
  if (results[0].error || results[1].error) {
    body.innerHTML = '<div class="box err">' + esc(authErrorText(results[0].error || results[1].error)) + '</div>';
    return;
  }
  var profile = results[0].data;
  var requests = results[1].data || [];
  var pending = requests.filter(function (r) { return r.status === "pending"; }).length;
  var accepted = requests.filter(function (r) { return r.status === "accepted"; }).length;
  body.innerHTML = '<div class="dash-stats"><div class="dash-stat"><b>' + pending + '</b><span>Requests to review</span></div><div class="dash-stat"><b>' + accepted + '</b><span>Connections</span></div><div class="dash-stat"><b>' + (profile && profile.is_available ? "Available" : "Paused") + '</b><span>Profile visibility</span></div></div>' +
    '<div class="dash-grid"><section class="box"><div class="dash-heading"><div><b>Your tutor profile</b><p class="muted">' + esc(profile ? profile.headline || "Add a headline" : "Create your profile so classmates can find you.") + '</p></div><button class="btn ghost" data-edit-tutor>Edit profile</button></div><p class="muted">Subjects: ' + esc(profile && profile.subjects ? profile.subjects.join(", ") : "Not set") + '</p><label class="availability"><input type="checkbox" data-available ' + (profile && profile.is_available ? "checked" : "") + ' ' + (!profile ? "disabled" : "") + '> Show my profile in tutor search</label></section><section class="box"><b>Tutor perks</b><ul class="perks"><li>Unlimited student connection requests</li><li>Incoming requests in one dashboard</li><li>Set your availability whenever you need</li><li>Optional Blue Tick planned as a one-time purchase</li></ul><p class="muted">Teacher or topic-test verification is separate and remains free.</p></section></div>' +
    '<section class="box request-box"><div class="dash-heading"><div><b>Student requests</b><p class="muted">Accept requests from classmates you can help.</p></div></div>' + (requests.length ? requests.map(function (r) { var p = Array.isArray(r.requester) ? r.requester[0] : r.requester || {}; return '<article class="request-row"><div><b>' + esc(p.display_name || "Student") + '</b><p class="muted">Class ' + esc(String(p.grade || "—")) + ' · ' + esc(r.status) + '</p></div>' + (r.status === "pending" ? '<div class="row"><button class="btn" data-request-action="accepted" data-request-id="' + esc(r.id) + '">Accept</button><button class="btn ghost" data-request-action="rejected" data-request-id="' + esc(r.id) + '">Decline</button></div>' : '') + '</article>'; }).join("") : '<p class="muted">No student requests yet. Keep your profile available to appear in search.</p>') + '</section>';
}
document.getElementById("tutorDashboardBody").addEventListener("click", async function (e) {
  var action = e.target.closest("[data-request-action]");
  if (action) {
    action.disabled = true;
    var result = await supabaseClient.from("connections").update({ status: action.dataset.requestAction }).eq("id", action.dataset.requestId).eq("recipient_id", user.id);
    if (result.error) window.alert(authErrorText(result.error));
    await drawTutorDashboard();
  } else if (e.target.closest("[data-edit-tutor]")) openTutor();
});
document.getElementById("tutorDashboardBody").addEventListener("change", async function (e) {
  if (!e.target.matches("[data-available]")) return;
  var result = await supabaseClient.from("tutor_profiles").update({ is_available: e.target.checked }).eq("user_id", user.id);
  if (result.error) window.alert(authErrorText(result.error));
  await loadTutorDirectory();
  await drawTutorDashboard();
});

var posts = [];
var fSub = "All",
  openR = {},
  nextId = 1;
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
fch.addEventListener("click", function (e) {
  var b = e.target.closest("[data-fs]");
  if (!b) return;
  fSub = b.dataset.fs;
  drawFeed();
});
flist.addEventListener("click", function (e) {
  var b = e.target.closest("[data-act]");
  if (!b) return;
  var id = +b.dataset.id,
    p = posts.filter(function (x) {
      return x.id === id;
    })[0],
    a = b.dataset.act;
  if (a === "like") {
    p.liked = !p.liked;
    p.likes += p.liked ? 1 : -1;
    drawFeed();
  } else if (a === "reply") {
    openR[id] = !openR[id];
    drawFeed();
    if (openR[id]) {
      var i = document.getElementById("ri" + id);
      if (i) i.focus();
    }
  } else if (a === "send") {
    var inp = document.getElementById("ri" + id),
      v = inp.value.trim();
    if (!v) {
      inp.focus();
      return;
    }
    p.rep.push({ n: who().n, t: v });
    drawFeed();
  }
});
var ft = document.getElementById("fText"),
  fc = document.getElementById("fCount");
ft.addEventListener("input", function () {
  fc.textContent = 200 - ft.value.length;
});
document.getElementById("fPost").addEventListener("click", function () {
  var v = ft.value.trim(),
    er = document.getElementById("ferr");
  if (!v) {
    er.textContent = "Write your doubt first.";
    return;
  }
  er.textContent = "";
  var w = who();
  posts.unshift({
    id: nextId++,
    n: w.n,
    g: w.g,
    sub: fsel.value,
    t: v,
    ago: "now",
    likes: 0,
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
    p.sub.replace(/ /g, "") +
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
          "<b>" +
          esc(r.n) +
          "</b>" +
          (hasBlue(r.n) ? BT : "") +
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
    "</button></div>" +
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
    if (fSort === "new") return b.id - a.id;
    if (fSort === "top") return b.likes - a.likes;
    return b.likes + 2 * b.rep.length - (a.likes + 2 * a.rep.length);
  });
  flist.innerHTML = list.length
    ? list.map(postHtml).join("")
    : '<div class="empty">No doubts here yet. Be the first to ask one.</div>';
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
  h += '<div class="box"><b>Account</b><p ' + mu + '>' + (user ? esc(user.n) + " · " + esc(user.e) + "<br>" + (user.role === "tutor" ? "Tutor" : "Student") + " · Class " + esc(String(user.grade || "")) : "You are not signed in.") + '</p>' + (user ? '' : '<button class="btn" data-go="signin">Sign up / Sign in</button>') + '</div>';
  h += '<div class="box"><b>Connections</b><p ' + mu + '>Unlimited connection requests for every student account.</p><a class="btn ghost" href="#tutors">Find a tutor</a></div>';
  h += '<div class="box"><b>Tutor profile</b><p ' + mu + '>' + (user && user.role === "tutor" ? 'Your tutor tools and incoming requests are on your <a href="#dashboard">dashboard</a>.' : user ? 'This account is set up for student access.' : 'Sign in and choose your account type to get started.') + '</p>' + (user && user.role === "tutor" ? '<a class="btn" href="#dashboard">Tutor dashboard</a>' : '') + '</div>';
  var w = who();
  var mp = posts.filter(function (p) { return p.n === w.n; });
  h += '<div class="box"><b>Your doubts (' + mp.length + ')</b>' + (mp.length ? '<ul style="margin:8px 0 0;padding-left:20px">' + mp.map(function (p) { return "<li>" + esc(p.t) + "</li>"; }).join("") + '</ul>' : '<p ' + mu + '>You have not asked a doubt yet.</p><a class="btn ghost" href="#doubts">Ask a doubt</a>') + '</div>';
  document.getElementById("meBody").innerHTML = h;
}
document.getElementById("meBody").addEventListener("click", function (e) {
  var b = e.target.closest("[data-go]");
  if (!b) return;
  if (b.dataset.go === "signin") openSign();
  else openTutor();
});
dlg.addEventListener("close", function () {
  if (user && (!user.role || !user.grade)) onboardingOpen = false;
  if (curRoute === "me") drawMe();
});
var routes = ["home", "workspace", "tutors", "doubts", "pricing", "me", "dashboard"],
  names = {
    home: "Home",
    workspace: "Workspace",
    tutors: "Tutors",
    doubts: "Doubts",
    pricing: "Pricing",
    me: "My page",
    dashboard: "Tutor dashboard",
  };
function route() {
  var h = location.hash.replace("#", "");
  if (routes.indexOf(h) < 0) h = "home";
  if (user && h === "home") h = "workspace";
  if (!user && h === "workspace") h = "home";
  if (h === "dashboard" && (!user || user.role !== "tutor")) h = user ? "workspace" : "home";
  curRoute = h;
  document.querySelectorAll("[data-v]").forEach(function (el) {
    el.hidden = el.dataset.v.split(" ").indexOf(h) < 0;
  });
  document.querySelectorAll("[data-nav]").forEach(function (a) {
    if (a.dataset.nav === h) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = names[h] + " | Peer Connect";
  if (h === "workspace") drawWorkspace();
  if (h === "me") drawMe();
  if (h === "dashboard") drawTutorDashboard();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
drawFeed();
route();
