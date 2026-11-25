/*
 * Peer Connect app.js
 * ------------------------------------------------------------
 * All behavior lives in this file. There is no framework and no build step.
 * Supabase handles Auth, profiles, verified tutors, private verification files,
 * bookings, doubts, and answers.
 *
 * Map of this file (search for these names):
 *   STATE        tutors, posts, user, mine, fSub, fSort, openR
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
  tutorState = "",
  tutorCity = "";
var activeTutorProfile = null;
var pendingBookingMentorId = "";
function canMentor(account) { return !!account && ["mentor", "both", "tutor"].indexOf(account.role) >= 0; }
function canLearn(account) { return !!account && ["learner", "both", "student"].indexOf(account.role) >= 0; }
function normalizeRole(role) { return role === "student" ? "learner" : role === "tutor" ? "mentor" : role; }
function accountTypeLabel(role) { return role === "both" ? "Learner + Mentor" : canMentor({ role: role }) ? "Mentor" : "Learner"; }
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
  document.getElementById("count").textContent = list.length + (list.length === 1 ? " verified mentor" : " verified mentors");
  if (!list.length) {
    grid.innerHTML = tutors.length
      ? '<div class="empty">No mentors match. Try another subject or a shorter search.</div>'
      : '<div class="empty">No mentor profiles have been approved for search yet.</div>';
    return;
  }
  grid.innerHTML = list
    .map(function (t) {
      var i = tutors.indexOf(t);
      return (
        '<article class="card" data-profile-index="' + i + '" tabindex="0" aria-label="View ' + esc(t.n) + ' mentor profile"><div class="cover mentor-card-cover" style="--c:' +
        t.c +
        '">' + (t.bannerUrl ? '<img class="mentor-banner-img" src="' + esc(t.bannerUrl) + '" alt="" loading="lazy">' : '') + '<span class="mentor-card-kicker">Verified mentor</span></div><div class="body">' +
        '<div class="av">' +
        (t.avatarUrl ? '<img src="' + esc(t.avatarUrl) + '" alt="">' : ini(t.n)) +
        "</div>" +
        '<h3><span class="tutor-name">' +
        esc(t.n) +
        (t.blue ? BT : "") +
        (t.verified ? ' <span class="verify-badge">Verified</span>' : t.me ? ' <span class="verify-review-state">' + esc(t.verificationStatus || "Not verified") + '</span>' : '') +
        '</span>' + (t.verified && t.available ? '<span class="tutor-online" title="Available"></span>' : '') + '</h3>' +
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
        (t.me
          ? '<button class="btn ghost" data-edit-tutor-card>Edit profile</button>'
          : '<div class="mentor-booking-cta"><span>Free · 30 min</span><button class="btn" data-book-mentor="' + esc(t.user_id) + '">Book now</button></div>') +
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
  if (e.target.closest("[data-edit-tutor-card]")) { e.stopPropagation(); openTutor(); return; }
  var book = e.target.closest("[data-book-mentor]");
  if (book) {
    e.stopPropagation();
    if (!user) { openSign(); return; }
    if (!canLearn(user)) { document.getElementById("count").textContent = "Choose Learner or Both in your profile to book a mentor."; return; }
    startMentorBooking(tutors[Number(book.closest("[data-profile-index]").dataset.profileIndex)]);
    return;
  }
  var card = e.target.closest("[data-profile-index]");
  if (card) showTutorProfile(tutors[Number(card.dataset.profileIndex)]);
});
grid.addEventListener("keydown", function (e) {
  var card = e.target.closest("[data-profile-index]");
  if (!card || e.target.closest("button")) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showTutorProfile(tutors[Number(card.dataset.profileIndex)]); }
});

async function showTutorProfile(tutor) {
  if (!tutor) return;
  activeTutorProfile = tutor;
  if (location.hash !== "#profile") location.hash = "profile";
  else route();
}
function renderTutorProfilePage() {
  var tutor = activeTutorProfile;
  var root = document.getElementById("tutorProfileContent");
  if (!tutor || !root) return;
  var locationText = [tutor.school, tutor.city, tutor.state, tutor.country].filter(Boolean).join(" · ");
  root.innerHTML = '<button type="button" class="btn ghost profile-back" id="profileBack">← Back to mentors</button><div class="profile-cover" id="profileCover"></div><section class="profile-head"><div class="av" id="profileAvatar">' + (tutor.avatarUrl ? '<img src="' + esc(tutor.avatarUrl) + '" alt="">' : esc(ini(tutor.n))) + '</div><h2>' + esc(tutor.n) + (tutor.verified ? ' <span class="verify-badge">Verified</span>' : tutor.me ? ' <span class="verify-review-state">' + esc(tutor.verificationStatus || "Not verified") + '</span>' : '') + '</h2><div class="profile-meta">Class ' + esc(String(tutor.g || "").replace(/^Class\s*/i, "")) + ' · ' + esc(locationText) + '</div><p>' + esc(tutor.h) + '</p><div class="tags">' + tutor.s.map(function (subject) { return '<span class="tag">' + esc(subject) + '</span>'; }).join("") + '</div><div class="profile-social" id="profileSocialStats"><span>Loading followers…</span></div><button class="btn" id="profileBook">' + (tutor.me ? 'Edit mentor profile' : 'Book a session') + '</button>' + (tutor.me ? '<div class="profile-appearance"><label class="btn ghost">Change profile photo<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-image="avatar"></label><label class="btn ghost">Change banner<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-image="banner"></label></div>' : '') + '</section><div class="profile-tabs"><button class="btn ghost" data-profile-tab="about" aria-pressed="true">About</button><button class="btn ghost" data-profile-tab="answers" aria-pressed="false">Answers</button></div><div class="profile-content" id="profileContent"><h3>About</h3><p>' + esc(tutor.h || 'Peer tutor') + '</p><p class="muted">School: ' + esc(tutor.school || '—') + '<br>Location: ' + esc([tutor.city, tutor.state, tutor.country].filter(Boolean).join(', ') || '—') + '</p></div>';
  var cover = document.getElementById("profileCover");
  if (tutor.bannerUrl) cover.style.backgroundImage = 'url("' + tutor.bannerUrl.replace(/["\\\\]/g, "") + '")';
  loadProfileSocial(tutor);
  root.querySelectorAll("[data-profile-image]").forEach(function (input) {
    input.onchange = async function () { if (input.files[0]) await uploadProfileImage(input.files[0], input.dataset.profileImage); };
  });
  document.getElementById("profileBack").onclick = function () { location.hash = "home"; };
  document.getElementById("profileBook").onclick = async function () {
    if (tutor.me) { openTutor(); return; }
    if (!user) { openSign(); return; }
    if (!canLearn(user)) { document.getElementById("profileContent").textContent = "Choose Learner or Both in your profile to book a session."; return; }
    startMentorBooking(tutor);
  };
  var socialRoot = document.getElementById("profileSocialStats");
  socialRoot.onclick = async function (event) {
    var followButton = event.target.closest("[data-follow-profile]");
    if (!followButton) return;
    if (!user) { openSign(); return; }
    followButton.disabled = true;
    var action = followButton.dataset.following === "true" ? supabaseClient.from("follows").delete().eq("follower_id", user.id).eq("following_id", tutor.user_id) : supabaseClient.from("follows").insert({ follower_id: user.id, following_id: tutor.user_id });
    var result = await action;
    if (result.error) { followButton.disabled = false; window.alert(authErrorText(result.error)); return; }
    loadProfileSocial(tutor);
  };
  root.querySelectorAll("[data-profile-tab]").forEach(function (button) {
    button.onclick = async function () {
      root.querySelectorAll("[data-profile-tab]").forEach(function (tab) { tab.setAttribute("aria-pressed", String(tab === button)); });
      var content = document.getElementById("profileContent");
      if (button.dataset.profileTab === "about") {
        content.innerHTML = '<h3>About</h3><p>' + esc(tutor.h || 'Peer Connect mentor') + '</p><p class="muted">School: ' + esc(tutor.school || '—') + '<br>Location: ' + esc([tutor.city, tutor.state, tutor.country].filter(Boolean).join(', ') || '—') + '</p>';
        return;
      }
      content.innerHTML = '<p class="muted">Loading answers…</p>';
      var result = await supabaseClient.from("answers").select("content, created_at, doubts(title, subject)").eq("author_id", tutor.user_id).order("created_at", { ascending: false }).limit(10);
      if (result.error) { content.innerHTML = '<p class="muted">Answers are unavailable right now.</p>'; return; }
      content.innerHTML = (result.data || []).length ? '<h3>Recent answers</h3>' + result.data.map(function (answer) { var doubt = Array.isArray(answer.doubts) ? answer.doubts[0] : answer.doubts || {}; return '<article class="box"><b>' + esc(doubt.subject || 'Answer') + '</b><p>' + esc(answer.content || '') + '</p>' + (doubt.title ? '<p class="muted">On: ' + esc(doubt.title) + '</p>' : '') + '</article>'; }).join("") : '<p class="muted">No answers yet.</p>';
    };
  });
}
async function loadProfileSocial(tutor) {
  var target = document.getElementById("profileSocialStats");
  if (!target || !tutor) return;
  var queries = [
    supabaseClient.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", tutor.user_id),
    supabaseClient.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", tutor.user_id),
  ];
  if (user && user.id !== tutor.user_id) queries.push(supabaseClient.from("follows").select("following_id").eq("follower_id", user.id).eq("following_id", tutor.user_id).maybeSingle());
  var results = await Promise.all(queries);
  if (results[0].error || results[1].error) { target.innerHTML = '<span>Followers unavailable</span>'; return; }
  var following = !!(user && user.id !== tutor.user_id && results[2] && results[2].data);
  target.innerHTML = '<span><b>' + (results[0].count || 0) + '</b> followers</span><span><b>' + (results[1].count || 0) + '</b> following</span>' + (user && user.id !== tutor.user_id ? '<button type="button" class="btn ghost" data-follow-profile data-following="' + following + '">' + (following ? 'Following' : 'Follow') + '</button>' : '');
}
async function uploadProfileImage(file, kind) {
  if (!user || !supabaseClient) return;
  var allowed = ["image/jpeg", "image/png", "image/webp"];
  if (allowed.indexOf(file.type) < 0 || file.size > 5 * 1024 * 1024) { window.alert("Choose a JPG, PNG, or WebP image under 5 MB."); return; }
  var ext = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  var path = user.id + "/" + kind + "-" + Date.now() + "." + ext;
  var upload = await supabaseClient.storage.from("profile-media").upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) { window.alert(authErrorText(upload.error) + " — run the Peer Connect profile media SQL first."); return; }
  var url = supabaseClient.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
  var field = kind === "avatar" ? "avatar_url" : "profile_banner_url";
  var update = await supabaseClient.from("profiles").update({ [field]: url }).eq("id", user.id);
  if (update.error) { await supabaseClient.storage.from("profile-media").remove([path]); window.alert(authErrorText(update.error)); return; }
  if (kind === "avatar") user.avatarUrl = url; else user.bannerUrl = url;
  if (activeTutorProfile && activeTutorProfile.user_id === user.id) {
    if (kind === "avatar") activeTutorProfile.avatarUrl = url; else activeTutorProfile.bannerUrl = url;
    renderTutorProfilePage();
  }
  if (curRoute === "me") drawMe();
  var ownTutor = tutors.find(function (tutor) { return tutor.user_id === user.id; });
  if (ownTutor) { if (kind === "avatar") ownTutor.avatarUrl = url; else ownTutor.bannerUrl = url; draw(); }
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
      available: !!row.is_available,
      c: "#2B4EFF",
      me: row.user_id === user.id,
    };
  });
  if (tutors.length) {
    var directoryIds = tutors.map(function (tutor) { return tutor.user_id; });
    var directoryMeta = await Promise.all([
      supabaseClient.from("profiles").select("id, avatar_url, profile_banner_url").in("id", directoryIds),
      supabaseClient.from("follows").select("follower_id, following_id").or("follower_id.in.(" + directoryIds.join(",") + "),following_id.in.(" + directoryIds.join(",") + ")"),
    ]);
    var mediaByUser = {}, followerCounts = {}, followingCounts = {};
    (directoryMeta[0].data || []).forEach(function (profile) { mediaByUser[profile.id] = profile; });
    (directoryMeta[1].data || []).forEach(function (follow) {
      followerCounts[follow.following_id] = (followerCounts[follow.following_id] || 0) + 1;
      followingCounts[follow.follower_id] = (followingCounts[follow.follower_id] || 0) + 1;
    });
    tutors.forEach(function (tutor) { var media = mediaByUser[tutor.user_id] || {}; tutor.avatarUrl = media.avatar_url || ""; tutor.bannerUrl = media.profile_banner_url || ""; tutor.followerCount = followerCounts[tutor.user_id] || 0; tutor.followingCount = followingCounts[tutor.user_id] || 0; });
  }
  if (canMentor(user) && !tutors.some(function (tutor) { return tutor.user_id === user.id; })) {
    var ownResults = await Promise.all([
      supabaseClient.from("tutor_profiles").select("user_id, headline, subjects, is_available").eq("user_id", user.id).maybeSingle(),
      supabaseClient.from("tutor_verification_requests").select("status").eq("user_id", user.id).order("submitted_at", { ascending: false }).limit(1),
    ]);
    var own = ownResults[0].data;
    if (own) {
      var ownStatus = (ownResults[1].data || [])[0],
        statusLabel = ownStatus && ownStatus.status === "pending" ? "Pending review" : ownStatus && ownStatus.status === "rejected" ? "Needs resubmission" : "Not verified";
      tutors.push({
        user_id: own.user_id, n: user.n, g: user.grade ? "Class " + user.grade : "Student tutor",
        s: own.subjects || [], h: own.headline || "Peer tutor",
        school: user.location && user.location.school || "", city: user.location && user.location.city || "",
        state: user.location && user.location.state || "", country: user.location && user.location.country || "",
        verified: !!(ownStatus && ownStatus.status === "verified"), verificationStatus: statusLabel,
        available: !!own.is_available, c: "#2B4EFF", me: true,
        avatarUrl: user.avatarUrl || "", bannerUrl: user.bannerUrl || "",
      });
    }
  }
  subjects = ["All"].concat(
    Array.from(new Set(tutors.reduce(function (all, tutor) {
      return all.concat(tutor.s);
    }, []))),
  );
  drawChips();
  drawTutorLocationFilters();
  draw();
}

drawChips();
draw();

var dlg = document.getElementById("dlg"),
  dbody = document.getElementById("dbody");

var user = null,
  gs = document.getElementById("gsign"),
  supabaseClient = null,
  onboardingOpen = false,
  signingOutInApp = false,
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
    if (location.hash !== "#home") {
      history.replaceState(null, document.title, location.pathname + location.search + "#home");
      route();
    }
    if (typeof drawMe === "function" && curRoute === "me") drawMe();
    return;
  }
  var name =
    (authUser.user_metadata &&
      (authUser.user_metadata.display_name ||
        authUser.user_metadata.full_name ||
        authUser.user_metadata.name)) ||
    (authUser.email ? authUser.email.split("@")[0] : "Learner");
  var profileResult = null;
  if (supabaseClient) {
    profileResult = await supabaseClient
      .from("profiles")
      .select("display_name, role, grade, avatar_url, profile_banner_url")
      .eq("id", authUser.id)
      .maybeSingle();
    if (!profileResult.error && profileResult.data && profileResult.data.display_name) {
      name = profileResult.data.display_name;
    }
  }
  var locationResult = supabaseClient ? await supabaseClient.from("profile_locations")
    .select("city, state, country, school").eq("user_id", authUser.id).maybeSingle() : null;
  if (profileResult && profileResult.error) {
    showProfileLoadError(profileResult.error);
    return;
  }
  if (locationResult && locationResult.error) {
    showProfileLoadError(locationResult.error);
    return;
  }
  user = {
    id: authUser.id,
    n: name,
    e: authUser.email || "",
    role: profileResult && profileResult.data ? profileResult.data.role : null,
    grade: profileResult && profileResult.data ? profileResult.data.grade : null,
    avatarUrl: profileResult && profileResult.data ? profileResult.data.avatar_url : null,
    bannerUrl: profileResult && profileResult.data ? profileResult.data.profile_banner_url : null,
    location: locationResult && !locationResult.error ? locationResult.data : null,
  };
  var adminResult = await supabaseClient.from("verification_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  isVerificationAdmin = !adminResult.error && !!adminResult.data;
  paintSign();
  paintRoleUI();
  if ((!user.role || !user.grade || missingProfileLocation(user.location)) && !onboardingOpen) openOnboarding(false);
  if (user.role) loadTutorDirectory();
  if (curRoute === "dashboard" && canMentor(user)) drawTutorDashboard();
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

function showProfileLoadError(error) {
  onboardingOpen = false;
  dlg.classList.remove("auth-screen", "profile-dialog", "setup-dialog");
  dbody.innerHTML = '<h3 id="dt">Couldn’t load your saved profile</h3><p class="muted">Peer Connect could not read your account setup, so it won’t ask you to fill it in again until the read works.</p><div class="err" id="profileLoadErr" role="alert">' + esc(authErrorText(error)) + '</div><div class="row"><button class="btn ghost" id="retryProfileLoad">Try again</button><button class="btn" id="profileErrorSignOut">Sign out</button></div>';
  if (!dlg.open) dlg.showModal();
  document.getElementById("retryProfileLoad").onclick = async function () {
    dlg.close();
    var session = await supabaseClient.auth.getSession();
    if (session.error) showProfileLoadError(session.error);
    else if (session.data.session) await syncAuthUser(session.data.session.user);
    else { showAuthForm("signin"); }
  };
  document.getElementById("profileErrorSignOut").onclick = signOutToLanding;
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
  dlg.classList.remove("profile-dialog");
  dlg.classList.remove("setup-dialog");
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
    '<p>Meet learners who understand your classes, questions, and goals. Share what you know and get unstuck together.</p>' +
    '<div class="auth-feature-stack"><div class="auth-feature"><b>◎</b><span><strong>Find a mentor</strong> who knows your subject</span></div>' +
    '<div class="auth-feature"><b>↗</b><span><strong>Ask a doubt</strong> and learn from the community</span></div>' +
    '<div class="auth-feature"><b>✓</b><span><strong>Book a session</strong> with a verified mentor</span></div></div></div>' +
    '<div class="auth-brand-foot">A peer-learning community</div></aside>';
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
    dlg.classList.remove("auth-screen", "setup-dialog");
    dbody.innerHTML =
      '<h3 id="dt">Your Peer Connect account</h3><p style="color:var(--muted)">' +
      esc(user.n) +
      "<br>" +
      esc(user.e) +
      (user.role
        ? "<br>Account type: " + accountTypeLabel(user.role)
        : "") +
      '</p><div class="err" id="accountErr" role="alert"></div><div class="row"><button class="btn ghost" id="cx">Close</button><button class="btn" id="so">Sign out</button></div>';
    dlg.showModal();
    document.getElementById("cx").onclick = function () { dlg.close(); };
    document.getElementById("so").onclick = signOutToLanding;
    return;
  }
  showAuthForm("signin");
}

async function signOutToLanding() {
  var button = document.getElementById("so") || document.getElementById("profileErrorSignOut");
  var message = document.getElementById("accountErr") || document.getElementById("profileLoadErr");
  if (button) { button.disabled = true; button.textContent = "Signing out…"; }
  signingOutInApp = true;
  try {
    var result = await supabaseClient.auth.signOut();
    if (result.error) {
      if (message) message.textContent = authErrorText(result.error);
      if (button) { button.disabled = false; button.textContent = "Sign out"; }
      signingOutInApp = false;
      return;
    }
    // Clear the local signed-in state directly. Avoid another profile reload
    // during sign-out, which can reopen the profile-permission error dialog.
    user = null;
    isVerificationAdmin = false;
    studentEntryPending = true;
    posts = [];
    openR = {};
    paintSign();
    paintRoleUI();
    history.replaceState(null, document.title, location.pathname + location.search + "#home");
    route();
    if (dlg.open) dlg.close();
    showAuthForm("signin");
    window.setTimeout(function () { signingOutInApp = false; }, 1200);
  } catch (error) {
    var currentMessage = document.getElementById("accountErr") || document.getElementById("profileLoadErr");
    var currentButton = document.getElementById("so") || document.getElementById("profileErrorSignOut");
    if (currentMessage) currentMessage.textContent = authErrorText(error);
    if (currentButton) { currentButton.disabled = false; currentButton.textContent = "Sign out"; }
    signingOutInApp = false;
  }
}

function openOnboarding(changeRole) {
  if (!user || !supabaseClient || onboardingOpen) return;
  dlg.classList.remove("auth-screen");
  dlg.classList.remove("profile-dialog");
  dlg.classList.add("setup-dialog");
  onboardingOpen = true;
  var selectedRole = normalizeRole(user.role) || (changeRole ? "" : "learner");
  var savedLocation = user.location || {};
  var rolePicker = '<fieldset class="role-options"><legend>How do you want to use Peer Connect?</legend><button type="button" class="role-option' + (selectedRole === "learner" || selectedRole === "student" ? " selected" : "") + '" data-role="learner" aria-pressed="' + (selectedRole === "learner" || selectedRole === "student") + '"><strong>Learner</strong><span>Find mentors, ask questions, and get guidance.</span></button><button type="button" class="role-option' + (selectedRole === "mentor" || selectedRole === "tutor" ? " selected" : "") + '" data-role="mentor" aria-pressed="' + (selectedRole === "mentor" || selectedRole === "tutor") + '"><strong>Mentor</strong><span>Share what you know and guide learners in lower classes.</span></button><button type="button" class="role-option' + (selectedRole === "both" ? " selected" : "") + '" data-role="both" aria-pressed="' + (selectedRole === "both") + '"><strong>Both</strong><span>Get guidance from seniors and mentor learners in lower classes.</span></button></fieldset>';
  dbody.innerHTML =
    '<h3 id="dt">Set up your profile</h3><p style="color:var(--muted);margin:6px 0 14px">Add your school and location so you can find peers nearby. Learner location details are shared only with a mentor after they send a request.</p>' +
    '<label for="profileName">Name</label><input id="profileName" autocomplete="name" value="' + esc(user.n) + '">' +
    '<label for="profileGrade">Class</label><select id="profileGrade" required aria-label="Choose your class"><option value="">Choose your class</option>' +
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
        var selected = option.dataset.role === selectedRole;
        option.classList.toggle("selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
    };
  });
  document.getElementById("saveProfile").onclick = async function () {
    var saveButton = this;
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
    if (grade < 9 || grade > 12) { message.textContent = "Choose a class from 9 to 12."; return; }
    saveButton.disabled = true;
    saveButton.textContent = "Saving profile…";
    message.textContent = "";
    var saved = await supabaseClient.rpc("save_peer_connect_profile", {
      p_display_name: name, p_grade: grade, p_role: selectedRole,
      p_school: school, p_city: city, p_state: state, p_country: country,
    });
    if (saved.error && saved.error.code === "PGRST202") {
      var profileSave = await supabaseClient.from("profiles").update({ display_name: name, grade: grade, role: selectedRole }).eq("id", user.id).select("id").maybeSingle();
      if (profileSave.error || !profileSave.data) {
        message.textContent = authErrorText(profileSave.error || { message: "Your account profile was not found." }) + " — run peer_connect_profile_setup_fix.sql in Supabase SQL Editor.";
        saveButton.disabled = false; saveButton.textContent = "Continue"; return;
      }
      var locationSave = await supabaseClient.from("profile_locations").upsert({ user_id: user.id, school: school, city: city, state: state, country: country });
      if (locationSave.error) {
        message.textContent = authErrorText(locationSave.error) + " — run peer_connect_profile_setup_fix.sql in Supabase SQL Editor.";
        saveButton.disabled = false; saveButton.textContent = "Continue"; return;
      }
    } else if (saved.error) {
      message.textContent = authErrorText(saved.error);
      saveButton.disabled = false; saveButton.textContent = "Continue"; return;
    }
    user.n = name;
    user.grade = grade;
    user.role = selectedRole;
    user.location = { school: school, city: city, state: state, country: country };
    onboardingOpen = false;
    paintSign();
    paintRoleUI();
    dlg.close();
    dlg.classList.remove("setup-dialog");
    await loadTutorDirectory();
    if (canMentor(user)) openTutor();
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
      if (_event === "SIGNED_OUT" && signingOutInApp) { signingOutInApp = false; return; }
      await syncAuthUser(session ? session.user : null);
      if (_event === "PASSWORD_RECOVERY") showPasswordUpdateForm();
      else if (_event === "SIGNED_OUT") {
        history.replaceState(null, document.title, location.pathname + location.search + "#home");
        route();
        if (dlg.open) dlg.close();
        showAuthForm("signin");
      }
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
  dlg.classList.remove("profile-dialog");
  if (!user) {
    openSign();
    return;
  }
  if (!canMentor(user)) {
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
    '<h3 id="dt">' + (existing.data ? "Edit your mentor profile" : "Set up your mentor profile") + '</h3><p style="color:var(--muted);margin:6px 0 0">Your class is saved as Class ' + user.grade + '.</p>' +
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
    '<div class="note">Mentor profiles stay out of search until school ID and fee receipt verification is approved. All classes can apply.</div>';
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
  var isTutor = canMentor(user);
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
    if (title) title.textContent = user.role === "both" ? "Learn and help others grow." : "Help learners grow with confidence.";
    if (intro) intro.textContent = user.role === "both" ? "Learn from mentors and guide learners in lower classes." : "Manage your mentor profile, choose when you are available, and guide learners.";
    if (actions) actions.innerHTML = '<a class="btn" href="#dashboard">Open mentor dashboard</a>' + (user.role === "both" ? '<a class="btn ghost" href="#home">Find a mentor</a>' : '<a class="btn ghost" href="#doubts">Answer a question</a>');
    if (cards) cards.innerHTML = '<a href="#dashboard"><b>Your dashboard</b><span>Review booking requests, profile, and availability in one place.</span></a><a href="#doubts"><b>Share what you know</b><span>Answer questions and build your reputation.</span></a>' + (user.role === "both" ? '<a href="#home"><b>Get guidance</b><span>Find mentors for the subjects you are learning.</span></a>' : '<a href="#pricing"><b>Blue Tick</b><span>Optional one-time payment; price and launch date to be decided.</span></a>');
  } else {
    if (title) title.textContent = "Find a mentor who gets it.";
    if (intro) intro.textContent = "Peer Connect is a learning network for your school. Find mentors, ask questions, and learn from people who know your topics.";
    if (actions) actions.innerHTML = '<a class="btn" href="#home">Find a mentor</a><a class="btn ghost" href="#doubts">Ask a question</a>';
    if (cards) cards.innerHTML = '<a href="#home"><b>Mentors</b><span>Find verified mentors by subject and location.</span></a><a href="#doubts"><b>Questions</b><span>Ask questions, upvote the best ones, and answer what you know.</span></a><a href="#pricing"><b>Pricing</b><span>Free for learners and mentors. Optional Blue Tick may come later.</span></a>';
  }
}
document.querySelectorAll('[data-nav="verification"]').forEach(function (link) {
  link.addEventListener("click", function () { window.setTimeout(drawVerificationAdmin, 0); });
});

var scheduleMentors = [], scheduleTypes = [], scheduleSlots = [], scheduleSlotsContext = null;
var selectedScheduleSlotIndex = null;
var activeChatSession = null, sessionChatPoll = null, sessionChatSignature = "", sessionChatSignedAt = 0, sessionChatBusy = false;
function isoTodayIn(timezone) {
  var parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  var values = {}; parts.forEach(function (part) { values[part.type] = part.value; });
  return values.year + "-" + values.month + "-" + values.day;
}
function zonedInputToIso(value, timezone) {
  var parts = value.split(/[T:-]/).map(Number);
  if (parts.length < 5 || parts.some(function (part) { return !Number.isFinite(part); })) return null;
  var wall = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
  var candidate = wall;
  for (var i = 0; i < 3; i++) {
    var formatted = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
    var got = {}; formatted.forEach(function (part) { got[part.type] = Number(part.value); });
    var shown = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute);
    candidate += wall - shown;
  }
  return new Date(candidate).toISOString();
}
function sessionTime(value, timezone) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone || "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " · " + (timezone || "Asia/Kolkata");
}
function sessionClock(value, timezone) {
  return new Intl.DateTimeFormat(undefined, { timeZone: timezone || "Asia/Kolkata", timeStyle: "short" }).format(new Date(value));
}
function moveIsoDate(value, days) {
  var date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function paintSessionDateStrip() {
  var strip = document.getElementById("sessionDateStrip"), input = document.getElementById("sessionDate");
  if (!strip || !input) return;
  var first = input.value || isoTodayIn("Asia/Kolkata"), today = isoTodayIn("Asia/Kolkata");
  strip.innerHTML = Array.from({ length: 7 }, function (_, index) {
    var date = moveIsoDate(first, index), label = date === today ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
    return '<button type="button" class="session-date' + (date === first ? ' selected' : '') + '" data-session-date="' + date + '"><span>' + label + '</span><b>' + Number(date.slice(-2)) + '</b></button>';
  }).join("");
}
function startMentorBooking(tutor) {
  if (!tutor || !tutor.user_id) return;
  if (!user) { openSign(); return; }
  if (!canLearn(user)) { window.alert("Choose Learner or Both in your profile to book a mentor."); return; }
  pendingBookingMentorId = tutor.user_id;
  scheduleMentors = [{ id: tutor.user_id, name: tutor.n || "Verified mentor" }];
  scheduleTypes = [];
  scheduleSlots = [];
  selectedScheduleSlotIndex = null;
  var title = document.getElementById("bookingMentorTitle"), dialog = document.getElementById("bookingDialog");
  if (title) title.textContent = tutor.n || "Verified mentor";
  renderBookingForm();
  if (dialog && !dialog.open) dialog.showModal();
}
function renderBookingForm() {
  var root = document.getElementById("bookingForm"); if (!root) return;
  if (!scheduleMentors.length) { root.innerHTML = '<div class="community-empty">No verified mentors are available for booking right now.</div><a class="btn ghost" href="#home">Browse mentors</a>'; return; }
  root.innerHTML = '<div class="schedule-form"><input id="sessionType" type="hidden"><p class="session-policy-note">30-minute learning chat · Daily 8:00 AM–8:00 PM IST</p><label class="session-date-label">Choose a day<input id="sessionDate" type="date" min="' + isoTodayIn("Asia/Kolkata") + '" value="' + isoTodayIn("Asia/Kolkata") + '"></label><div id="sessionDateStrip" class="session-date-strip" aria-label="Choose a day"></div><p id="sessionBookingMessage" class="muted" role="status"></p></div><div id="sessionSlots" class="schedule-slots"><div class="community-empty">Finding company-set times…</div></div><div class="session-booking-footer"><span class="session-free-note">Peer Connect sessions are free</span><button class="btn" id="requestSession" type="button" hidden disabled>Request booking</button></div>';
  paintSessionDateStrip();
  document.getElementById("sessionDate").onchange = function () { paintSessionDateStrip(); loadSessionSlots(); };
  document.getElementById("sessionDateStrip").onclick = function (event) {
    var day = event.target.closest("[data-session-date]"); if (!day) return;
    document.getElementById("sessionDate").value = day.dataset.sessionDate;
    selectedScheduleSlotIndex = null;
    paintSessionDateStrip();
    loadSessionSlots();
  };
  root.onclick = async function (event) {
    var slotButton = event.target.closest("[data-session-slot]");
    if (slotButton) {
      selectedScheduleSlotIndex = Number(slotButton.dataset.sessionSlot);
      root.querySelectorAll("[data-session-slot]").forEach(function (button) { button.classList.toggle("selected", button === slotButton); });
      var slot = scheduleSlots[selectedScheduleSlotIndex], requestButton = document.getElementById("requestSession"), message = document.getElementById("sessionBookingMessage");
      if (requestButton) { requestButton.hidden = false; requestButton.disabled = false; }
      if (message && slot) message.textContent = "Selected " + sessionTime(slot.starts_at, slot.timezone) + ". Confirm to send your request.";
      return;
    }
    var request = event.target.closest("#requestSession");
    if (!request || selectedScheduleSlotIndex === null || !scheduleSlotsContext) return;
    request.disabled = true; request.textContent = "Sending booking request…";
    var chosen = scheduleSlots[selectedScheduleSlotIndex];
    var result = await supabaseClient.from("peer_sessions").insert({ connection_id: null, session_type_id: scheduleSlotsContext.typeId, learner_id: user.id, mentor_id: scheduleSlotsContext.mentorId, starts_at: chosen.starts_at, ends_at: chosen.ends_at, timezone: chosen.timezone, status: "pending" });
    var status = document.getElementById("sessionBookingMessage");
    if (result.error) { if (status) status.textContent = authErrorText(result.error); request.disabled = false; request.textContent = "Request booking"; }
    else { selectedScheduleSlotIndex = null; if (status) status.textContent = "Booking request sent. The mentor must confirm it before the chat session is booked."; await loadSessionSlots(); await loadPeerSessionList(); }
  };
  loadSessionTypes();
}
function selectedScheduleMentor() {
  return scheduleMentors.find(function (mentor) { return mentor.id === pendingBookingMentorId; }) || null;
}
async function loadSessionTypes() {
  var mentor = selectedScheduleMentor(), typeInput = document.getElementById("sessionType");
  if (!mentor || !typeInput) return;
  scheduleTypes = [];
  scheduleSlots = [];
  selectedScheduleSlotIndex = null;
  typeInput.value = "";
  var result = await supabaseClient.from("peer_session_types").select("id,duration_minutes,timezone,is_platform_session").eq("mentor_id", mentor.id).eq("is_platform_session", true).eq("is_active", true).maybeSingle();
  if (result.error || !result.data) { var msg=document.getElementById("sessionBookingMessage"); if(msg)msg.textContent=result.error ? authErrorText(result.error) : "Company booking setup is not ready for this mentor."; document.getElementById("sessionSlots").innerHTML='<div class="community-empty">Booking setup is unavailable right now.</div>'; return; }
  scheduleTypes = [result.data];
  typeInput.value = result.data.id;
  loadSessionSlots();
}
async function loadSessionSlots() {
  var mentor = selectedScheduleMentor(), typeSelect = document.getElementById("sessionType"), dateInput = document.getElementById("sessionDate"), slotsRoot = document.getElementById("sessionSlots");
  selectedScheduleSlotIndex = null;
  var requestButton = document.getElementById("requestSession"); if (requestButton) { requestButton.hidden = true; requestButton.disabled = true; }
  if (!mentor || !typeSelect || !dateInput || !slotsRoot || !typeSelect.value) { if(slotsRoot)slotsRoot.innerHTML='<div class="community-empty">Company-set times will appear here.</div>'; return; }
  var type = scheduleTypes.find(function (item) { return item.id === typeSelect.value; });
  if (!type) return;
  slotsRoot.innerHTML = '<div class="muted">Finding open times…</div>';
  var result = await supabaseClient.rpc("get_peer_session_slots", { p_mentor_id: mentor.id, p_session_type_id: type.id, p_from: dateInput.value, p_days: 1 });
  if (result.error) { slotsRoot.innerHTML = '<div class="community-empty">' + esc(authErrorText(result.error)) + '</div>'; return; }
  scheduleSlots = result.data || [];
  scheduleSlotsContext = { mentorId: mentor.id, typeId: type.id };
  slotsRoot.innerHTML = scheduleSlots.length ? scheduleSlots.map(function (slot, index) { return '<button class="schedule-slot" type="button" data-session-slot="' + index + '">' + esc(sessionClock(slot.starts_at, slot.timezone)) + '</button>'; }).join("") : '<div class="community-empty">No open times on this day. Pick another date or check back later.</div>';
}
async function loadPeerSessionList() {
  var root = document.getElementById("sessionList"); if (!root || !user) return;
  var result = await supabaseClient.from("peer_sessions").select("id,connection_id,session_type_id,learner_id,mentor_id,starts_at,ends_at,timezone,status,learner_note,mentor_note,learner:profiles!peer_sessions_learner_id_fkey(display_name),mentor:profiles!peer_sessions_mentor_id_fkey(display_name)").order("starts_at", { ascending: true }).limit(100);
  if (result.error) { root.innerHTML = '<div class="community-empty">Could not load sessions: ' + esc(authErrorText(result.error)) + '</div>'; return; }
  var rows = result.data || [];
  if (!rows.length) { root.innerHTML = '<div class="community-empty">No booked sessions yet. Choose a verified mentor to request a time.</div>'; return; }
  var now = Date.now(); rows.sort(function(a,b){return new Date(a.starts_at)-new Date(b.starts_at);});
  // Keep a confirmed session in the visible Upcoming list for its full duration.
  // Otherwise a session already underway gets tucked into the collapsed history,
  // hiding its chat button exactly when the participants need it.
  var upcoming = rows.filter(function(row){
    if (row.status === "confirmed") return new Date(row.ends_at).getTime() >= now;
    return row.status === "pending" && new Date(row.starts_at).getTime() >= now;
  });
  var previous = rows.filter(function(row){return !upcoming.includes(row);}).reverse();
  function rowHtml(row) {
    var learner=relationRow(row.learner), mentor=relationRow(row.mentor);
    var isMentor = row.mentor_id === user.id, actions = "", chatControl = "", now = Date.now();
    if (isMentor && row.status === "pending") actions = '<button class="btn" data-session-action="confirmed" data-session-id="'+esc(row.id)+'">Confirm</button><button class="btn ghost" data-session-action="declined" data-session-id="'+esc(row.id)+'">Decline</button>';
    if (isMentor && row.status === "confirmed") actions = '<button class="btn" data-session-action="completed" data-session-id="'+esc(row.id)+'">Mark completed</button><button class="btn ghost" data-session-action="no_show" data-session-id="'+esc(row.id)+'">Mark no-show</button>';
    if (["pending","confirmed"].includes(row.status)) actions += '<button class="btn ghost" data-session-action="cancelled" data-session-id="'+esc(row.id)+'">Cancel</button>';
    var starts = new Date(row.starts_at).getTime(), ends = new Date(row.ends_at).getTime();
    if (row.status === "confirmed") {
      if (now >= ends) chatControl = '<button class="btn ghost" data-session-chat="'+esc(row.id)+'">View chat history</button>';
      else if (now >= starts) chatControl = '<button class="btn" data-session-chat="'+esc(row.id)+'">Open session chat</button>';
      else chatControl = '<button class="btn ghost session-chat-locked" type="button" disabled title="The booked chat opens when the session starts">Chat opens '+esc(sessionTime(row.starts_at,row.timezone))+'</button>';
    } else if (["completed","no_show","cancelled"].includes(row.status) && starts <= now) {
      chatControl = '<button class="btn ghost" data-session-chat="'+esc(row.id)+'">View chat history</button>';
    } else if (row.status === "pending") {
      chatControl = '<span class="session-chat-locked">Chat opens after the mentor confirms</span>';
    }
    return '<article class="session-row"><b>30-minute session · '+esc(row.status.replace("_"," "))+'</b><p>'+esc(isMentor ? (learner.display_name || "Learner") : (mentor.display_name || "Mentor"))+' · '+esc(sessionTime(row.starts_at,row.timezone))+'</p>'+(row.learner_note?'<p>Note: '+esc(row.learner_note)+'</p>':'')+((actions||chatControl)?'<div class="session-actions">'+actions+chatControl+'</div>':'')+'</article>';
  }
  root.innerHTML = '<h3>Upcoming</h3>'+(upcoming.length?upcoming.map(rowHtml).join(""):'<p class="muted">No upcoming sessions.</p>')+'<details><summary>Past and cancelled · '+previous.length+'</summary>'+(previous.length?previous.map(rowHtml).join(""):'<p class="muted">Nothing here yet.</p>')+'</details>';
}
async function loadPeerSessionsPage() {
  var note = document.getElementById("sessionPageNote"), tools = document.getElementById("mentorScheduleTools");
  if (note) note.textContent = !user ? "Sign in to view your booked sessions." : (canMentor(user) && !canLearn(user) ? "Review learner bookings and block times you are unavailable." : (canMentor(user) ? "Your bookings appear here as a learner and a mentor." : "Your booked sessions and chats appear here."));
  if (tools) { tools.hidden = true; tools.innerHTML = ""; }
  if (!user) {
    var root = document.getElementById("sessionList");
    if (root) root.innerHTML = '<div class="community-empty">Sign in to see your session requests and chats.</div><button type="button" class="btn" data-schedule-signin>Sign in</button>';
    return;
  }
  if (canMentor(user) && tools) {
    var statusResult = await supabaseClient.from("tutor_verification_requests").select("status").eq("user_id", user.id).order("submitted_at", { ascending: false }).limit(1);
    var latestStatus = statusResult.data && statusResult.data[0];
    tools.hidden = false;
    if (statusResult.error) tools.innerHTML = '<p class="muted">Could not load availability settings: ' + esc(authErrorText(statusResult.error)) + '</p>';
    else if (latestStatus && latestStatus.status === "verified") { tools.innerHTML = scheduleManagerMarkup(); await loadMentorScheduleControls(); }
    else tools.innerHTML = '<h2>Availability</h2><p class="muted">Complete mentor verification before you can block booking times.</p><a class="btn ghost" href="#dashboard">Open mentor dashboard</a>';
  }
  await loadPeerSessionList();
}
document.getElementById("refreshSessions").addEventListener("click", loadPeerSessionsPage);
document.getElementById("sessionList").addEventListener("click", async function(event){
  if (event.target.closest("[data-schedule-signin]")) { openSign(); return; }
  var chatButton=event.target.closest("[data-session-chat]"); if(chatButton){openSessionChat(chatButton.dataset.sessionChat);return;}
  var button=event.target.closest("[data-session-action]"); if(!button)return; button.disabled=true;
  var result=await supabaseClient.from("peer_sessions").update({status:button.dataset.sessionAction}).eq("id",button.dataset.sessionId);
  if(result.error)window.alert(authErrorText(result.error)); await loadPeerSessionList();
});
document.getElementById("closeBooking").addEventListener("click", function () { document.getElementById("bookingDialog").close(); });
document.getElementById("bookingDialog").addEventListener("click", function (event) { if (event.target === this) this.close(); });

function sessionChatCanSend(session) {
  var now = Date.now();
  return !!(user && session && session.status === "confirmed" && (session.learner_id === user.id || session.mentor_id === user.id) && now >= new Date(session.starts_at).getTime() && now < new Date(session.ends_at).getTime());
}
function updateSessionChatComposer() {
  var state = document.getElementById("sessionChatState"), text = document.getElementById("sessionChatText"), file = document.getElementById("sessionChatFile"), send = document.getElementById("sessionChatSend");
  if (!state || !activeChatSession) return;
  var now = Date.now(), start = new Date(activeChatSession.starts_at).getTime(), end = new Date(activeChatSession.ends_at).getTime(), writable = sessionChatCanSend(activeChatSession);
  state.textContent = writable ? "Your booked chat is open. Keep it focused on learning; don’t share private contact or home details." : (now < start && activeChatSession.status === "confirmed" ? "This chat opens at " + sessionTime(activeChatSession.starts_at, activeChatSession.timezone) + "." : (activeChatSession.status === "pending" ? "Chat unlocks after the mentor confirms the booking." : (activeChatSession.status === "confirmed" && now < end ? "This chat is temporarily unavailable." : "This session has ended. You can read its history, but can’t send more messages.")));
  if (text) text.disabled = !writable || sessionChatBusy;
  if (file) file.disabled = !writable || sessionChatBusy;
  if (send) send.disabled = !writable || sessionChatBusy;
  var close = document.getElementById("sessionChatClose"); if (close) close.disabled = sessionChatBusy;
}
function sessionChatTime(value) {
  return new Intl.DateTimeFormat(undefined, { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
async function openSessionChat(sessionId) {
  if (!user || !supabaseClient) return;
  var result = await supabaseClient.from("peer_sessions").select("id,learner_id,mentor_id,starts_at,ends_at,timezone,status,learner:profiles!peer_sessions_learner_id_fkey(display_name),mentor:profiles!peer_sessions_mentor_id_fkey(display_name)").eq("id", sessionId).maybeSingle();
  if (result.error || !result.data) { window.alert(result.error ? authErrorText(result.error) : "This session could not be found."); return; }
  var row = result.data;
  if (row.learner_id !== user.id && row.mentor_id !== user.id) { window.alert("Only the people in this session can open its chat."); return; }
  activeChatSession = row; sessionChatSignature = ""; sessionChatSignedAt = 0;
  var dialog = document.getElementById("sessionChatDialog"), title = document.getElementById("sessionChatTitle"), subtitle = document.getElementById("sessionChatSubtitle");
  var isMentor = row.mentor_id === user.id, peer = relationRow(isMentor ? row.learner : row.mentor);
  title.textContent = "Chat with " + (peer.display_name || (isMentor ? "Learner" : "Mentor"));
  subtitle.textContent = "Booked 30-minute session · " + sessionChatTime(row.starts_at) + " (India time)";
  updateSessionChatComposer();
  if (!dialog.open) dialog.showModal();
  await loadSessionChatMessages();
  if (sessionChatPoll) clearInterval(sessionChatPoll);
  sessionChatPoll = setInterval(function () { loadSessionChatMessages(); updateSessionChatComposer(); }, 3000);
}
async function loadSessionChatMessages() {
  if (!activeChatSession || !user || !supabaseClient) return;
  var root = document.getElementById("sessionChatMessages");
  var result = await supabaseClient.from("peer_session_messages").select("id,session_id,sender_id,content,attachment_path,attachment_name,attachment_type,created_at").eq("session_id", activeChatSession.id).order("created_at", { ascending: true }).limit(200);
  if (result.error) { root.innerHTML = '<div class="community-empty">Could not load chat: ' + esc(authErrorText(result.error)) + '</div>'; return; }
  var rows = result.data || [], signature = rows.map(function (row) { return row.id + ":" + row.created_at; }).join("|");
  if (signature === sessionChatSignature && Date.now() - sessionChatSignedAt < 7 * 60 * 1000) return;
  sessionChatSignature = signature; sessionChatSignedAt = Date.now();
  var messages = await Promise.all(rows.map(async function (row) {
    var signedUrl = "";
    if (row.attachment_path) {
      var signed = await supabaseClient.storage.from("session-chat-files").createSignedUrl(row.attachment_path, 600);
      if (!signed.error && signed.data) signedUrl = signed.data.signedUrl;
    }
    var attachment = "";
    if (signedUrl && row.attachment_type && row.attachment_type.indexOf("image/") === 0) attachment = '<a class="session-chat-file" href="' + esc(signedUrl) + '" target="_blank" rel="noopener"><img src="' + esc(signedUrl) + '" alt="' + esc(row.attachment_name || "Shared image") + '"><span>' + esc(row.attachment_name || "Image") + '</span></a>';
    else if (signedUrl) attachment = '<a class="session-chat-file session-chat-pdf" href="' + esc(signedUrl) + '" target="_blank" rel="noopener">📄 ' + esc(row.attachment_name || "Open PDF") + '</a>';
    else if (row.attachment_path) attachment = '<span class="muted">Attachment unavailable</span>';
    var senderLabel = "You";
    if (row.sender_id !== user.id) {
      var otherProfile = row.sender_id === activeChatSession.mentor_id ? relationRow(activeChatSession.mentor) : relationRow(activeChatSession.learner);
      senderLabel = otherProfile.display_name || "Session participant";
    }
    return '<article class="session-chat-message' + (row.sender_id === user.id ? ' mine' : '') + '"><b>' + esc(senderLabel) + '</b><time>' + esc(sessionChatTime(row.created_at)) + '</time>' + (row.content ? '<p>' + esc(row.content) + '</p>' : '') + attachment + '</article>';
  }));
  root.innerHTML = messages.join("") || '<div class="community-empty">No messages yet. Use this booked time to work through a study question together.</div>';
  root.scrollTop = root.scrollHeight;
  updateSessionChatComposer();
}
document.getElementById("sessionChatDialog").addEventListener("close", function () {
  if (sessionChatPoll) clearInterval(sessionChatPoll);
  sessionChatPoll = null; activeChatSession = null; sessionChatSignature = "";
});
document.getElementById("sessionChatDialog").addEventListener("cancel", function (event) { if (sessionChatBusy) event.preventDefault(); });
document.getElementById("sessionChatClose").addEventListener("click", function () { document.getElementById("sessionChatDialog").close(); });
document.getElementById("sessionChatForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!activeChatSession || !sessionChatCanSend(activeChatSession) || sessionChatBusy) return;
  var sendingSession = activeChatSession, text = document.getElementById("sessionChatText"), picker = document.getElementById("sessionChatFile"), status = document.getElementById("sessionChatStatus"), body = text.value.trim(), file = picker.files && picker.files[0];
  if (!body && !file) { status.textContent = "Write a message or choose a file first."; return; }
  if (body.length > 2000) { status.textContent = "Messages can be up to 2,000 characters."; return; }
  var allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (file && (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024)) { status.textContent = "Choose a JPG, PNG, WebP, or PDF up to 10 MB."; return; }
  sessionChatBusy = true; updateSessionChatComposer(); status.textContent = "Sending…";
  var path = null, uploadError = null;
  try {
    if (file) {
      var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-140) || "study-file";
      path = sendingSession.id + "/" + user.id + "/" + Date.now() + "_" + safeName;
      var uploaded = await supabaseClient.storage.from("session-chat-files").upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;
    }
    var inserted = await supabaseClient.from("peer_session_messages").insert({ session_id: sendingSession.id, sender_id: user.id, content: body, attachment_path: path, attachment_name: file ? file.name.slice(0, 180) : null, attachment_type: file ? file.type : null });
    if (inserted.error) throw inserted.error;
    text.value = ""; picker.value = ""; status.textContent = "Sent."; if (activeChatSession && activeChatSession.id === sendingSession.id) { sessionChatSignature = ""; await loadSessionChatMessages(); }
  } catch (error) {
    uploadError = error;
    if (path) await supabaseClient.storage.from("session-chat-files").remove([path]);
    status.textContent = authErrorText(uploadError);
  } finally { sessionChatBusy = false; updateSessionChatComposer(); }
});
function scheduleManagerMarkup() {
  return '<div class="schedule-manage"><div class="social-feed-title"><div><span class="community-kicker">MENTOR TOOLS</span><h2>Unavailable times</h2></div></div><p class="muted">Peer Connect sets 30-minute booking slots every day from 8:00 AM to 8:00 PM IST. Add a blocked period for times you cannot meet.</p><form class="schedule-form" data-schedule-form="block"><label>Block from (IST)<input name="starts_at" type="datetime-local" required></label><label>Until (IST)<input name="ends_at" type="datetime-local" required></label><button class="btn" type="submit">Block time</button></form><div id="blockedTimeList" class="schedule-manage-list"></div><div id="scheduleManageMessage" class="social-message" role="status"></div></div>';
}
async function loadMentorScheduleControls() {
  var root=document.getElementById("blockedTimeList"); if(!root||!user)return;
  var result=await supabaseClient.from("peer_blocked_times").select("id,starts_at,ends_at,timezone").eq("mentor_id",user.id).gte("ends_at",new Date().toISOString()).order("starts_at").limit(20);
  root.innerHTML=result.error?'<span>'+esc(authErrorText(result.error))+'</span>':(result.data||[]).map(function(row){return '<div>Unavailable · '+esc(sessionTime(row.starts_at,row.timezone))+' to '+esc(sessionTime(row.ends_at,row.timezone))+' <button class="act" data-schedule-delete="block" data-id="'+esc(row.id)+'">Remove</button></div>';}).join("")||"No blocked times.";
}
document.getElementById("sessions").addEventListener("submit",async function(event){
  var form=event.target.closest("[data-schedule-form]"); if(!form)return; event.preventDefault(); if(!user)return;
  var data=new FormData(form), row={mentor_id:user.id,starts_at:zonedInputToIso(data.get("starts_at"),"Asia/Kolkata"),ends_at:zonedInputToIso(data.get("ends_at"),"Asia/Kolkata"),timezone:"Asia/Kolkata",label:"Unavailable"};
  if(!row.starts_at||!row.ends_at||row.starts_at>=row.ends_at){document.getElementById("scheduleManageMessage").textContent="Choose an end time after the start time.";return;}
  var result=await supabaseClient.from("peer_blocked_times").insert(row);var msg=document.getElementById("scheduleManageMessage");msg.textContent=result.error?authErrorText(result.error):"Those times are now blocked.";if(!result.error){form.reset();await loadMentorScheduleControls();}
});
document.getElementById("sessions").addEventListener("click",async function(event){var button=event.target.closest("[data-schedule-delete]");if(!button)return;var result=await supabaseClient.from("peer_blocked_times").delete().eq("id",button.dataset.id).eq("mentor_id",user.id);if(result.error)window.alert(authErrorText(result.error));await loadMentorScheduleControls();});
function tutorVerificationPanel(status) {
  if (Number(user && user.grade) < 9 || Number(user && user.grade) > 12) return '<section class="box verify-status"><b>Finish your class details</b><p class="muted">Set your class before submitting mentor verification.</p></section>';
  if (status && status.status === "verified") return '<section class="box verify-status"><b><span class="verify-badge">Verified</span> Your mentor profile is approved</b><p class="muted">Your profile can appear in mentor search while availability is on.</p></section>';
  if (status && status.status === "pending") return '<section class="box verify-status"><b>Verification pending</b><p class="muted">Your school ID and fee receipt are private. A reviewer will check them before your mentor profile becomes visible.</p></section>';
  if (status && status.status === "rejected") return '<section class="box verify-status"><b>Verification needs another review</b><p class="muted">Resubmit both documents if a reviewer declined them, or if your verified name, class, school, or subjects changed.</p><button class="btn" data-start-verification>Submit documents again</button></section>';
  return '<section class="box verify-status"><b>Verify your mentor profile</b><p class="muted">Mentors from every class must submit a school ID and fee receipt. A trusted reviewer checks your class, school, and subjects before approving your profile. Files stay private and are removed after review.</p><button class="btn" data-start-verification>Submit for review</button></section>';
}
async function drawTutorDashboard() {
  var body = document.getElementById("tutorDashboardBody");
  if (!body) return;
  if (!canMentor(user)) {
    body.innerHTML = '<div class="box">Choose Mentor or Both to open the mentor dashboard.</div>';
    return;
  }
  body.innerHTML = '<div class="box">Loading your mentor dashboard…</div>';
  var results = await Promise.all([
    supabaseClient.from("tutor_profiles").select("headline, subjects, is_available").eq("user_id", user.id).maybeSingle(),
    supabaseClient.from("tutor_verification_requests").select("id, status, submitted_at").eq("user_id", user.id).order("submitted_at", { ascending: false }).limit(1),
    supabaseClient.from("peer_sessions").select("id,learner_id,starts_at,ends_at,timezone,status,learner:profiles!peer_sessions_learner_id_fkey(display_name)").eq("mentor_id", user.id).order("starts_at", { ascending: true }).limit(100),
  ]);
  if (results[0].error || results[1].error || results[2].error) {
    body.innerHTML = '<div class="box err">' + esc(authErrorText(results[0].error || results[1].error || results[2].error)) + '</div>';
    return;
  }
  var profile = results[0].data, status = (results[1].data || [])[0] || null, sessions = results[2].data || [];
  var now = Date.now();
  var pendingSessions = sessions.filter(function (s) { return s.status === "pending"; });
  var upcomingSessions = sessions.filter(function (s) { return s.status === "confirmed" && new Date(s.ends_at).getTime() >= now; });
  var bookingRows = pendingSessions.length ? pendingSessions.map(function (s) {
    var learner = relationRow(s.learner);
    return '<article class="request-row"><div><b>' + esc(learner.display_name || "Learner") + '</b><p class="muted">30-minute session · ' + esc(sessionTime(s.starts_at, s.timezone)) + '</p></div><div class="row"><button class="btn" data-session-action="confirmed" data-session-id="' + esc(s.id) + '">Accept</button><button class="btn ghost" data-session-action="declined" data-session-id="' + esc(s.id) + '">Decline</button></div></article>';
  }).join("") : '<p class="muted">No booking requests to review.</p>';
  body.innerHTML = '<div class="dash-stats"><div class="dash-stat"><b>' + pendingSessions.length + '</b><span>Bookings to review</span></div><div class="dash-stat"><b>' + upcomingSessions.length + '</b><span>Upcoming sessions</span></div><div class="dash-stat"><b>' + (profile && profile.is_available ? "Available" : "Paused") + '</b><span>Profile visibility</span></div></div>' +
    tutorVerificationPanel(status) +
    '<div class="dash-grid"><section class="box"><div class="dash-heading"><div><b>Your mentor profile</b><p class="muted">' + esc(profile ? profile.headline || "Add a headline" : "Create your profile so learners can find you.") + '</p></div><button class="btn ghost" data-edit-tutor>Edit profile</button></div><p class="muted">Subjects: ' + esc(profile && profile.subjects ? profile.subjects.join(", ") : "Not set") + '<br>School: ' + esc(user.location && user.location.school || "—") + '<br>Location: ' + esc(user.location ? [user.location.city,user.location.state,user.location.country].join(", ") : "—") + '</p><label class="availability"><input type="checkbox" data-available ' + (profile && profile.is_available ? "checked" : "") + ' ' + (!profile || !status || status.status !== "verified" ? "disabled" : "") + '> Show my profile in mentor search</label></section></div>' +
    '<section class="box request-box"><div class="dash-heading"><div><b>Booking requests</b><p class="muted">Accept or decline requests for a scheduled learning session.</p></div></div>' + bookingRows + '</section>';
}
document.getElementById("tutorDashboardBody").addEventListener("click", async function (e) {
  var sessionAction = e.target.closest("[data-session-action]");
  if (sessionAction) {
    sessionAction.disabled = true;
    var result = await supabaseClient.from("peer_sessions").update({ status: sessionAction.dataset.sessionAction }).eq("id", sessionAction.dataset.sessionId).eq("mentor_id", user.id);
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
  if (!canMentor(user)) return;
  dlg.classList.remove("auth-screen");
  dlg.classList.remove("profile-dialog");
  dbody.innerHTML = '<h3 id="dt">Submit mentor verification</h3><p class="muted">Learners from every class can apply to mentor younger learners. Upload a school ID card and fee receipt so a reviewer can verify your class and school. Files remain private.</p><div class="verify-doc-fields"><label>School ID card<input id="verifySchoolId" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><label>Fee receipt<input id="verifyFeeReceipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label></div><p class="note">Each file must be JPG, PNG, WebP, or PDF and no larger than 5 MB. Do not upload unrelated personal documents.</p><div class="err" id="verificationError" role="alert"></div><div class="row"><button class="btn ghost" id="cancelVerification">Cancel</button><button class="btn" id="submitVerification">Send for review</button></div>';
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
    cards.push('<article class="box"><h3>' + esc(p.display_name || "Learner") + ' · Class ' + esc(String(p.grade || "—")) + '</h3><p class="muted">' + esc([l.school,l.city,l.state,l.country].filter(Boolean).join(" · ") || "Location not set") + '<br>Subjects: ' + esc((tp.subjects || []).join(", ") || "Not set") + '<br>About: ' + esc(tp.headline || "Not set") + '<br>Submitted ' + esc(new Date(row.submitted_at).toLocaleString()) + '</p>' + (links.join("") || '<p class="err">No documents attached.</p>') + '<label>Reviewer note (optional)<input data-review-note="' + esc(row.id) + '" maxlength="500" placeholder="Private note; not shown on the mentor profile"></label><div class="row"><button class="btn" data-review="verified" data-review-id="' + esc(row.id) + '" data-user-id="' + esc(row.user_id) + '" ' + (!(hasId && hasReceipt && Number(p.grade) >= 9 && Number(p.grade) <= 12 && allDocsAvailable) ? 'disabled title="Both documents must be available and class must be 9–12"' : '') + '>Approve and verify</button><button class="btn ghost" data-review="rejected" data-review-id="' + esc(row.id) + '" data-user-id="' + esc(row.user_id) + '">Reject</button></div></article>');
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

function socialAvatar(profile, name) {
  return profile && profile.avatar_url
    ? '<img src="' + esc(profile.avatar_url) + '" alt="">'
    : esc(ini(name || "Peer Connect").slice(0, 2).toUpperCase());
}
function socialPostHtml(row, myId) {
  var profile = relationRow(row.profiles), name = profile.display_name || "Peer Connect member";
  var reactions = Array.isArray(row.post_reactions) ? row.post_reactions : [];
  var comments = Array.isArray(row.post_comments) ? row.post_comments : [];
  var liked = reactions.some(function (reaction) { return reaction.user_id === myId; });
  var media = row.media_url ? (row.media_signed_url ? (row.media_type === "video"
    ? '<div class="social-post-media"><video controls preload="metadata" playsinline src="' + esc(row.media_signed_url) + '"></video></div>'
    : '<div class="social-post-media"><img loading="lazy" src="' + esc(row.media_signed_url) + '" alt="Photo shared by ' + esc(name) + '"></div>') : '<p class="muted">Media is temporarily unavailable. Refresh the feed to reload it.</p>') : "";
  return '<article class="social-post" data-social-post="' + esc(row.id) + '"><div class="social-post-head"><div class="social-avatar">' + socialAvatar(profile, name) + '</div><div><div class="social-post-author">' + esc(name) + (profile.grade ? ' · Class ' + esc(String(profile.grade)) : '') + '</div><div class="social-post-time">' + esc(relativeTime(row.created_at)) + '</div></div>' + (row.author_id === myId ? '<button class="act delete-action" data-social-delete="' + esc(row.id) + '" style="margin-left:auto">Delete</button>' : '') + '</div><div class="social-post-copy">' + esc(row.content) + '</div>' + media + '<div class="social-post-actions"><button type="button" data-social-like="' + esc(row.id) + '" aria-pressed="' + liked + '">♥ ' + reactions.length + ' Like</button><button type="button" data-social-comments="' + esc(row.id) + '">◯ ' + comments.length + ' Comments</button><button type="button" data-social-focus="comment-' + esc(row.id) + '">Reply</button></div><div class="social-comments">' + comments.slice(-3).map(function (comment) { var author = relationRow(comment.profiles); return '<div class="social-comment"><b>' + esc(author.display_name || "Learner") + '</b>' + esc(comment.content) + '</div>'; }).join("") + '<form class="social-comment-form" data-social-comment-form="' + esc(row.id) + '"><input id="comment-' + esc(row.id) + '" maxlength="2000" placeholder="Write a comment…" aria-label="Write a comment"><button class="btn ghost" type="submit">Comment</button></form></div></article>';
}
async function loadSocialFeed() {
  var list = document.getElementById("socialPostList");
  if (!list) return;
  if (!user || !supabaseClient) { list.innerHTML = '<div class="community-empty">Sign in to view and share posts.</div>'; return; }
  var loadingUserId = user.id;
  list.innerHTML = '<div class="community-empty">Loading your learning feed…</div>';
  var result = await supabaseClient.from("posts").select("id, author_id, content, post_type, media_url, media_type, created_at, profiles!posts_author_id_fkey(display_name, grade, avatar_url), post_reactions(user_id, reaction), post_comments(id, author_id, content, created_at, profiles!post_comments_author_id_fkey(display_name))").order("created_at", { ascending: false }).limit(50);
  if (!user || user.id !== loadingUserId || curRoute !== "feed") return;
  if (result.error) { list.innerHTML = '<div class="community-empty">Could not load posts: ' + esc(authErrorText(result.error)) + '. Run the v2.0.0 Supabase setup SQL.</div>'; return; }
  var rows = result.data || [];
  await Promise.all(rows.map(async function(row){
    if(!row.media_url || /^https:\/\//i.test(row.media_url)) { row.media_signed_url = row.media_url || ""; return; }
    var signed = await supabaseClient.storage.from("post-media").createSignedUrl(row.media_url, 7200);
    row.media_signed_url = signed.error ? "" : signed.data.signedUrl;
  }));
  if (!user || user.id !== loadingUserId || curRoute !== "feed") return;
  list.innerHTML = rows.length ? rows.map(function (row) { return socialPostHtml(row, loadingUserId); }).join("") : '<div class="community-empty">No posts yet. Share a study tip or question to start the feed.</div>';
  var avatar = document.getElementById("socialComposerAvatar");
  if (avatar) avatar.innerHTML = socialAvatar({ avatar_url: user.avatarUrl }, user.n);
}
var socialMediaFile = null, socialPreviewUrl = "";
document.getElementById("socialPostMedia").addEventListener("change", function (event) {
  socialMediaFile = event.target.files[0] || null;
  var preview = document.getElementById("socialPostPreview"), label = document.getElementById("socialMediaName");
  if (socialPreviewUrl) URL.revokeObjectURL(socialPreviewUrl);
  preview.hidden = !socialMediaFile;
  if (!socialMediaFile) { label.textContent = "Up to 50 MB"; preview.innerHTML = ""; return; }
  socialPreviewUrl = URL.createObjectURL(socialMediaFile);
  label.textContent = socialMediaFile.name;
  preview.innerHTML = socialMediaFile.type.indexOf("video/") === 0 ? '<video controls playsinline src="' + socialPreviewUrl + '"></video>' : '<img alt="Selected photo preview" src="' + socialPreviewUrl + '">';
});
document.getElementById("publishSocialPost").addEventListener("click", async function () {
  var button = this, content = document.getElementById("socialPostText").value.trim(), message = document.getElementById("socialPostMessage");
  if (!user) { openSign(); return; }
  if (!content) { message.textContent = "Add a message before posting."; return; }
  if (content.length > 5000) { message.textContent = "Posts can be up to 5,000 characters."; return; }
  var type = socialMediaFile && socialMediaFile.type.indexOf("video/") === 0 ? "video" : socialMediaFile ? "image" : null;
  var allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];
  if (socialMediaFile && (allowed.indexOf(socialMediaFile.type) < 0 || socialMediaFile.size > 50 * 1024 * 1024)) { message.textContent = "Choose JPG, PNG, WebP, GIF, MP4, WebM, or MOV media under 50 MB."; return; }
  button.disabled = true; button.textContent = "Posting…"; message.textContent = "";
  var mediaUrl = null, mediaPath = null;
  if (socialMediaFile) {
    var ext = socialMediaFile.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    mediaPath = user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2) + "." + ext;
    var upload = await supabaseClient.storage.from("post-media").upload(mediaPath, socialMediaFile, { contentType: socialMediaFile.type, upsert: false });
    if (upload.error) { message.textContent = authErrorText(upload.error) + " — run the post-media SQL setup."; button.disabled = false; button.textContent = "Post"; return; }
    mediaUrl = mediaPath;
  }
  var created = await supabaseClient.from("posts").insert({ author_id: user.id, content: content, post_type: "general", media_url: mediaUrl, media_type: type }).select("id").single();
  if (created.error) { if (mediaPath) await supabaseClient.storage.from("post-media").remove([mediaPath]); message.textContent = authErrorText(created.error); }
  else { document.getElementById("socialPostText").value = ""; document.getElementById("socialPostMedia").value = ""; socialMediaFile = null; message.textContent = "Posted to your learning feed."; document.getElementById("socialPostPreview").hidden = true; document.getElementById("socialPostPreview").innerHTML = ""; document.getElementById("socialMediaName").textContent = "Up to 50 MB"; await loadSocialFeed(); }
  button.disabled = false; button.textContent = "Post";
});
document.getElementById("refreshSocialFeed").addEventListener("click", loadSocialFeed);
document.getElementById("socialPostList").addEventListener("click", async function (event) {
  var like = event.target.closest("[data-social-like]"), del = event.target.closest("[data-social-delete]"), focus = event.target.closest("[data-social-focus]");
  if (focus) { var input = document.getElementById(focus.dataset.socialFocus); if (input) input.focus(); return; }
  if (!user) { openSign(); return; }
  if (like) { like.disabled = true; var existing = like.getAttribute("aria-pressed") === "true"; var result = existing ? await supabaseClient.from("post_reactions").delete().eq("post_id", like.dataset.socialLike).eq("user_id", user.id) : await supabaseClient.from("post_reactions").insert({ post_id: like.dataset.socialLike, user_id: user.id, reaction: "like" }); if (result.error) window.alert(authErrorText(result.error)); await loadSocialFeed(); }
  else if (del) { if (!window.confirm("Delete this post?")) return; var postRow=await supabaseClient.from("posts").select("media_url").eq("id",del.dataset.socialDelete).eq("author_id",user.id).maybeSingle(); var removed = await supabaseClient.from("posts").delete().eq("id", del.dataset.socialDelete).eq("author_id", user.id); if (removed.error) window.alert(authErrorText(removed.error)); else { if(postRow.data&&postRow.data.media_url&&!/^https:\/\//i.test(postRow.data.media_url)) await supabaseClient.storage.from("post-media").remove([postRow.data.media_url]); await loadSocialFeed(); } }
});
document.getElementById("socialPostList").addEventListener("submit", async function (event) {
  var form = event.target.closest("[data-social-comment-form]"); if (!form) return; event.preventDefault();
  if (!user) { openSign(); return; }
  var input = form.querySelector("input"), value = input.value.trim(); if (!value) return;
  var button = form.querySelector("button"); button.disabled = true;
  var result = await supabaseClient.from("post_comments").insert({ post_id: form.dataset.socialCommentForm, author_id: user.id, content: value });
  if (result.error) window.alert(authErrorText(result.error)); else await loadSocialFeed();
  button.disabled = false;
});

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
  h += '<div class="box"><b>Account</b><p ' + mu + '>' + (user ? esc(user.n) + " · " + esc(user.e) + "<br>" + accountTypeLabel(user.role) + " · Class " + esc(String(user.grade || "")) + '<br>' + esc(user.location ? [user.location.school,user.location.city,user.location.state,user.location.country].join(" · ") : "Location not set") : "You are not signed in.") + '</p>' + (user ? '<button class="btn ghost" data-edit-details>Edit profile details</button><div class="profile-appearance"><label class="btn ghost">Change profile photo<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-image="avatar"></label><label class="btn ghost">Change banner<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-image="banner"></label></div><div class="profile-social" id="myFollowStats">Loading followers…</div>' : '<button class="btn" data-go="signin">Sign up / Sign in</button>') + '</div>';
  h += '<div class="box"><b>Mentor profile</b><p ' + mu + '>' + (canMentor(user) ? 'Your mentor tools and booking requests are on your <a href="#dashboard">dashboard</a>.' : 'Want to guide learners in lower classes? Choose Mentor or Both in your profile.') + '</p>' + (canMentor(user) ? '<a class="btn" href="#dashboard">Mentor dashboard</a>' : '') + '</div>';
  var w = who();
  var mp = posts.filter(function (p) { return p.n === w.n; });
  h += '<div class="box"><b>Your doubts (' + mp.length + ')</b>' + (mp.length ? '<ul style="margin:8px 0 0;padding-left:20px">' + mp.map(function (p) { return "<li>" + esc(p.t) + "</li>"; }).join("") + '</ul>' : '<p ' + mu + '>You have not asked a doubt yet.</p><a class="btn ghost" href="#doubts">Ask a doubt</a>') + '</div>';
  document.getElementById("meBody").innerHTML = h;
  document.querySelectorAll('#meBody [data-profile-image]').forEach(function (input) { input.onchange = async function () { if (input.files[0]) await uploadProfileImage(input.files[0], input.dataset.profileImage); }; });
  if (user) loadProfileSocialForMe();
}
async function loadProfileSocialForMe() {
  var target = document.getElementById("myFollowStats"); if (!target || !user) return;
  var results = await Promise.all([
    supabaseClient.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", user.id),
    supabaseClient.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", user.id),
  ]);
  target.innerHTML = '<span><b>' + (results[0].count || 0) + '</b> followers</span><span><b>' + (results[1].count || 0) + '</b> following</span>';
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
var routes = ["home", "feed", "profile", "doubts", "sessions", "pricing", "me", "dashboard", "verification"],
  names = {
    home: "Mentors",
    feed: "Feed",
    profile: "Tutor profile",
    doubts: "Doubts",
    sessions: "Study sessions",
    pricing: "Pricing",
    me: "My page",
    dashboard: "Tutor dashboard",
    verification: "Tutor verification review",
  };
function route() {
  var h = location.hash.replace("#", "");
  // Keep old mentor links working after making the directory the home page.
  if (h === "tutors") h = "home";
  if (routes.indexOf(h) < 0) h = "home";
  if (h === "profile" && !activeTutorProfile) h = "home";
  var isStudent = canLearn(user);
  if (isStudent && studentEntryPending) {
    studentEntryPending = false;
    h = "home";
    if (location.hash !== "#" + h) history.replaceState(null, document.title, location.pathname + location.search + "#" + h);
  }
  if (h === "dashboard" && !canMentor(user)) h = "home";
  if (h === "verification" && (!user || !isVerificationAdmin)) h = "home";
  curRoute = h;
  document.body.classList.toggle("home-feed", h === "feed");
  document.querySelectorAll("[data-v]").forEach(function (el) {
    el.hidden = el.dataset.v.split(" ").indexOf(h) < 0;
  });
  document.querySelectorAll("[data-nav]").forEach(function (a) {
    if (a.dataset.nav === (h === "profile" ? "home" : h)) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = names[h] + " | Peer Connect";
  if (h === "doubts") {
    if (user) loadDoubtsFromSupabase();
    else drawFeed();
  }
  if (h === "verification") drawVerificationAdmin();
  if (h === "profile") renderTutorProfilePage();
  if (h === "feed") loadSocialFeed();
  if (h === "sessions") loadPeerSessionsPage();
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
fetch("version.json", { cache: "no-store" }).then(function (response) {
  if (!response.ok) throw new Error("Version file unavailable");
  return response.json();
}).then(function (versionInfo) {
  var versionLabel = document.getElementById("appVersion");
  if (versionLabel && versionInfo.version) versionLabel.textContent = "v" + versionInfo.version;
}).catch(function () {});
