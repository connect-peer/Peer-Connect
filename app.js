/*
 * Meridian app.js
 * ------------------------------------------------------------
 * Meridian runs as a static HTML/CSS/JavaScript app with no build step.
 * Supabase handles Auth, profiles, verified tutors, private verification files,
 * bookings, doubts, and answers.
 *
 * Map of this file (search for these names):
 *   STATE        tutors, posts, user, mine, fSub, fSort, openR
 *   TUTORS PAGE  drawChips(), draw()
 *   PRICING      Learner and Meridian Mentor plans
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
var tutorDirectoryRequestId = 0;
var activeTutorProfile = null;
var pendingBookingMentorId = "";
function canMentor(account) { return !!account && ["mentor", "both", "tutor"].indexOf(account.role) >= 0; }
function canLearn(account) { return !!account && ["learner", "both", "student"].indexOf(account.role) >= 0; }
function normalizeRole(role) { return role === "student" ? "learner" : role === "tutor" ? "mentor" : role; }
function accountTypeLabel(role) { return role === "both" ? "Learner + Meridian Mentor" : canMentor({ role: role }) ? "Meridian Mentor" : "Learner"; }
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
function publicName(name) {
  var parts = String(name || "Meridian Mentor").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || "Meridian Mentor";
  return parts[0] + " " + parts[parts.length - 1].charAt(0).toUpperCase() + ".";
}
function esc(s) {
  var text = typeof s === "string" || typeof s === "number" || typeof s === "boolean" ? String(s) : "";
  return text.replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
function meridianHasPrivateContact(value) {
  var text = String(value || "").toLowerCase()
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\b(zero|oh)\b/g, "0").replace(/\bone\b/g, "1")
    .replace(/\b(two|to|too)\b/g, "2").replace(/\b(three)\b/g, "3")
    .replace(/\b(four|for)\b/g, "4").replace(/\bfive\b/g, "5")
    .replace(/\bsix\b/g, "6").replace(/\bseven\b/g, "7")
    .replace(/\beight\b/g, "8").replace(/\bnine\b/g, "9");
  return /[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*\.\s*[a-z]{2,}/i.test(text)
    || /(?:https?:\/\/|www\.|instagram|telegram|snapchat|discord|whatsapp|facebook|t\.me|@[a-z0-9_]{2,})/i.test(text)
    || /(?:\+?\d[\s().-]*){10,13}/.test(text.replace(/\D/g, ""));
}
function meridianContactWarning(value) {
  if (!meridianHasPrivateContact(value)) return false;
  if (user && supabaseClient) supabaseClient.from("reports").insert({ reporter_id: user.id, reported_user_id: user.id, reason: "contact_info", details: "Meridian safety filter blocked content containing possible private contact information.", status: "new" });
  return true;
}
function meridianAge(dateValue) {
  if (!dateValue) return null;
  var birth = new Date(String(dateValue).slice(0,10) + "T00:00:00"), today = new Date();
  return today.getFullYear() - birth.getFullYear() - (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
}
async function submitMeridianReport(target) {
  if (!user) { openSign(); return; }
  var reason = window.prompt("What should Meridian review?\n1 — Harassment or bullying\n2 — Contact details or privacy\n3 — Unsafe or inappropriate content\n4 — Spam or something else");
  if (reason === null) return;
  var labels = { "1": "harassment", "2": "privacy", "3": "unsafe_content", "4": "other" };
  reason = labels[reason.trim()];
  if (!reason) { window.alert("Choose 1, 2, 3, or 4."); return; }
  var result = await supabaseClient.from("reports").insert({ reporter_id: user.id, reported_user_id: target.userId || null, post_id: target.postId || null, doubt_id: target.doubtId || null, reason: reason, details: target.details || null, status: "new" });
  if (result.error) window.alert(authErrorText(result.error)); else window.alert("Thanks. Your report was sent privately to the Meridian review team.");
}
function drawChips() {
  var academicAreas = ["Maths", "Physics", "Chemistry", "Biology", "JEE", "NEET", "Computer Science", "English", "History", "Accountancy", "Economics", "Other exams"];
  var activityAreas = ["Debate", "MUN", "Public speaking", "Robotics", "Coding", "Olympiads", "Music", "Art", "Theater", "Sports", "Startups", "Chess", "Writing", "Study skills", "Time management", "College and career guidance"];
  var availableAreas = subjects.filter(function (subject) { return subject !== "All"; });
  var academics = academicAreas.slice();
  var activities = activityAreas.slice();
  availableAreas.forEach(function (subject) {
    if (academics.indexOf(subject) < 0 && activities.indexOf(subject) < 0) activities.push(subject);
  });
  var button = function (subject) {
    return '<button type="button" class="chip" aria-pressed="' + (subject === active) + '" data-s="' + esc(subject) + '">' + esc(subject) + '</button>';
  };
  var row = function (label, className, values) {
    return '<section class="chip-group ' + className + '" aria-label="' + label + '"><h2 class="chip-group-label">' + label + '</h2><div class="chip-row">' + values.map(button).join("") + '</div></section>';
  };
  chips.innerHTML = '<div class="chip-group chip-group-all"><span class="chip-group-label">Browse</span><div class="chip-row">' + button("All") + '</div></div>' +
    row("Academics", "chip-group-academics", academics) +
    row("Skills & activities", "chip-group-activities", activities);
}
function draw() {
  var list = tutors.filter(function (t) {
    if (user && canLearn(user) && !t.me) {
      var mentorGrade = Number(String(t.g || "").replace(/\D/g, ""));
      if (!mentorGrade || mentorGrade - Number(user.grade || 0) < 1 || mentorGrade - Number(user.grade || 0) > 3) return false;
    }
    var okS = active === "All" || t.s.indexOf(active) > -1;
    var hay = (t.n + " " + t.h + " " + t.s.join(" ") + " " + [t.city, t.state, t.country].filter(Boolean).join(" ")).toLowerCase();
    return okS && hay.indexOf(query.toLowerCase()) > -1 &&
      (!tutorState || t.state === tutorState) && (!tutorCity || t.city === tutorCity);
  });
  var guidance = user && user.guidance;
  list.forEach(function (mentor) {
    mentor.matchScore = 0; mentor.matchReason = "";
    if (!guidance || mentor.me) return;
    var matchedSubjects = (guidance.help_subjects || []).filter(function (subject) { return (mentor.s || []).some(function (area) { return area.toLowerCase() === subject.toLowerCase(); }); });
    var goalText = [guidance.target_exam || "", guidance.goal_decision || ""].join(" ").toLowerCase();
    var goalMatch = goalText && (mentor.s || []).some(function (area) { return goalText.indexOf(area.toLowerCase()) >= 0; });
    var score = matchedSubjects.length * 30 + (goalMatch ? 20 : 0);
    var delta = Number(String(mentor.g || "").replace(/\D/g, "")) - Number(user.grade || 0);
    score += delta === 1 ? 18 : delta === 2 ? 12 : 6;
    if (user.location && mentor.city && user.location.city && mentor.city.toLowerCase() === user.location.city.toLowerCase()) score += 10;
    else if (user.location && mentor.state && user.location.state && mentor.state.toLowerCase() === user.location.state.toLowerCase()) score += 5;
    mentor.matchScore = score;
    mentor.matchReason = matchedSubjects.length ? "Matches your " + matchedSubjects.join(" and ") + " goals" : goalMatch ? "Relevant to your guidance goal" : delta === 1 ? "One class ahead of you" : "A Mentor in your next classes";
  });
  list.sort(function (a, b) {
    return (b.matchScore || 0) - (a.matchScore || 0) || (b.blue ? 1 : 0) - (a.blue ? 1 : 0);
  });
  document.getElementById("count").textContent = list.length + (list.length === 1 ? " verified Meridian Mentor" : " verified Meridian Mentors");
  if (!list.length) {
    grid.innerHTML = tutors.length
      ? '<div class="empty">No Meridian Mentors match. Try another area or a shorter search.</div>'
      : '<div class="empty">No Journey maps have been approved for discovery yet.</div>';
    return;
  }
  grid.innerHTML = list
    .map(function (t) {
      var i = tutors.indexOf(t);
      return (
        '<article class="card" data-profile-index="' + i + '" tabindex="0" aria-label="View ' + esc(t.me ? t.n : publicName(t.n)) + ' Journey map"><div class="body">' +
        '<div class="av" aria-hidden="true">' +
        (t.avatarUrl ? '<img src="' + esc(t.avatarUrl) + '" alt="">' : ini(t.n)) +
        "</div>" +
        '<h3><span class="tutor-name">' +
        esc(t.me ? t.n : publicName(t.n)) +
        (t.blue ? BT : "") +
        (t.verified ? ' <span class="verify-badge">Verified</span>' : t.me ? ' <span class="verify-review-state">' + esc(t.verificationStatus || "Not verified") + '</span>' : '') +
        '</span>' + (t.verified && t.available ? '<span class="tutor-online" title="Available"></span>' : '') + '</h3>' +
        '<div class="sub"><span class="mentor-card-grade">' + esc(t.g) + '</span><span class="mentor-card-headline">' + esc(t.h) + '</span>' + ((t.state || t.city) ? '<span class="mentor-card-city">' + esc(t.state || t.city) + '</span>' : '') + '</div>' +
        (guidance && !t.me && list.indexOf(t) < 3 ? '<p class="muted mentor-match-reason">Suggested for you · ' + esc(t.matchReason) + '</p>' : '') +
        '<div class="tags">' +
        t.s.slice(0, 2)
          .map(function (s) {
            var tagKind = ["Maths", "Physics", "Chemistry", "Biology", "JEE", "NEET", "Computer Science", "English", "History", "Accountancy", "Economics", "Other exams"].indexOf(s) >= 0 ? "tag-academic" : "tag-skill";
            return '<span class="tag ' + tagKind + '">' + esc(s) + "</span>";
          })
          .join("") +
        (t.s.length > 2 ? '<span class="tag tag-more">+' + (t.s.length - 2) + ' more</span>' : '') +
        "</div>" +
        (t.me
          ? '<div class="mentor-booking-cta"><button class="btn ghost" data-edit-tutor-card>Edit profile</button></div>'
          : '<div class="mentor-booking-cta"><button type="button" class="btn ghost mentor-journey-button">View Journey map</button><span>30 min · ₹' + esc(t.sessionPrice || 149) + '</span><button class="btn" data-book-mentor="' + esc(t.user_id) + '">Book a Bearings call</button></div>') +
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
  setLocationOptions(document.getElementById("tutorStateFilter"), states, "Any state", tutorState);
  setLocationOptions(document.getElementById("tutorCityFilter"), cities, "Any city", tutorCity);
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
  var retryDirectory = e.target.closest("[data-retry-tutor-directory]");
  if (retryDirectory) { e.stopPropagation(); loadTutorDirectory(); return; }
  if (e.target.closest("[data-edit-tutor-card]")) { e.stopPropagation(); openTutor(); return; }
  var book = e.target.closest("[data-book-mentor]");
  if (book) {
    e.stopPropagation();
    if (!user) { openSign(); return; }
    if (!canLearn(user)) { document.getElementById("count").textContent = "Switch to Learner or Both to book a Meridian Mentor."; return; }
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
async function loadMentorAchievementShowcase(tutor, target) {
  if (!target || !tutor) return;
  var result = tutor.me
    ? await supabaseClient.from("mentor_achievements").select("id,category,title,issuer,achievement_year,public_summary,public_evidence_path,status").eq("user_id", tutor.user_id).order("created_at", { ascending: false })
    : await supabaseClient.rpc("get_peer_public_mentor_achievements", { p_user_id: tutor.user_id });
  if (result.error) { target.innerHTML = '<p class="muted">Achievement highlights will appear here when available.</p>'; return; }
  var rows = (result.data || []).filter(function (row) { return tutor.me || row.status === undefined || row.status === "approved"; });
  if (!rows.length) { target.innerHTML = '<p class="muted">No approved achievements shared yet.</p>'; return; }
  var cards = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i], copyLink = "";
    if (row.status === "approved" || !tutor.me) {
      if (row.public_evidence_path) {
        var signed = await supabaseClient.storage.from("mentor-achievements").createSignedUrl(row.public_evidence_path, 600);
        if (!signed.error) copyLink = '<a class="btn ghost achievement-copy-link" target="_blank" rel="noopener" href="' + esc(signed.data.signedUrl) + '">View approved copy</a>';
      }
    }
    cards.push('<article class="mentor-achievement-item"><div><span class="achievement-category">' + esc(row.category) + '</span><h4>' + esc(row.title) + '</h4><p class="muted">' + esc([row.issuer, row.achievement_year].filter(Boolean).join(" · ")) + '</p><p>' + esc(row.public_summary) + '</p>' + (tutor.me ? '<span class="achievement-status">' + esc(achievementStatusLabel(row.status)) + '</span>' : '') + '</div>' + copyLink + '</article>');
  }
  target.innerHTML = cards.join("");
}
function renderTutorAbout(tutor, content) {
  content.innerHTML = '<h3>About</h3><p>' + esc(tutor.h || 'Meridian Mentor') + '</p><p class="muted">' + (tutor.me ? 'School: ' + esc(tutor.school || '—') + '<br>' : '') + 'Location: ' + esc([tutor.city, tutor.state, tutor.country].filter(Boolean).join(', ') || '—') + '</p><div id="mentorProfileDetails"><p class="muted">Loading guidance background…</p></div><section class="mentor-achievement-showcase"><div class="achievement-section-heading"><div><h3>Achievements and credentials</h3><p class="muted">Reviewed highlights that show experience and milestones.</p></div>' + (tutor.me ? '<button type="button" class="btn ghost" data-achievement-manager>Manage achievements</button>' : '') + '</div><div id="publicMentorAchievements"><p class="muted">Loading achievements…</p></div></section>';
  var manage = content.querySelector("[data-achievement-manager]");
  if (manage) manage.remove();
  loadMentorProfileDetails(tutor, document.getElementById("mentorProfileDetails"));
  loadMentorAchievementShowcase(tutor, document.getElementById("publicMentorAchievements"));
}
async function loadMentorProfileDetails(tutor, target) {
  if (!tutor || !target) return;
  var queries = tutor.me ? [
    supabaseClient.from("tutor_profiles").select("guidance_strengths,guidance_goals,guidance_exams,guidance_languages,board,city_tier,study_style,advises_best,advises_not,lessons_learned").eq("user_id", tutor.user_id).maybeSingle(),
    supabaseClient.from("meridian_mentor_journey").select("stage_year,stage,choice,why,completed_at").eq("user_id", tutor.user_id).order("position"),
    supabaseClient.from("meridian_mentor_results").select("id,exam,score_low,score_high,score_unit,result_year,safe_summary,status").eq("user_id", tutor.user_id).order("result_year", { ascending: false }),
  ] : [
    supabaseClient.rpc("meridian_public_profile_details", { p_user_id: tutor.user_id }),
    supabaseClient.rpc("meridian_public_journey", { p_user_id: tutor.user_id }),
    supabaseClient.rpc("meridian_public_results", { p_user_id: tutor.user_id }),
  ];
  var results = await Promise.all(queries), details = results[0].data && (Array.isArray(results[0].data) ? results[0].data[0] : results[0].data), journey = results[1].data || [], scores = results[2].data || [];
  if (results[0].error && /permission denied|does not exist|could not find/i.test(authErrorText(results[0].error))) {
    target.innerHTML = '<p class="muted">Guidance background appears here after the Meridian profile migration is applied.</p>'; return;
  }
  var parts = [];
  if (details) {
    var chips = function (title, values) { return values && values.length ? '<div class="mentor-detail-group"><b>' + title + '</b><div class="tags">' + values.map(function (value) { return '<span class="tag">' + esc(value) + '</span>'; }).join("") + '</div></div>' : ''; };
    parts.push('<section class="mentor-guidance-details"><h3>Guidance background</h3>' + chips("Strongest areas", details.guidance_strengths) + chips("Goals", (details.guidance_goals || []).map(function (value) { var choice = learnerGoalDecisionChoices.find(function (item) { return item[0] === value; }); return choice ? choice[1] : value; })) + chips("Exams", details.guidance_exams) + chips("Languages", details.guidance_languages) + '<dl class="mentor-detail-list">' + (details.board ? '<div><dt>Board</dt><dd>' + esc(details.board) + '</dd></div>' : '') + (details.study_style ? '<div><dt>Study style</dt><dd>' + esc(details.study_style.replaceAll("_", " ")) + '</dd></div>' : '') + (details.advises_best ? '<div><dt>Best guidance for</dt><dd>' + esc(details.advises_best) + '</dd></div>' : '') + (details.advises_not ? '<div><dt>When another guide may fit better</dt><dd>' + esc(details.advises_not) + '</dd></div>' : '') + (details.lessons_learned ? '<div><dt>A lesson from the journey</dt><dd>' + esc(details.lessons_learned) + '</dd></div>' : '') + '</dl></section>');
  }
  if (journey.length) parts.push('<section class="mentor-journey"><h3>Journey map</h3><ol>' + journey.map(function (stage) { return '<li><div class="journey-year">' + esc(stage.stage_year) + '</div><div><b>' + esc(stage.stage) + '</b><p>' + esc(stage.choice) + '</p><p class="muted">' + esc(stage.why) + '</p></div></li>'; }).join("") + '</ol></section>');
  if (scores.length) parts.push('<section class="mentor-results"><h3>Exam results</h3><div class="mentor-results-grid">' + scores.map(function (row) { var visible = tutor.me || row.status === undefined || row.status === "approved"; return visible ? '<article class="mentor-result-card"><span>' + esc(row.exam) + ' · ' + esc(row.result_year) + '</span><b>' + (row.score_low === row.score_high ? esc(row.score_low) : esc(row.score_low) + '–' + esc(row.score_high)) + ' ' + esc(row.score_unit.replaceAll("_", " ")) + '</b><p>' + esc(row.safe_summary) + '</p>' + (tutor.me && row.status !== "approved" ? '<small class="muted">' + esc(row.status === "rejected" ? "Needs changes" : "Private · waiting for review") + '</small>' : '') + '</article>' : ''; }).join("") + '</div></section>');
  target.innerHTML = parts.join("") || '<p class="muted">This guide has not added their background yet.</p>';
}
function enableProfileImageView(element, imageUrl, label) {
  if (!element || !imageUrl) return;
  element.dataset.profileImageView = imageUrl;
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-label", "View full-size " + label);
  element.title = "View full-size " + label;
}
function openProfileImageViewer(imageUrl, label) {
  if (!imageUrl) return;
  var viewer = document.getElementById("profileImageViewer");
  if (!viewer) {
    viewer = document.createElement("dialog");
    viewer.id = "profileImageViewer";
    viewer.className = "profile-image-viewer";
    viewer.innerHTML = '<div class="profile-image-viewer-bar"><b class="profile-image-viewer-title"></b><button type="button" class="profile-image-viewer-close" aria-label="Close image">×</button></div><img class="profile-image-viewer-img" alt="">';
    document.body.appendChild(viewer);
    viewer.querySelector(".profile-image-viewer-close").onclick = function () { viewer.close(); };
    viewer.addEventListener("click", function (event) { if (event.target === viewer) viewer.close(); });
  }
  viewer.querySelector(".profile-image-viewer-title").textContent = label;
  var image = viewer.querySelector(".profile-image-viewer-img");
  image.src = imageUrl;
  image.alt = label;
  if (!viewer.open) viewer.showModal();
}
document.addEventListener("click", function (event) {
  var image = event.target.closest && event.target.closest("[data-profile-image-view]");
  if (image) openProfileImageViewer(image.dataset.profileImageView, image.title || "Profile image");
});
document.addEventListener("keydown", function (event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  var image = event.target.closest && event.target.closest("[data-profile-image-view]");
  if (image) { event.preventDefault(); openProfileImageViewer(image.dataset.profileImageView, image.title || "Profile image"); }
});
function renderTutorProfilePage() {
  var tutor = activeTutorProfile;
  var root = document.getElementById("tutorProfileContent");
  if (!tutor || !root) return;
  var locationText = (tutor.me ? [tutor.school, tutor.city, tutor.state, tutor.country] : [tutor.city, tutor.state, tutor.country]).filter(Boolean).join(" · ");
  root.innerHTML = '<button type="button" class="btn ghost profile-back" id="profileBack">← Back to Meridian Mentors</button><div class="profile-cover" id="profileCover"></div><section class="profile-head"><div class="av" id="profileAvatar">' + (tutor.avatarUrl ? '<img src="' + esc(tutor.avatarUrl) + '" alt="">' : esc(ini(publicName(tutor.n)))) + '</div><h2>' + esc(tutor.me ? tutor.n : publicName(tutor.n)) + (tutor.verified ? ' <span class="verify-badge">Journey map verified</span>' : tutor.me ? ' <span class="verify-review-state">' + esc(tutor.verificationStatus || "Not verified") + '</span>' : '') + '</h2><div class="profile-meta">Class ' + esc(String(tutor.g || "").replace(/^Class\s*/i, "")) + ' · ' + esc(locationText) + '</div><p>' + esc(tutor.h) + '</p><div class="tags">' + tutor.s.map(function (subject) { return '<span class="tag">' + esc(subject) + '</span>'; }).join("") + '</div><div class="profile-social" id="profileSocialStats"><span>Loading followers…</span></div><button class="btn" id="profileBook">' + (tutor.me ? 'Edit mentor profile' : 'Book a Bearings call') + '</button>' + (tutor.me ? '<div class="profile-appearance"><label class="btn ghost">Change profile photo<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-image="avatar"></label><label class="btn ghost">Change banner<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-image="banner"></label></div>' : '') + '</section><div class="profile-tabs"><button class="btn ghost" data-profile-tab="about" aria-pressed="true">About</button><button class="btn ghost" data-profile-tab="answers" aria-pressed="false">Guidance</button></div><div class="profile-content" id="profileContent"></div>';
  root.querySelectorAll(".profile-appearance").forEach(function (controls) { controls.remove(); });
  if (!tutor.me) {
    var reportButton = document.createElement("button");
    reportButton.type = "button"; reportButton.className = "btn ghost"; reportButton.textContent = "Report profile";
    reportButton.addEventListener("click", function () { submitMeridianReport({ userId: tutor.user_id }); });
    root.querySelector(".profile-head").appendChild(reportButton);
    var blockButton = document.createElement("button");
    blockButton.type = "button"; blockButton.className = "btn ghost"; blockButton.textContent = "Block profile";
    blockButton.addEventListener("click", async function () {
      if (!user) { openSign(); return; }
      if (!window.confirm("Block this Meridian account? They will not be able to book you or message you in a session.")) return;
      var blocked = await supabaseClient.from("meridian_user_blocks").insert({ blocker_id: user.id, blocked_id: tutor.user_id });
      if (blocked.error) window.alert(/duplicate key/i.test(blocked.error.message) ? "This account is already blocked." : authErrorText(blocked.error));
      else blockButton.textContent = "Profile blocked";
    });
    root.querySelector(".profile-head").appendChild(blockButton);
  }
  renderTutorAbout(tutor, document.getElementById("profileContent"));
  var cover = document.getElementById("profileCover");
  if (tutor.bannerUrl) cover.style.backgroundImage = 'url("' + tutor.bannerUrl.replace(/["\\\\]/g, "") + '")';
  enableProfileImageView(cover, tutor.bannerUrl, "profile banner");
  enableProfileImageView(document.getElementById("profileAvatar"), tutor.avatarUrl, "profile photo");
  loadProfileSocial(tutor);
  if (user && tutor.verified && supabaseClient) {
    supabaseClient.rpc("meridian_mentor_rating", { p_mentor_id: tutor.user_id }).then(function (rating) {
      if (rating.error || !rating.data || !rating.data.length || rating.data[0].rating === null) return;
      var badge = document.createElement("p"); badge.className = "profile-rating muted";
      badge.textContent = "★ " + rating.data[0].rating + " · " + rating.data[0].review_count + " learner reviews";
      var profileMeta = root.querySelector(".profile-meta"); if (profileMeta) profileMeta.after(badge);
    });
  }
  root.querySelectorAll("[data-profile-image]").forEach(function (input) {
    input.onchange = async function () { if (input.files[0]) await uploadProfileImage(input.files[0], input.dataset.profileImage); };
  });
  document.getElementById("profileBack").onclick = function () { location.hash = "home"; };
  document.getElementById("profileBook").onclick = async function () {
    if (tutor.me) { location.hash = "settings"; return; }
    if (!user) { openSign(); return; }
    if (!canLearn(user)) { document.getElementById("profileContent").textContent = "Switch to Learner or Both to book a Bearings call."; return; }
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
        renderTutorAbout(tutor, content);
        return;
      }
      content.innerHTML = '<div class="local-loading">Loading answers…</div>';
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
  if (upload.error) { window.alert(authErrorText(upload.error) + " — run the Meridian profile media migration first."); return; }
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

function withTutorDirectoryTimeout(promise, label) {
  var timer;
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error(label + " took too long. Check your connection and try again.")); }, 20000);
    }),
  ]).finally(function () { clearTimeout(timer); });
}
async function loadTutorDirectory() {
  var requestId = ++tutorDirectoryRequestId;
  var mentorGrid = document.getElementById("grid"), mentorCount = document.getElementById("count");
  function showDirectoryError(error) {
    if (requestId !== tutorDirectoryRequestId) return;
    var message = authErrorText(error);
    if (mentorCount) mentorCount.textContent = "Meridian Mentors could not load";
    if (mentorGrid) mentorGrid.innerHTML = '<div class="empty"><p>' + esc(message) + '</p><button type="button" class="btn ghost" data-retry-tutor-directory>Try again</button></div>';
  }
  if (!supabaseClient || !user) {
    if (mentorGrid) mentorGrid.innerHTML = '<div class="empty">Sign in to find Meridian Mentors.</div>';
    if (mentorCount) mentorCount.textContent = "";
    return;
  }
  if (mentorGrid && location.hash.replace(/^#/, "") === "home") mentorGrid.innerHTML = '<div class="local-loading">Finding Meridian Mentors…</div>';
  if (mentorCount) mentorCount.textContent = "Loading Journey maps…";
  try {
  var result = await withTutorDirectoryTimeout(supabaseClient.rpc("get_verified_tutor_directory", { p_state: null, p_city: null }), "Loading the Mentor directory");
  if (requestId !== tutorDirectoryRequestId) return;
  if (result.error) { showDirectoryError(result.error); return; }
  tutors = (result.data || []).map(function (row) {
    return {
      user_id: row.user_id,
      n: row.display_name || "Meridian Mentor",
      g: row.grade ? "Class " + row.grade : "Learner · Meridian Mentor",
      s: row.subjects || [],
      h: row.headline || "Meridian Mentor",
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
    var directoryMeta = await withTutorDirectoryTimeout(Promise.all([
      supabaseClient.from("profiles").select("id, avatar_url, profile_banner_url").in("id", directoryIds),
      supabaseClient.from("follows").select("follower_id, following_id").or("follower_id.in.(" + directoryIds.join(",") + "),following_id.in.(" + directoryIds.join(",") + ")"),
      supabaseClient.from("tutor_profiles").select("user_id,session_price_inr").in("user_id", directoryIds),
    ]), "Loading Mentor profile details");
    if (requestId !== tutorDirectoryRequestId) return;
    var metaError = directoryMeta.find(function (item) { return item.error; });
    if (metaError) { showDirectoryError(metaError.error); return; }
    var mediaByUser = {}, followerCounts = {}, followingCounts = {}, pricesByUser = {};
    (directoryMeta[0].data || []).forEach(function (profile) { mediaByUser[profile.id] = profile; });
    (directoryMeta[1].data || []).forEach(function (follow) {
      followerCounts[follow.following_id] = (followerCounts[follow.following_id] || 0) + 1;
      followingCounts[follow.follower_id] = (followingCounts[follow.follower_id] || 0) + 1;
    });
    (directoryMeta[2].data || []).forEach(function (row) { pricesByUser[row.user_id] = Number(row.session_price_inr || 149); });
    tutors.forEach(function (tutor) { var media = mediaByUser[tutor.user_id] || {}; tutor.avatarUrl = media.avatar_url || ""; tutor.bannerUrl = media.profile_banner_url || ""; tutor.sessionPrice = pricesByUser[tutor.user_id] || 149; tutor.followerCount = followerCounts[tutor.user_id] || 0; tutor.followingCount = followingCounts[tutor.user_id] || 0; });
  }
  if (canMentor(user) && !tutors.some(function (tutor) { return tutor.user_id === user.id; })) {
    var ownResults = await withTutorDirectoryTimeout(Promise.all([
      supabaseClient.from("tutor_profiles").select("user_id, headline, subjects, is_available, session_price_inr").eq("user_id", user.id).maybeSingle(),
      supabaseClient.from("tutor_verification_requests").select("status").eq("user_id", user.id).order("submitted_at", { ascending: false }).limit(1),
    ]), "Loading your Mentor profile");
    if (requestId !== tutorDirectoryRequestId) return;
    var ownError = ownResults.find(function (item) { return item.error; });
    if (ownError) { showDirectoryError(ownError.error); return; }
    var own = ownResults[0].data;
    if (own) {
      var ownStatus = (ownResults[1].data || [])[0],
        statusLabel = ownStatus && ownStatus.status === "pending" ? "Pending review" : ownStatus && ownStatus.status === "rejected" ? "Needs resubmission" : "Not verified";
      tutors.push({
        user_id: own.user_id, n: user.n, g: user.grade ? "Class " + user.grade : "Learner · Meridian Mentor",
        s: own.subjects || [], h: own.headline || "Meridian Mentor",
        school: user.location && user.location.school || "", city: user.location && user.location.city || "",
        state: user.location && user.location.state || "", country: user.location && user.location.country || "",
        verified: !!(ownStatus && ownStatus.status === "verified"), verificationStatus: statusLabel,
        available: !!own.is_available, sessionPrice: Number(own.session_price_inr || 149), c: "#2B4EFF", me: true,
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
  loadMeridianMatches();
  } catch (error) {
    showDirectoryError(error);
  }
}

async function loadMeridianMatches() {
  var panel = document.getElementById("matchedMentors"), target = document.getElementById("matchedMentorList");
  if (!panel || !target || !user || !user.guidance || !supabaseClient) { if (panel) panel.hidden = true; return; }
  panel.hidden = false;
  target.innerHTML = '<div class="local-loading">Finding guides for your next step…</div>';
  // Matching weights are enforced by the database so clients cannot alter rankings.
  var response = await supabaseClient.rpc("meridian_match_candidates");
  if (response.error) {
    panel.hidden = true;
    if (!/permission denied|does not exist|could not find/i.test(authErrorText(response.error))) console.warn("Meridian matching is unavailable:", response.error.message);
    return;
  }
  var candidates = (response.data || []).map(function (row) {
    return { result: row, mentor: tutors.find(function (item) { return item.user_id === row.mentor_id; }) };
  }).filter(function (row) { return !!row.mentor; });
  if (!candidates.length) { panel.hidden = true; return; }
  target.innerHTML = candidates.map(function (item) {
    var mentor = item.mentor, result = item.result;
    return '<article class="meridian-match-card"><div class="meridian-match-person">' + (mentor.avatarUrl ? '<img src="' + esc(mentor.avatarUrl) + '" alt="" loading="lazy">' : '<span>' + esc(ini(publicName(mentor.n))) + '</span>') + '<div><h3>' + esc(publicName(mentor.n)) + '</h3><p class="muted">Class ' + esc(String(mentor.g || "").replace(/^Class\s*/i, "")) + ' · ' + esc([mentor.city, mentor.state].filter(Boolean).join(", ")) + '</p></div></div><p>' + esc(result.why_matched || "A verified guide for the stage you are working through.") + '</p>' + (result.rating !== null && result.rating !== undefined ? '<div class="meridian-match-rating">★ ' + esc(Number(result.rating).toFixed(1)) + ' <span class="muted">(' + esc(result.review_count) + ' reviews)</span></div>' : '') + '<div class="meridian-match-actions"><button type="button" class="btn ghost" data-match-open="' + esc(mentor.user_id) + '">View journey</button><button type="button" class="btn" data-match-book="' + esc(mentor.user_id) + '">Book a Bearings call</button></div></article>';
  }).join("");
  target.onclick = async function (event) {
    var button = event.target.closest("[data-match-open],[data-match-book]");
    if (!button) return;
    var mentorId = button.dataset.matchOpen || button.dataset.matchBook;
    var mentor = tutors.find(function (item) { return item.user_id === mentorId; });
    if (!mentor) return;
    button.disabled = true;
    await supabaseClient.rpc("meridian_log_match_event", { p_mentor_id: mentorId, p_event: "clicked" });
    button.disabled = false;
    if (button.hasAttribute("data-match-open")) showTutorProfile(mentor);
    else if (!canLearn(user)) window.alert("Switch to Learner or Both to book a guide.");
    else startMentorBooking(mentor);
  };
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
var activeWorkspace = "learner";
var meridianNotificationDialog = document.getElementById("meridianNotificationDialog");
async function refreshMeridianNotificationCount() {
  var badge = document.getElementById("meridianNotificationCount");
  if (!badge || !user || !supabaseClient) { if (badge) badge.textContent = ""; return; }
  var result = await supabaseClient.from("meridian_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("read_at", null);
  badge.textContent = result.error || !result.count ? "" : String(Math.min(result.count, 99));
}
async function loadMeridianNotifications() {
  var list = document.getElementById("meridianNotificationList");
  if (!list || !user || !supabaseClient) return;
  list.innerHTML = '<div class="local-loading">Loading your updates…</div>';
  var result = await supabaseClient.from("meridian_notifications").select("id,type,title,message,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
  if (result.error) { list.innerHTML = '<div class="community-empty">Notifications are unavailable. Run the latest Meridian database migration.</div>'; return; }
  await refreshMeridianNotificationCount();
  if (!result.data || !result.data.length) { list.innerHTML = '<div class="community-empty">You’re all caught up. Booking updates will appear here.</div>'; return; }
  list.innerHTML = result.data.map(function (item) {
    return '<button type="button" class="meridian-notification-item' + (item.read_at ? '' : ' unread') + '" data-meridian-notification="' + esc(item.id) + '"><b>' + esc(item.title || "Meridian update") + '</b><span>' + esc(item.message || "Open Bearings calls for details.") + '</span><span>' + esc(relativeTime(item.created_at)) + '</span></button>';
  }).join("");
}
var meridianNotificationBell = document.getElementById("meridianNotificationBell");
if (meridianNotificationBell) meridianNotificationBell.addEventListener("click", async function () {
  if (!user || !meridianNotificationDialog) return;
  meridianNotificationDialog.showModal();
  await loadMeridianNotifications();
});
window.addEventListener("focus", refreshMeridianNotificationCount);
document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshMeridianNotificationCount(); });
var meridianNotificationClose = document.getElementById("meridianNotificationClose");
if (meridianNotificationClose) meridianNotificationClose.addEventListener("click", function () { if (meridianNotificationDialog) meridianNotificationDialog.close(); });
var meridianNotificationList = document.getElementById("meridianNotificationList");
if (meridianNotificationList) meridianNotificationList.addEventListener("click", async function (event) {
  var item = event.target.closest("[data-meridian-notification]");
  if (!item || !user || !supabaseClient) return;
  await supabaseClient.from("meridian_notifications").update({ read_at: new Date().toISOString() }).eq("id", item.dataset.meridianNotification).eq("user_id", user.id);
  if (meridianNotificationDialog) meridianNotificationDialog.close();
  location.hash = "#sessions";
  await refreshMeridianNotificationCount();
});
function hideStartupLoader() {
  var loader = document.getElementById("startupLoader");
  if (loader) window.setTimeout(function () { loader.classList.add("is-done"); }, 220);
}
function workspaceStorageKey() { return "meridianWorkspace:" + (user && user.id || "guest"); }
function applyWorkspacePreference() {
  if (!user || normalizeRole(user.role) !== "both") { activeWorkspace = canMentor(user) && !canLearn(user) ? "mentor" : "learner"; return; }
  try {
    var savedWorkspace = window.localStorage.getItem(workspaceStorageKey());
    if (!savedWorkspace) {
      var legacyWorkspaceKey = "peerConnectWorkspace:" + user.id;
      savedWorkspace = window.localStorage.getItem(legacyWorkspaceKey);
      if (savedWorkspace) {
        window.localStorage.setItem(workspaceStorageKey(), savedWorkspace);
        window.localStorage.removeItem(legacyWorkspaceKey);
      }
    }
    activeWorkspace = savedWorkspace === "mentor" ? "mentor" : "learner";
  } catch (_workspaceError) { activeWorkspace = "learner"; }
}
function switchWorkspace() {
  if (!user || normalizeRole(user.role) !== "both") return;
  activeWorkspace = activeWorkspace === "mentor" ? "learner" : "mentor";
  try { window.localStorage.setItem(workspaceStorageKey(), activeWorkspace); } catch (_workspaceError) {}
  paintRoleUI();
  var next = activeWorkspace === "mentor" ? "dashboard" : "home";
  history.replaceState(null, document.title, location.pathname + location.search + "#" + next);
  route();
}
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
      console.error("Could not restore Meridian session:", restored.error.message);
      dbody.innerHTML = '<h3 id="dt">Google sign-in did not finish</h3><p class="muted">Please start sign-in again. If it keeps happening, send us the error: ' + esc(restored.error.message) + '</p><button class="btn" id="retryAuth">Try again</button>';
      if (!dlg.open) dlg.showModal();
      document.getElementById("retryAuth").onclick = function () { dlg.close(); openSign(); };
      return null;
    }
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    return restored.data.session;
  }
  var current = await supabaseClient.auth.getSession();
  if (current.error) console.error("Could not restore Meridian session:", current.error.message);
  return current.data.session;
}

async function syncAuthUser(authUser) {
  if (!authUser) {
    user = null;
    activeWorkspace = "learner";
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
  var guidanceResult = supabaseClient ? await supabaseClient.from("learner_guidance_profiles")
    .select("goal_decision, board, target_exam, help_subjects, preferred_languages, city_tier")
    .eq("user_id", authUser.id).maybeSingle() : null;
  var safetyResult = supabaseClient ? await supabaseClient.from("meridian_account_safety")
    .select("date_of_birth, guardian_name, guardian_contact, guardian_contact_type, guardian_consent_verified_at, mentor_cleared_for_minors")
    .eq("user_id", authUser.id).maybeSingle() : null;
  if (profileResult && profileResult.error) {
    showProfileLoadError(profileResult.error);
    return;
  }
  if (locationResult && locationResult.error) {
    showProfileLoadError(locationResult.error);
    return;
  }
  if (guidanceResult && guidanceResult.error) {
    showProfileLoadError(guidanceResult.error);
    return;
  }
  if (safetyResult && safetyResult.error && safetyResult.error.code !== "42P01" && safetyResult.error.code !== "PGRST205" && !/could not find the table.*meridian_account_safety/i.test(authErrorText(safetyResult.error))) {
    showProfileLoadError(safetyResult.error);
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
    guidance: guidanceResult && !guidanceResult.error ? guidanceResult.data : null,
    safety: safetyResult && !safetyResult.error ? safetyResult.data : null,
    safetySchemaAvailable: !!(safetyResult && !safetyResult.error),
  };
  applyWorkspacePreference();
  var adminResult = await supabaseClient.from("verification_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  isVerificationAdmin = !adminResult.error && !!adminResult.data;
  paintSign();
  paintRoleUI();
  if (profileNeedsSetup(user) && !onboardingOpen) openOnboarding(false);
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
function profileNeedsSetup(account) {
  return !!account && (!account.role || !account.grade || missingProfileLocation(account.location) || (canLearn(account) && !account.guidance) || (account.safetySchemaAvailable && !account.safety));
}

function showProfileLoadError(error) {
  onboardingOpen = false;
  dlg.classList.remove("auth-screen", "profile-dialog", "setup-dialog");
  var permissionError = /permission denied for table (profiles|learner_guidance_profiles)/i.test(authErrorText(error));
  var detail = permissionError
    ? 'Supabase is blocking access to your saved profile. In Supabase, open SQL Editor and run the profile setup and learner goals SQL files from your project, then return here and choose Try again.'
    : authErrorText(error);
  dbody.innerHTML = '<h3 id="dt">Couldn’t load your saved profile</h3><p class="muted">Meridian could not read your account setup, so it won’t ask you to fill it in again until the read works.</p><div class="err" id="profileLoadErr" role="alert">' + esc(detail) + '</div><div class="row"><button class="btn ghost" id="retryProfileLoad">Try again</button><button class="btn" id="profileErrorSignOut">Sign out</button></div>';
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
      : 'New to Meridian? <button class="text-button" id="switchAuth">Create an account</button>') +
    (signingUp ? "" : '<br><button class="text-button" id="forgotPassword">Forgot password?</button>') +
    '</p></section>' +
    '<aside class="auth-brand-panel" aria-label="About Meridian"><div class="auth-brand-top"><span class="auth-brand-mark">M</span>Meridian</div>' +
    '<div class="auth-brand-copy"><div class="auth-brand-eyebrow">Learn together, move forward</div><h2>Good guidance starts peer to peer.</h2>' +
    '<p>Meet learners who understand your classes, questions, and goals. Share what you know and get unstuck together.</p>' +
    '<div class="auth-feature-stack"><div class="auth-feature"><b>◎</b><span><strong>Find a Meridian Mentor</strong> who knows your stage</span></div>' +
    '<div class="auth-feature"><b>↗</b><span><strong>Ask a doubt</strong> and learn from the community</span></div>' +
    '<div class="auth-feature"><b>✓</b><span><strong>Book a Bearings call</strong> with a verified Mentor</span></div></div></div>' +
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
      '<h3 id="dt">Your Meridian account</h3><p style="color:var(--muted)">' +
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

var learnerGoalDecisionChoices = [
  ["choose_stream", "Choose my stream"],
  ["start_class_11", "Start Class 11 right"],
  ["exam_roadmap", "JEE / NEET roadmap"],
  ["choose_branch_college", "Choose a branch or college"],
  ["recover_result", "Recover from a bad result"],
  ["other", "Other"],
];
var learnerBoardChoices = ["CBSE", "ICSE", "State board", "Other"];
var learnerHelpSubjects = ["Maths", "Physics", "Chemistry", "Biology", "English", "Computer Science", "History", "Accountancy", "Economics", "Other"];
var learnerLanguageChoices = ["English", "Hindi", "Bengali", "Tamil", "Telugu", "Marathi", "Kannada", "Malayalam", "Gujarati", "Punjabi", "Urdu", "Other"];
function learnerGoalCheckboxGroup(name, title, options, selected, limit) {
  selected = selected || [];
  return '<fieldset class="profile-goal-group' + (limit ? ' goal-help-subjects' : '') + '"' + (limit ? ' data-goal-limit="' + limit + '"' : '') + '><legend>' + esc(title) + '</legend><div class="goal-checkbox-grid">' + options.map(function (option) {
    var checked = selected.indexOf(option) >= 0;
    return '<label><input type="checkbox" name="' + esc(name) + '" value="' + esc(option) + '"' + (checked ? ' checked' : '') + '><span>' + esc(option) + '</span></label>';
  }).join("") + '</div>' + (limit ? '<small class="muted">Choose up to ' + limit + '.</small>' : '') + '</fieldset>';
}
function openOnboarding(changeRole) {
  if (!user || !supabaseClient || onboardingOpen) return;
  var setupRequired = profileNeedsSetup(user);
  dlg.classList.remove("auth-screen");
  dlg.classList.remove("profile-dialog");
  dlg.classList.add("setup-dialog");
  onboardingOpen = true;
  var selectedRole = normalizeRole(user.role) || (changeRole ? "" : "learner");
  var savedLocation = user.location || {};
  var savedGuidance = user.guidance || {};
  var savedSafety = user.safety || {};
  var rolePicker = '<fieldset class="role-options"><legend>How do you want to use Meridian?</legend><button type="button" class="role-option' + (selectedRole === "learner" || selectedRole === "student" ? " selected" : "") + '" data-role="learner" aria-pressed="' + (selectedRole === "learner" || selectedRole === "student") + '"><strong>Learner</strong><span>Find a Meridian Mentor, ask questions, and get guidance.</span></button><button type="button" class="role-option' + (selectedRole === "mentor" || selectedRole === "tutor" ? " selected" : "") + '" data-role="mentor" aria-pressed="' + (selectedRole === "mentor" || selectedRole === "tutor") + '"><strong>Meridian Mentor</strong><span>Share what you know and guide learners in lower classes.</span></button><button type="button" class="role-option' + (selectedRole === "both" ? " selected" : "") + '" data-role="both" aria-pressed="' + (selectedRole === "both") + '"><strong>Both</strong><span>Get guidance from mentors and guide learners in lower classes.</span></button></fieldset>';
  dbody.innerHTML =
    '<h3 id="dt">Set up your profile</h3><p style="color:var(--muted);margin:6px 0 14px">Add your school, location, and guidance goals so Meridian can help you find the right people.</p>' +
    '<label for="profileName">Name</label><input id="profileName" autocomplete="name" value="' + esc(user.n) + '">' +
    '<label for="profileGrade">Class</label><select id="profileGrade" required aria-label="Choose your class"><option value="">Choose your class</option>' +
    [9, 10, 11, 12].map(function (grade) {
      return '<option value="' + grade + '"' + (Number(user.grade) === grade ? " selected" : "") + '>Class ' + grade + '</option>';
    }).join("") +
    '</select><label for="profileSchool">School</label><input id="profileSchool" maxlength="180" autocomplete="organization" value="' + esc(savedLocation.school || "") + '" placeholder="Your school name">' +
    '<label for="profileCity">City</label><input id="profileCity" maxlength="100" autocomplete="address-level2" value="' + esc(savedLocation.city || "") + '">' +
    '<label for="profileState">State</label><input id="profileState" maxlength="100" autocomplete="address-level1" value="' + esc(savedLocation.state || "") + '">' +
    '<label for="profileCountry">Country</label><input id="profileCountry" maxlength="100" autocomplete="country-name" value="' + esc(savedLocation.country || "") + '">' +
    (user.safetySchemaAvailable ? '<label for="profileDob">Date of birth</label><input id="profileDob" type="date" max="' + new Date().toISOString().slice(0,10) + '" required value="' + esc(savedSafety.date_of_birth || "") + '"><div id="guardianFields"' + ((savedSafety.guardian_contact && !savedSafety.guardian_consent_verified_at) ? '' : ' hidden') + '><p class="muted">Learners under 18 need a parent or guardian to confirm consent before bookings unlock.</p><label for="guardianName">Parent or guardian name</label><input id="guardianName" maxlength="120" value="' + esc(savedSafety.guardian_name || '') + '"><label for="guardianEmail">Parent or guardian email</label><input id="guardianEmail" type="email" autocomplete="email" maxlength="254" value="' + esc(savedSafety.guardian_contact_type === 'email' ? savedSafety.guardian_contact : '') + '"></div>' : '') +
    rolePicker + '<div id="learnerGoalFields" class="learner-goal-fields"><h4>Your guidance goals</h4><p class="muted">Tell us what you’re working toward. You can update this any time.</p>' +
    '<label for="learnerGoalDecision">What would you like guidance with?</label><select id="learnerGoalDecision" required><option value="">Choose a goal</option>' + learnerGoalDecisionChoices.map(function (item) { return '<option value="' + item[0] + '"' + (savedGuidance.goal_decision === item[0] ? ' selected' : '') + '>' + esc(item[1]) + '</option>'; }).join("") + '</select>' +
    '<label for="learnerBoard">Your board</label><select id="learnerBoard" required><option value="">Choose your board</option>' + learnerBoardChoices.map(function (item) { return '<option' + (savedGuidance.board === item ? ' selected' : '') + '>' + esc(item) + '</option>'; }).join("") + '</select>' +
    '<label for="learnerTargetExam">Target exam <span class="muted">(optional)</span></label><input id="learnerTargetExam" maxlength="80" value="' + esc(savedGuidance.target_exam || '') + '" placeholder="For example, JEE Main or NEET">' +
    learnerGoalCheckboxGroup("learnerHelpSubjects", "Subjects you want help with", learnerHelpSubjects, savedGuidance.help_subjects, 3) +
    learnerGoalCheckboxGroup("learnerLanguages", "Languages you prefer", learnerLanguageChoices, savedGuidance.preferred_languages) +
    '<label for="learnerCityTier">City type <span class="muted">(optional)</span></label><select id="learnerCityTier"><option value="">Prefer not to say</option><option value="tier_1"' + (savedGuidance.city_tier === "tier_1" ? ' selected' : '') + '>Tier 1</option><option value="tier_2"' + (savedGuidance.city_tier === "tier_2" ? ' selected' : '') + '>Tier 2</option><option value="tier_3"' + (savedGuidance.city_tier === "tier_3" ? ' selected' : '') + '>Tier 3</option><option value="other"' + (savedGuidance.city_tier === "other" ? ' selected' : '') + '>Other / not sure</option></select></div>' +
    '<div class="err" id="profileErr" role="alert"></div>' +
    '<div class="row"><button class="btn ghost" id="cancelProfile"' + (setupRequired ? ' hidden' : '') + '>Cancel</button><button class="btn" id="saveProfile">Continue</button></div>';
  dlg.dataset.setupRequired = String(setupRequired);
  if (!dlg.open) dlg.showModal();
  var goalFields = document.getElementById("learnerGoalFields");
  var birthInput = document.getElementById("profileDob"), guardianFields = document.getElementById("guardianFields");
  function updateGuardianVisibility() {
    if (!birthInput || !guardianFields) return;
    var birth = new Date(birthInput.value + "T00:00:00"), today = new Date();
    var age = today.getFullYear() - birth.getFullYear() - (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
    guardianFields.hidden = !birthInput.value || age >= 18;
  }
  if (birthInput) birthInput.addEventListener("change", updateGuardianVisibility);
  function updateGoalVisibility() { goalFields.hidden = !canLearn({ role: selectedRole }); }
  updateGoalVisibility();
  document.getElementById("cancelProfile").onclick = function () { dlg.close(); };
  dbody.querySelectorAll("[data-role]").forEach(function (button) {
    button.onclick = function () {
      selectedRole = button.dataset.role;
      dbody.querySelectorAll("[data-role]").forEach(function (option) {
        var selected = option.dataset.role === selectedRole;
        option.classList.toggle("selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
      updateGoalVisibility();
    };
  });
  dbody.querySelectorAll("[data-goal-limit] input[type=checkbox]").forEach(function (input) {
    input.addEventListener("change", function () {
      var group = input.closest("[data-goal-limit]"), limit = Number(group.dataset.goalLimit);
      var checked = group.querySelectorAll("input:checked");
      if (checked.length > limit) { input.checked = false; document.getElementById("profileErr").textContent = "Choose up to " + limit + " subjects."; }
      else document.getElementById("profileErr").textContent = "";
    });
  });
  document.getElementById("saveProfile").onclick = async function () {
    var saveButton = this;
    var name = document.getElementById("profileName").value.trim();
    var grade = Number(document.getElementById("profileGrade").value);
    var school = document.getElementById("profileSchool").value.trim();
    var city = document.getElementById("profileCity").value.trim();
    var state = document.getElementById("profileState").value.trim();
    var country = document.getElementById("profileCountry").value.trim();
    var birthDate = birthInput ? birthInput.value : "", guardianName = document.getElementById("guardianName") ? document.getElementById("guardianName").value.trim() : "", guardianEmail = document.getElementById("guardianEmail") ? document.getElementById("guardianEmail").value.trim() : "";
    var needsLearnerGoals = canLearn({ role: selectedRole });
    var guidance = needsLearnerGoals ? {
      goal_decision: document.getElementById("learnerGoalDecision").value,
      board: document.getElementById("learnerBoard").value,
      target_exam: document.getElementById("learnerTargetExam").value.trim() || null,
      help_subjects: Array.from(dbody.querySelectorAll('input[name="learnerHelpSubjects"]:checked')).map(function (input) { return input.value; }),
      preferred_languages: Array.from(dbody.querySelectorAll('input[name="learnerLanguages"]:checked')).map(function (input) { return input.value; }),
      city_tier: document.getElementById("learnerCityTier").value || null,
    } : null;
    var message = document.getElementById("profileErr");
    if (!name || !grade || !selectedRole || !school || !city || !state || !country) {
      message.textContent = "Add your name, class, school, city, state, country, and account type.";
      return;
    }
    if (grade < 9 || grade > 12) { message.textContent = "Choose a class from 9 to 12."; return; }
    if (user.safetySchemaAvailable) {
      if (!birthDate) { message.textContent = "Add your date of birth to continue."; return; }
      var dob = new Date(birthDate + "T00:00:00"), nowDate = new Date(), age = nowDate.getFullYear() - dob.getFullYear() - (nowDate < new Date(nowDate.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
      if (age < 14) { message.textContent = "Meridian is available to learners aged 14 and over. Please check back when you are 14."; return; }
      if (age < 18 && (!guardianName || !guardianEmail)) { message.textContent = "A parent or guardian name and email are required for learners under 18."; return; }
    }
    if (needsLearnerGoals && (!guidance.goal_decision || !guidance.board || guidance.preferred_languages.length < 1 || guidance.help_subjects.length > 3)) {
      message.textContent = "Choose a guidance goal, your board, and at least one preferred language. Choose no more than three subjects.";
      return;
    }
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
        message.textContent = authErrorText(profileSave.error || { message: "Your account profile was not found." }) + " — check the profile setup migration listed in the Meridian setup guide.";
        saveButton.disabled = false; saveButton.textContent = "Continue"; return;
      }
      var locationSave = await supabaseClient.from("profile_locations").upsert({ user_id: user.id, school: school, city: city, state: state, country: country });
      if (locationSave.error) {
        message.textContent = authErrorText(locationSave.error) + " — check the profile setup migration listed in the Meridian setup guide.";
        saveButton.disabled = false; saveButton.textContent = "Continue"; return;
      }
    } else if (saved.error) {
      message.textContent = authErrorText(saved.error);
      saveButton.disabled = false; saveButton.textContent = "Continue"; return;
    }
    if (needsLearnerGoals) {
      var guidanceSave = await supabaseClient.from("learner_guidance_profiles").upsert({ user_id: user.id, ...guidance }, { onConflict: "user_id" });
      if (guidanceSave.error) {
        message.textContent = authErrorText(guidanceSave.error) + " — run supabase_meridian_safety_moderation.sql in Supabase SQL Editor first.";
        saveButton.disabled = false; saveButton.textContent = "Continue"; return;
      }
      user.guidance = guidance;
    }
    if (user.safetySchemaAvailable) {
      var safetySave = await supabaseClient.from("meridian_account_safety").upsert({ user_id: user.id, date_of_birth: birthDate, guardian_name: guardianName || null, guardian_contact: guardianEmail || null, guardian_contact_type: guardianEmail ? "email" : null }, { onConflict: "user_id" });
      if (safetySave.error) { message.textContent = authErrorText(safetySave.error); saveButton.disabled = false; saveButton.textContent = "Continue"; return; }
      user.safety = { date_of_birth: birthDate, guardian_name: guardianName || null, guardian_contact: guardianEmail || null, guardian_contact_type: guardianEmail ? "email" : null, guardian_consent_verified_at: savedSafety.guardian_consent_verified_at || null, mentor_cleared_for_minors: savedSafety.mentor_cleared_for_minors || false };
    }
    user.n = name;
    user.grade = grade;
    user.role = selectedRole;
    user.location = { school: school, city: city, state: state, country: country };
    applyWorkspacePreference();
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
  window.MERIDIAN_SUPABASE_URL &&
  window.MERIDIAN_SUPABASE_PUBLISHABLE_KEY
) {
  supabaseClient = window.supabase.createClient(
    window.MERIDIAN_SUPABASE_URL,
    window.MERIDIAN_SUPABASE_PUBLISHABLE_KEY,
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
    hideStartupLoader();
  }).catch(function (error) {
    console.error("Could not restore Meridian session:", error.message);
    if (!user) showAuthForm("signin");
    hideStartupLoader();
  });
  window.setTimeout(hideStartupLoader, 12000);
} else {
  hideStartupLoader();
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
var allGuidanceAreas = [
  "Maths", "Physics", "Chemistry", "Biology", "English", "Computer Science", "History",
  "JEE", "NEET", "Olympiads", "Other exams", "Debate", "Art", "Theater", "Music",
  "Sports", "Chess", "Robotics", "Writing", "Public speaking", "Study skills",
  "Time management", "College and career guidance",
];
async function openTutor() {
  // Sign-in uses a full-screen two-column layout. Clear that class before
  // reusing the shared dialog for the compact mentor-profile editor.
  dlg.classList.remove("auth-screen", "profile-dialog", "setup-dialog");
  dlg.classList.add("profile-dialog");
  if (!user) {
    openSign();
    return;
  }
  if (!canMentor(user)) {
    onboardingOpen = false;
    openOnboarding(true);
    return;
  }
  var existingResult = await supabaseClient.from("tutor_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingResult.error) { window.alert(authErrorText(existingResult.error) + " — run the updated Meridian migration in Supabase first."); return; }
  var existing = existingResult.data;
  if (existing) {
    mine = true;
  }
  if (mine && !existing) {
    location.hash = "dashboard";
    return;
  }
  var pick = existing ? (existing.subjects || []).slice() : [];
  var journeyResult = await supabaseClient.from("meridian_mentor_journey").select("stage_year,stage,choice,why,completed_at").eq("user_id", user.id).order("position");
  if (journeyResult.error) { window.alert(authErrorText(journeyResult.error) + " — run the updated Meridian migration in Supabase first."); return; }
  var journeyRows = journeyResult.data || [];
  var selectedStrengths = (existing && existing.guidance_strengths && existing.guidance_strengths.length ? existing.guidance_strengths : pick.slice(0,3)).slice();
  var selectedLanguages = existing && existing.guidance_languages ? existing.guidance_languages.slice() : [];
  var selectedGoals = existing && existing.guidance_goals ? existing.guidance_goals.slice() : [];
  var guidanceChoices = allGuidanceAreas.slice();
  pick.forEach(function (area) { if (guidanceChoices.indexOf(area) < 0) guidanceChoices.push(area); });
  var mentorLanguages = ["English","Hindi","Bengali","Gujarati","Kannada","Malayalam","Marathi","Odia","Punjabi","Tamil","Telugu","Urdu"];
  var guidanceGoals = learnerGoalDecisionChoices.map(function (item) { return { value:item[0], label:item[1] }; });
  var optionGroup = function (key, options, selected) { return '<div class="profile-choice-grid" data-profile-array="' + key + '">' + options.map(function (option) { var value=typeof option === "string" ? option : option.value, label=typeof option === "string" ? option : option.label; return '<label class="profile-choice"><input type="checkbox" value="' + esc(value) + '"' + (selected.indexOf(value)>=0 ? ' checked' : '') + '><span>' + esc(label) + '</span></label>'; }).join("") + '</div>'; };
  var journeyMarkup = function (row) { row=row||{}; return '<article class="journey-edit-row"><div class="journey-edit-grid"><label>Year<input data-journey-year type="number" min="2000" max="' + new Date().getFullYear() + '" value="' + esc(String(row.stage_year||'')) + '" placeholder="2025"></label><label>Stage<input data-journey-stage maxlength="80" value="' + esc(row.stage||'') + '" placeholder="Class 11 PCM"></label><label>What you chose<input data-journey-choice maxlength="180" value="' + esc(row.choice||'') + '" placeholder="Started JEE preparation"></label><label>Why / what changed<textarea data-journey-why maxlength="280" rows="2" placeholder="One thing you learned that could help someone behind you">' + esc(row.why||'') + '</textarea></label><label>Finished this stage<input data-journey-completed type="date" value="' + esc(row.completed_at||'') + '"></label><button type="button" class="btn ghost" data-journey-remove>Remove stage</button></div></article>'; };
  dbody.innerHTML =
    '<h3 id="dt">' + (existing ? "Edit your mentor profile" : "Set up your mentor profile") + '</h3><p style="color:var(--muted);margin:6px 0 0">Your class is saved as Class ' + esc(String(user.grade || "—")) + '.</p>' +
    '<label for="tn">Name</label><input id="tn" placeholder="Full name" autocomplete="name" value="' +
    (user ? esc(user.n) : "") +
    '">' +
    '<label>Areas where you can guide others <span class="muted">(choose up to 8)</span></label><p class="muted">Pick subjects, exams, Olympiads, arts, sports, or any other area where you can share helpful experience.</p><div class="sp" id="sp">' +
    guidanceChoices
      .map(function (s) {
        return (
          '<button type="button" class="chip" aria-pressed="false" data-sub="' +
          esc(s) +
          '">' +
          esc(s) +
          "</button>"
        );
      })
      .join("") +
    '</div><div class="guidance-custom"><label for="customGuidance">Add another area</label><div><input id="customGuidance" maxlength="60" placeholder="For example: guitar, public speaking, NTSE"><button type="button" class="btn ghost" id="addGuidance">Add area</button></div></div>' +
    '<h4>What guidance can you give?</h4><label>Your strongest areas <span class="muted">(choose up to 3)</span></label>' + optionGroup("strengths", guidanceChoices, selectedStrengths) +
    '<label>Goals you have experience with</label>' + optionGroup("goals", guidanceGoals, selectedGoals) +
    '<label>Languages you can guide in <span class="muted">(choose at least 1)</span></label>' + optionGroup("languages", mentorLanguages, selectedLanguages) +
    '<label for="mentorBoard">Board</label><select id="mentorBoard"><option value="">Choose your board</option>' + ["CBSE","ICSE","State board","Other"].map(function (board) { return '<option' + (existing && existing.board === board ? ' selected' : '') + '>' + board + '</option>'; }).join("") + '</select>' +
    '<label for="mentorCityTier">City type</label><select id="mentorCityTier"><option value="">Prefer not to say</option>' + [["tier_1","Tier 1"],["tier_2","Tier 2"],["tier_3","Tier 3"],["other","Other / not sure"]].map(function (item) { return '<option value="' + item[0] + '"' + (existing && existing.city_tier === item[0] ? ' selected' : '') + '>' + item[1] + '</option>'; }).join("") + '</select>' +
    '<label for="mentorStudyStyle">Study style</label><select id="mentorStudyStyle"><option value="">Choose if you want</option>' + [["self_study","Mostly self-study"],["coaching","Coaching"],["mixed","A mix of both"]].map(function (item) { return '<option value="' + item[0] + '"' + (existing && existing.study_style === item[0] ? ' selected' : '') + '>' + item[1] + '</option>'; }).join("") + '</select>' +
    '<label for="mentorBest">Best guidance for</label><input id="mentorBest" maxlength="240" value="' + esc(existing && existing.advises_best || '') + '" placeholder="The choices or problems you can help someone think through">' +
    '<label for="mentorNotFit">When you may not be the right person</label><input id="mentorNotFit" maxlength="240" value="' + esc(existing && existing.advises_not || '') + '" placeholder="Be honest about what you have not experienced">' +
    '<label for="mentorLessons">Mistakes and what you would do differently</label><textarea id="mentorLessons" maxlength="500" rows="3" placeholder="Share a useful lesson from your own path">' + esc(existing && existing.lessons_learned || '') + '</textarea>' +
    '<label for="mentorExams">Exams you know <span class="muted">(comma separated)</span></label><input id="mentorExams" maxlength="240" value="' + esc(existing && (existing.guidance_exams || []).join(', ') || '') + '" placeholder="JEE Main, NEET, Olympiads">' +
    '<label for="mentorPrice">Price for a 30-minute Bearings call</label><select id="mentorPrice">' + [99,149].map(function (price) { return '<option value="' + price + '"' + (Number(existing && existing.session_price_inr || 149) === price ? ' selected' : '') + '>₹' + price + '</option>'; }).join("") + '</select>' +
    '<label for="mentorCap">Maximum sessions in one week</label><select id="mentorCap">' + [4,8,12,16,20,30].map(function (cap) { return '<option value="' + cap + '"' + (Number(existing && existing.weekly_session_cap || 8) === cap ? ' selected' : '') + '>' + cap + ' sessions</option>'; }).join("") + '</select>' +
    '<label for="th">Your experience and how you can help</label><textarea id="th" maxlength="500" rows="3" placeholder="For example: I can share how I built confidence for school debates and prepared for competitions.">' + esc(existing ? existing.headline || "" : "") + '</textarea>' +
    '<section class="journey-editor"><div class="journey-editor-heading"><div><h4>Your journey timeline</h4><p class="muted">Add the choices and stages that could help someone a few steps behind you.</p></div><button type="button" class="btn ghost" id="addJourneyStage">Add stage</button></div><div id="journeyEditorRows">' + (journeyRows.length ? journeyRows.map(journeyMarkup).join('') : journeyMarkup(null)) + '</div></section>' +
    '<div class="err" id="err" role="alert"></div>' +
    '<div class="row"><button class="btn ghost" id="cx">Cancel</button><button class="btn" id="ok">' + (existing ? "Save profile" : "Create profile") + '</button></div>' +
    '<div class="note">Your profile appears in mentor search after school verification. Guidance-area and timeline edits do not restart review; changes to your verified name, class, or school do.</div>';
  dlg.showModal();
  document.getElementById("cx").onclick = function () {
    dlg.close();
  };
  pick.forEach(function (s) {
    var selected = Array.from(document.querySelectorAll("#sp [data-sub]")).find(function (button) { return button.dataset.sub === s; });
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
    } else if (pick.length < 8) {
      pick.push(s);
      b.setAttribute("aria-pressed", "true");
    } else {
      document.getElementById("err").textContent = "Choose up to 8 guidance areas.";
    }
  };
  document.getElementById("addGuidance").onclick = function () {
    var input = document.getElementById("customGuidance"), area = input.value.trim(), error = document.getElementById("err");
    if (!area) return;
    if (pick.some(function (item) { return item.toLowerCase() === area.toLowerCase(); })) { error.textContent = "That guidance area is already added."; return; }
    if (pick.length >= 8) { error.textContent = "Choose up to 8 guidance areas."; return; }
    pick.push(area);
    guidanceChoices.push(area);
    var chip = document.createElement("button"); chip.type = "button"; chip.className = "chip"; chip.dataset.sub = area; chip.setAttribute("aria-pressed", "true"); chip.textContent = area;
    document.getElementById("sp").appendChild(chip); input.value = ""; error.textContent = "";
  };
  document.getElementById("addJourneyStage").onclick = function () {
    var rows = document.getElementById("journeyEditorRows");
    if (rows.querySelectorAll(".journey-edit-row").length >= 12) { document.getElementById("err").textContent = "Add up to 12 journey stages."; return; }
    rows.insertAdjacentHTML("beforeend", journeyMarkup(null));
  };
  document.getElementById("journeyEditorRows").addEventListener("click", function (event) {
    var remove = event.target.closest("[data-journey-remove]");
    if (!remove) return;
    var rows = document.getElementById("journeyEditorRows");
    if (rows.querySelectorAll(".journey-edit-row").length === 1) rows.innerHTML = journeyMarkup(null);
    else remove.closest(".journey-edit-row").remove();
  });
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
      er.textContent = "Choose at least one area where you can guide others.";
      return;
    }
    if (!h) {
      er.textContent = "Add a short note about your experience and how you can help.";
      return;
    }
    var selectedValues = function (key) { return Array.from(dbody.querySelectorAll('[data-profile-array="' + key + '"] input:checked')).map(function (input) { return input.value; }); };
    var strengths = selectedValues("strengths"), goals = selectedValues("goals"), languages = selectedValues("languages");
    if (!strengths.length || strengths.length > 3) { er.textContent = "Choose 1–3 areas where you feel strongest."; return; }
    if (!languages.length) { er.textContent = "Choose at least one language you can guide in."; return; }
    var journey = Array.from(dbody.querySelectorAll(".journey-edit-row")).map(function (row) {
      return {
        stage_year: row.querySelector("[data-journey-year]").value,
        stage: row.querySelector("[data-journey-stage]").value.trim(),
        choice: row.querySelector("[data-journey-choice]").value.trim(),
        why: row.querySelector("[data-journey-why]").value.trim(),
        completed_at: row.querySelector("[data-journey-completed]").value || null,
      };
    }).filter(function (stage) { return stage.stage || stage.choice || stage.why || stage.stage_year; });
    if (journey.length > 12 || journey.some(function (stage) { return !stage.stage_year || !stage.stage || !stage.choice || stage.why.length < 5; })) {
      er.textContent = "Finish each journey stage with its year, stage, choice, and a short lesson, or remove the empty row."; return;
    }
    var profileText = [h, document.getElementById("mentorBest").value, document.getElementById("mentorNotFit").value, document.getElementById("mentorLessons").value, document.getElementById("mentorExams").value].join(" ");
    if (meridianContactWarning(profileText)) { er.textContent = "Remove phone numbers, email addresses, links, and social handles from your profile."; return; }
    var exams = document.getElementById("mentorExams").value.split(",").map(function (item) { return item.trim(); }).filter(Boolean).slice(0, 12);
    var price = Number(document.getElementById("mentorPrice").value), weeklyCap = Number(document.getElementById("mentorCap").value);
    var mentorData = {
      user_id: user.id,
      headline: h,
      subjects: pick,
      skills: strengths,
      experience: h,
      guidance_strengths: strengths,
      guidance_goals: goals,
      guidance_exams: exams,
      guidance_languages: languages,
      board: document.getElementById("mentorBoard").value || null,
      city_tier: document.getElementById("mentorCityTier").value || null,
      study_style: document.getElementById("mentorStudyStyle").value || null,
      advises_best: document.getElementById("mentorBest").value.trim() || null,
      advises_not: document.getElementById("mentorNotFit").value.trim() || null,
      lessons_learned: document.getElementById("mentorLessons").value.trim() || null,
      weekly_session_cap: weeklyCap,
      session_price_inr: price,
      is_available: existing ? existing.is_available : true,
    };
    var saveButton = document.getElementById("ok");
    saveButton.disabled = true; saveButton.textContent = "Saving profile…";
    var profileResult = await supabaseClient
      .from("profiles")
      .update({ display_name: n })
      .eq("id", user.id);
    if (profileResult.error) {
      er.textContent = authErrorText(profileResult.error);
      saveButton.disabled = false; saveButton.textContent = existing ? "Save profile" : "Create profile";
      return;
    }
    var tutorResult = await supabaseClient.from("tutor_profiles").upsert(mentorData, { onConflict: "user_id" });
    if (tutorResult.error) {
      er.textContent = authErrorText(tutorResult.error);
      saveButton.disabled = false; saveButton.textContent = existing ? "Save profile" : "Create profile";
      return;
    }
    var journeySave = await supabaseClient.rpc("meridian_save_journey", { p_stages: journey });
    if (journeySave.error) {
      er.textContent = authErrorText(journeySave.error) + " — your profile is saved, but the journey timeline needs the latest Meridian migration.";
      saveButton.disabled = false; saveButton.textContent = existing ? "Save profile" : "Create profile";
      return;
    }
    user.n = n;
    paintSign();
    mine = true;
    dlg.close();
    await loadTutorDirectory();
    location.hash = "dashboard";
  };
}
document.getElementById("btnTutor").addEventListener("click", openTutor);
document.getElementById("btnTutor2").addEventListener("click", openTutor);

function achievementStatusLabel(status) {
  return status === "approved" ? "Approved for profile" : status === "rejected" ? "Needs changes" : "Waiting for review";
}
async function loadOwnMentorAchievements(target) {
  if (!target || !user) return;
  var result = await supabaseClient.from("mentor_achievements")
    .select("id,category,title,issuer,achievement_year,public_summary,public_evidence_path,status,evidence_path")
    .eq("user_id", user.id).order("created_at", { ascending: false });
  if (result.error) { target.innerHTML = '<p class="muted">Achievement tools need the latest Meridian database migration.</p>'; return; }
  var rows = result.data || [];
  target.innerHTML = rows.length ? rows.map(function (row) {
    return '<article class="mentor-achievement-item"><div><b>' + esc(row.title) + '</b><span class="achievement-status">' + esc(achievementStatusLabel(row.status)) + '</span><p class="muted">' + esc(row.category) + (row.issuer ? ' · ' + esc(row.issuer) : '') + (row.achievement_year ? ' · ' + esc(String(row.achievement_year)) : '') + '</p></div><button type="button" class="btn ghost" data-delete-achievement="' + esc(row.id) + '" data-evidence-path="' + esc(row.evidence_path) + '" data-public-path="' + esc(row.public_evidence_path || '') + '">Remove</button></article>';
  }).join("") : '<p class="muted">No achievements added yet.</p>';
  target.onclick = async function (event) {
    var button = event.target.closest("[data-delete-achievement]");
    if (!button || !window.confirm("Remove this achievement and its uploaded files?")) return;
    button.disabled = true;
    var paths = [button.dataset.evidencePath, button.dataset.publicPath].filter(Boolean);
    var removed = paths.length ? await supabaseClient.storage.from("mentor-achievements").remove(paths) : { error: null };
    if (removed.error) { window.alert(authErrorText(removed.error)); button.disabled = false; return; }
    var deleted = await supabaseClient.from("mentor_achievements").delete().eq("id", button.dataset.deleteAchievement).eq("user_id", user.id);
    if (deleted.error) window.alert(authErrorText(deleted.error));
    await loadOwnMentorAchievements(target);
  };
}
function openMentorAchievementManager() {
  if (!canMentor(user)) return;
  dlg.classList.remove("auth-screen", "profile-dialog", "setup-dialog");
  dlg.classList.add("profile-dialog");
  dbody.innerHTML = '<h3>Achievements and credentials</h3><p class="muted">Share exam results, certificates, medals, or other milestones. Your original proof stays private. Learners see only details approved by a reviewer.</p><p class="note">A public file is optional. Upload only a copy with your school ID number, roll number, address, date of birth, QR codes, signatures, and personal contact details hidden. A reviewer must approve it before learners can open it.</p><div id="mentorAchievementManager"><p class="muted">Loading your achievements…</p></div><div class="row"><button type="button" class="btn ghost" id="closeAchievementManager">Close</button><button type="button" class="btn" id="startAchievementForm">Add achievement</button></div>';
  if (!dlg.open) dlg.showModal();
  document.getElementById("closeAchievementManager").onclick = function () { dlg.close(); };
  document.getElementById("startAchievementForm").onclick = openMentorAchievementForm;
  loadOwnMentorAchievements(document.getElementById("mentorAchievementManager"));
}
function openMentorAchievementForm() {
  if (!canMentor(user)) return;
  var categories = ["Academic result", "Exam or Olympiad", "Debate and public speaking", "Art and performance", "Sports", "Other"],
    wasOpen = dlg.open;
  dlg.classList.remove("auth-screen", "profile-dialog", "setup-dialog");
  dlg.classList.add("profile-dialog");
  dbody.innerHTML = '<h3>Add an achievement</h3><p class="muted">Submit supporting proof privately. Only an approved summary and optional redacted copy can be shown on your profile.</p><label for="achievementCategory">Category</label><select id="achievementCategory">' + categories.map(function (category) { return '<option>' + esc(category) + '</option>'; }).join("") + '</select><label for="achievementTitle">Achievement or result</label><input id="achievementTitle" maxlength="120" placeholder="For example: 92% in Class 10 board exams"><label for="achievementIssuer">Awarded by <span class="muted">(optional)</span></label><input id="achievementIssuer" maxlength="120" placeholder="School, board, or competition"><label for="achievementYear">Year <span class="muted">(optional)</span></label><input id="achievementYear" type="number" min="1900" max="2100" placeholder="2026"><label for="achievementSummary">What should learners know?</label><textarea id="achievementSummary" rows="3" maxlength="500" placeholder="Briefly describe what you achieved or learned."></textarea><div class="verify-doc-fields"><label>Private proof <span class="muted">(required; only you and reviewers can access this)</span><input id="achievementEvidence" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><label>Redacted copy for learners <span class="muted">(optional; reviewed before sharing)</span><input id="achievementPublicCopy" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label></div><p class="note">JPG, PNG, WebP, or PDF, up to 5 MB per file. Never upload identity documents or copies that show private numbers, barcodes, QR codes, signatures, home details, or contact information.</p><div class="err" id="achievementError" role="alert"></div><div class="row"><button type="button" class="btn ghost" id="cancelAchievementForm">Cancel</button><button type="button" class="btn" id="submitAchievement">Send for review</button></div>';
  if (!wasOpen && !dlg.open) dlg.showModal();
  document.getElementById("cancelAchievementForm").onclick = function () { openMentorAchievementManager(); };
  document.getElementById("submitAchievement").onclick = async function () {
    var error = document.getElementById("achievementError"), button = document.getElementById("submitAchievement"),
      title = document.getElementById("achievementTitle").value.trim(), summary = document.getElementById("achievementSummary").value.trim(),
      evidence = document.getElementById("achievementEvidence").files[0], publicCopy = document.getElementById("achievementPublicCopy").files[0],
      allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!title || summary.length < 10 || !evidence) { error.textContent = "Add a title, a short summary, and private proof."; return; }
    if ([evidence, publicCopy].filter(Boolean).some(function (file) { return allowed.indexOf(file.type) < 0 || file.size > 5 * 1024 * 1024; })) { error.textContent = "Each file must be a JPG, PNG, WebP, or PDF under 5 MB."; return; }
    if (!window.crypto || !window.crypto.randomUUID) { error.textContent = "Update your browser before submitting."; return; }
    var id = window.crypto.randomUUID(), yearValue = document.getElementById("achievementYear").value,
      extension = function (file) { return file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "bin"; },
      evidencePath = user.id + "/" + id + "/evidence/" + window.crypto.randomUUID() + "." + extension(evidence),
      publicPath = publicCopy ? user.id + "/" + id + "/public/" + window.crypto.randomUUID() + "." + extension(publicCopy) : null;
    button.disabled = true; button.textContent = "Uploading privately…"; error.textContent = "";
    var inserted = await supabaseClient.from("mentor_achievements").insert({
      id: id, user_id: user.id, category: document.getElementById("achievementCategory").value,
      title: title, issuer: document.getElementById("achievementIssuer").value.trim() || null,
      achievement_year: yearValue ? Number(yearValue) : null, public_summary: summary,
      evidence_path: evidencePath, public_evidence_path: publicPath, status: "pending",
    });
    if (inserted.error) { error.textContent = authErrorText(inserted.error) + " — run the latest Meridian database migration first."; button.disabled = false; button.textContent = "Send for review"; return; }
    var uploadedPaths = [];
    var files = [{ file: evidence, path: evidencePath }]; if (publicCopy) files.push({ file: publicCopy, path: publicPath });
    for (var i = 0; i < files.length; i++) {
      var upload = await supabaseClient.storage.from("mentor-achievements").upload(files[i].path, files[i].file, { contentType: files[i].file.type, upsert: false });
      if (upload.error) {
        if (uploadedPaths.length) await supabaseClient.storage.from("mentor-achievements").remove(uploadedPaths);
        await supabaseClient.from("mentor_achievements").delete().eq("id", id).eq("user_id", user.id);
        error.textContent = authErrorText(upload.error); button.disabled = false; button.textContent = "Send for review"; return;
      }
      uploadedPaths.push(files[i].path);
    }
    openMentorAchievementManager();
  };
}

function paintRoleUI() {
  var isTutor = canMentor(user);
  var isSignedIn = !!user;
  var notificationBell = document.getElementById("meridianNotificationBell");
  if (notificationBell) notificationBell.hidden = !isSignedIn;
  if (isSignedIn) refreshMeridianNotificationCount();
  var isBoth = !!user && normalizeRole(user.role) === "both";
  document.querySelectorAll('[data-role-nav="tutor"]').forEach(function (el) { el.hidden = !isTutor || (isBoth && activeWorkspace !== "mentor"); });
  document.querySelectorAll('[data-workspace-nav="learner"]').forEach(function (el) { el.hidden = isTutor && (!isBoth || activeWorkspace !== "learner"); });
  document.querySelectorAll('[data-workspace-nav="mentor"]').forEach(function (el) { el.hidden = !isTutor || (isBoth && activeWorkspace !== "mentor"); });
  document.querySelectorAll('[data-workspace-switch]').forEach(function (button) { button.hidden = !isBoth; button.textContent = activeWorkspace === "mentor" ? "Switch to learner" : "Switch to mentor"; });
  var pricingLinks = document.querySelectorAll('[data-nav="pricing"]'); pricingLinks.forEach(function (el) { el.hidden = isTutor && (!isBoth || activeWorkspace !== "learner"); });
  document.querySelectorAll('.admin-only').forEach(function (el) { el.hidden = !isVerificationAdmin; });
  var become = document.getElementById("btnTutor");
  var becomeFromPricing = document.getElementById("btnTutor2");
  if (become) become.hidden = isSignedIn;
  if (becomeFromPricing) becomeFromPricing.hidden = isSignedIn;
  var title = document.getElementById("homeTitle");
  var intro = document.getElementById("homeIntro");
  var actions = document.getElementById("homeActions");
  var cards = document.getElementById("homeCards");
  if (isTutor && (!isBoth || activeWorkspace === "mentor")) {
    if (title) title.textContent = "Your mentor workspace.";
    if (intro) intro.textContent = "Review bookings, help learners make progress, and manage your mentoring profile.";
    if (actions) actions.innerHTML = '<a class="btn" href="#dashboard">Open mentor dashboard</a><a class="btn ghost" href="#settings">Mentor settings</a>';
    if (cards) cards.innerHTML = '<a href="#dashboard"><b>Bookings</b><span>Review learner requests and upcoming sessions.</span></a><a href="#doubts"><b>Guide learners</b><span>Share useful answers with the community.</span></a><a href="#sessions"><b>Sessions</b><span>Open booked chats and session details.</span></a>';
  } else {
    if (title) title.textContent = "Find a mentor who gets it.";
    if (intro) intro.textContent = "Meridian is a guidance network for learners. Find a Meridian Mentor who has been through your stage and get help with what comes next.";
    if (actions) actions.innerHTML = '<a class="btn" href="#home">Find a mentor</a><a class="btn ghost" href="#doubts">Ask a question</a>';
    if (cards) cards.innerHTML = '<a href="#home"><b>Mentors</b><span>Find verified mentors by subject and location.</span></a><a href="#doubts"><b>Questions</b><span>Ask questions, upvote the best ones, and answer what you know.</span></a><a href="#pricing"><b>Pricing</b><span>Free for learners and mentors. Optional Blue Tick may come later.</span></a>';
  }
}
var scheduleMentors = [], scheduleTypes = [], scheduleSlots = [], scheduleSlotsContext = null;
var selectedScheduleSlotIndex = null;
var activeChatSession = null, sessionChatPoll = null, sessionChatClock = null, sessionChatSignature = "", sessionChatSignedAt = 0, sessionChatBusy = false;
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
  if (user.safetySchemaAvailable && user.safety && meridianAge(user.safety.date_of_birth) !== null && meridianAge(user.safety.date_of_birth) < 18 && !user.safety.guardian_consent_verified_at) { window.alert("A parent or guardian must confirm consent before bookings unlock. Ask the Meridian safety team for help if you’re waiting."); return; }
  pendingBookingMentorId = tutor.user_id;
  scheduleMentors = [{ id: tutor.user_id, name: tutor.n || "Verified mentor", price: Number(tutor.sessionPrice || 149) }];
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
  var selectedMentor = selectedScheduleMentor();
  root.innerHTML = '<div class="schedule-form"><input id="sessionType" type="hidden"><p class="session-policy-note">One 30-minute Bearings call · Daily 8:00 AM–8:00 PM IST</p><label>What would you like guidance on? <span class="muted">(20–300 characters; keep it focused on learning)</span><textarea id="bookingQuestion" maxlength="300" minlength="20" rows="3" placeholder="For example: I understand the method, but I take too long on algebra questions. How can I improve my speed?" required></textarea></label><label class="session-date-label">Choose a day<input id="sessionDate" type="date" min="' + isoTodayIn("Asia/Kolkata") + '" value="' + isoTodayIn("Asia/Kolkata") + '"></label><div id="sessionDateStrip" class="session-date-strip" aria-label="Choose a day"></div><p id="sessionBookingMessage" class="muted" role="status"></p></div><div id="sessionSlots" class="schedule-slots"><div class="community-empty">Finding open times…</div></div><div class="session-booking-footer"><span class="session-price-note">₹' + esc(selectedMentor && selectedMentor.price || 149) + ' · 30 minutes</span><button class="btn" id="requestSession" type="button" hidden disabled>Continue to secure payment</button></div>';
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
    var question = document.getElementById("bookingQuestion"), questionText = question ? question.value.trim() : "", status = document.getElementById("sessionBookingMessage");
    if (questionText.length < 20 || questionText.length > 300) { if (status) status.textContent = "Add a learning question between 20 and 300 characters."; if (question) question.focus(); return; }
    if (meridianContactWarning(questionText)) { if (status) status.textContent = "For safety, remove phone numbers, emails, links, and social handles. Ask your learning question without private contact details."; if (question) question.focus(); return; }
    request.disabled = true; request.textContent = "Preparing secure payment…";
    var chosen = scheduleSlots[selectedScheduleSlotIndex];
    var result = await supabaseClient.from("peer_sessions").insert({ connection_id: null, session_type_id: scheduleSlotsContext.typeId, learner_id: user.id, mentor_id: scheduleSlotsContext.mentorId, starts_at: chosen.starts_at, ends_at: chosen.ends_at, timezone: chosen.timezone, learner_note: questionText, status: "pending" }).select("id,price_inr").single();
    if (result.error) { if (status) status.textContent = authErrorText(result.error); request.disabled = false; request.textContent = "Continue to secure payment"; return; }
    var orderResult = await supabaseClient.functions.invoke("meridian-create-order", { body: { sessionId: result.data.id } });
    if (orderResult.error || !orderResult.data) {
      await supabaseClient.rpc("meridian_abandon_unpaid_booking", { p_session_id: result.data.id });
      if (status) status.textContent = orderResult.error ? authErrorText(orderResult.error) : "Secure payments are not set up yet. Please try again later.";
      request.disabled = false; request.textContent = "Continue to secure payment"; await loadSessionSlots(); return;
    }
    if (status) status.textContent = "Choose a payment method. Your booking will be sent to the mentor after payment is verified.";
    openMeridianCheckout(orderResult.data, result.data.id, request, status);
  };
  loadSessionTypes();
}
function openMeridianCheckout(order, sessionId, button, status) {
  var start = function () {
    var checkout = new window.Razorpay({
      key: order.keyId, amount: order.amount, currency: order.currency || "INR", name: "Meridian",
      description: "30-minute guidance call", order_id: order.orderId,
      theme: { color: "#d878b1" },
      handler: async function (payment) {
        if (status) status.textContent = "Verifying payment securely…";
        var verified = await supabaseClient.functions.invoke("meridian-verify-payment", { body: { sessionId: sessionId, paymentId: payment.razorpay_payment_id, orderId: payment.razorpay_order_id, signature: payment.razorpay_signature } });
        if (verified.error || verified.data && verified.data.error) { if (status) status.textContent = verified.data && verified.data.error || "Payment verification is still processing. Check your sessions in a moment."; button.disabled = false; return; }
        if (status) status.textContent = "Payment verified. Your booking request has been sent to the mentor.";
        selectedScheduleSlotIndex = null; button.textContent = "Payment verified"; button.disabled = true;
        await loadSessionSlots(); await loadPeerSessionList();
      },
      modal: { ondismiss: async function () {
        if (status) status.textContent = "Checkout closed. The unpaid slot will be released shortly; you can choose another time.";
        button.disabled = false; button.textContent = "Continue to secure payment";
        await supabaseClient.rpc("meridian_abandon_unpaid_booking", { p_session_id: sessionId });
        await loadSessionSlots();
      } },
    });
    checkout.on("payment.failed", function (failure) { if (status) status.textContent = failure.error && failure.error.description || "Payment was not completed. Choose another payment method or try again."; button.disabled = false; });
    checkout.open();
  };
  if (window.Razorpay) { start(); return; }
  var script = document.querySelector('script[data-meridian-razorpay]');
  if (!script) { script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.dataset.meridianRazorpay = "true"; document.head.appendChild(script); }
  script.addEventListener("load", start, { once: true });
  script.addEventListener("error", async function () { if (status) status.textContent = "Secure checkout could not load. Please try again."; button.disabled = false; await supabaseClient.rpc("meridian_abandon_unpaid_booking", { p_session_id: sessionId }); }, { once: true });
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
  slotsRoot.innerHTML = '<div class="local-loading">Finding open times…</div>';
  var result = await supabaseClient.rpc("get_peer_session_slots", { p_mentor_id: mentor.id, p_session_type_id: type.id, p_from: dateInput.value, p_days: 1 });
  if (result.error) { slotsRoot.innerHTML = '<div class="community-empty">' + esc(authErrorText(result.error)) + '</div>'; return; }
  scheduleSlots = (result.data || []).filter(function (slot) {
    var parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(slot.starts_at));
    var hour = Number(parts.find(function (part) { return part.type === "hour"; }).value);
    return hour >= 8 && hour < 20;
  });
  scheduleSlotsContext = { mentorId: mentor.id, typeId: type.id };
  slotsRoot.innerHTML = scheduleSlots.length ? scheduleSlots.map(function (slot, index) { return '<button class="schedule-slot" type="button" data-session-slot="' + index + '">' + esc(sessionClock(slot.starts_at, slot.timezone)) + '</button>'; }).join("") : '<div class="community-empty">No open times on this day. Pick another date or check back later.</div>';
}
function peerSessionRowMarkup(row) {
  var learner = relationRow(row.learner), mentor = relationRow(row.mentor);
  var isMentor = row.mentor_id === user.id, actions = "", chatControl = "", videoControl = "", now = Date.now();
  if (isMentor && row.status === "pending") actions = '<button class="btn" data-session-action="confirmed" data-session-id="' + esc(row.id) + '">Confirm</button><button class="btn ghost" data-session-action="declined" data-session-id="' + esc(row.id) + '">Decline</button>';
  if (isMentor && row.status === "confirmed") actions = '<button class="btn" data-session-action="completed" data-session-id="' + esc(row.id) + '">Mark completed</button><button class="btn ghost" data-session-action="no_show" data-session-id="' + esc(row.id) + '">Mark no-show</button>';
  var starts = new Date(row.starts_at).getTime(), ends = new Date(row.ends_at).getTime();
  if (row.status === "confirmed" && row.payment_status === "captured" && now >= starts - 5 * 60 * 1000 && now < ends) videoControl = '<button class="btn" data-video-session="' + esc(row.id) + '" data-video-peer="' + esc(isMentor ? row.learner_id : row.mentor_id) + '">Join video</button>';
  if (row.status === "confirmed") {
    if (now >= ends) chatControl = '<button class="btn ghost" data-session-chat="' + esc(row.id) + '">View chat history</button>';
    else if (now >= starts) chatControl = '<button class="btn" data-session-chat="' + esc(row.id) + '">Open session chat</button>';
    else chatControl = '<button class="btn ghost session-chat-locked" type="button" disabled title="The booked chat opens when the session starts">Chat opens ' + esc(sessionTime(row.starts_at, row.timezone)) + '</button>';
  } else if (["completed", "no_show", "cancelled"].includes(row.status) && starts <= now) {
    chatControl = '<button class="btn ghost" data-session-chat="' + esc(row.id) + '">View chat history</button>';
  } else if (row.status === "pending") chatControl = '<span class="session-chat-locked">Chat opens after the mentor confirms</span>';
  if (!isMentor && row.status === "completed" && ends <= now) chatControl += '<button class="btn ghost" data-session-feedback="' + esc(row.id) + '">Rate guidance</button>';
  return '<article class="session-row"><b>30-minute Bearings call · ' + esc(row.status.replace("_", " ")) + '</b><p>' + esc(isMentor ? (learner.display_name || "Learner") : (mentor.display_name || "Mentor")) + ' · ' + esc(sessionTime(row.starts_at, row.timezone)) + '</p>' + (row.learner_note ? '<p>Guidance question: ' + esc(row.learner_note) + '</p>' : '') + ((actions || chatControl || videoControl) ? '<div class="session-actions">' + actions + chatControl + videoControl + '</div>' : '') + '</article>';
}
function askMeridianDeclineReason() {
  var answer = window.prompt("Why can’t you accept this Bearings call? Enter 1, 2, 3, or 4.\n1 — No longer available\n2 — Schedule conflict\n3 — Not a good guidance match\n4 — Other");
  if (answer === null) return null;
  return ({ "1": "unavailable", "2": "schedule_conflict", "3": "not_a_match", "4": "other" })[answer.trim()] || "";
}
var meridianVideoState = null;
async function openMeridianVideo(sessionId, peerId) {
  if (!user) { openSign(); return; }
  var dialog = document.getElementById("meridianVideoDialog"), peersRoot = document.getElementById("meridianVideoPeers");
  if (!dialog || meridianVideoState) return;
  dialog.dataset.sessionId = sessionId; dialog.dataset.peerId = peerId || "";
  dialog.showModal(); peersRoot.innerHTML = '<p class="meridian-video-status">Preparing your private call…</p>';
  try {
    var room = await supabaseClient.functions.invoke("meridian-create-room", { body: { sessionId: sessionId } });
    if (room.error || !room.data || room.data.error) throw new Error(room.data && room.data.error || authErrorText(room.error));
    var token = await supabaseClient.functions.invoke("meridian-video-token", { body: { sessionId: sessionId } });
    if (token.error || !token.data || token.data.error) throw new Error(token.data && token.data.error || authErrorText(token.error));
    var sdk = await import("https://cdn.skypack.dev/@100mslive/hms-video-store@0.15.4");
    var manager = new sdk.HMSReactiveStore(); manager.triggerOnSubscribe();
    var store = manager.getStore(), actions = manager.getHMSActions(), tiles = new Map();
    meridianVideoState = { actions: actions, store: store, tiles: tiles, sdk: sdk };
    peersRoot.innerHTML = "";
    function renderPeers() {
      var peers = store.getState(sdk.selectPeers) || [];
      tiles.forEach(function (tile, peerId) { if (!peers.some(function (peer) { return peer.id === peerId; })) { tile.unsubscribe(); if (tile.trackId) actions.detachVideo(tile.trackId, tile.video); tile.root.remove(); tiles.delete(peerId); } });
      peers.forEach(function (peer) {
        if (tiles.has(peer.id)) return;
        var root = document.createElement("article"), video = document.createElement("video"), name = document.createElement("b");
        root.className = "meridian-video-tile"; video.autoplay = true; video.playsInline = true; video.muted = !!peer.isLocal;
        name.textContent = peer.name || (peer.isLocal ? "You" : "Learner"); root.append(video, name); peersRoot.append(root);
        var tile = { root: root, video: video, trackId: null, unsubscribe: null };
        tile.unsubscribe = store.subscribe(function (track) { var next = track && track.id || null; if (next === tile.trackId) return; if (tile.trackId) actions.detachVideo(tile.trackId, video); if (next) actions.attachVideo(next, video); tile.trackId = next; }, sdk.selectVideoTrackByPeerID(peer.id));
        tiles.set(peer.id, tile);
      });
      if (!peers.length) peersRoot.innerHTML = '<p class="meridian-video-status">Waiting for the other person to join. Your camera and microphone start off.</p>';
    }
    var unsubscribePeers = store.subscribe(renderPeers, sdk.selectPeers);
    meridianVideoState.unsubscribePeers = unsubscribePeers;
    await actions.join({ userName: token.data.userName || user.n || "Meridian member", authToken: token.data.authToken, settings: { isAudioMuted: true, isVideoMuted: true } });
    document.getElementById("meridianVideoTitle").textContent = "Bearings call · " + (user.n || "Meridian");
  } catch (error) {
    peersRoot.innerHTML = '<p class="meridian-video-status">' + esc(error.message || "Could not connect to the call.") + '</p>';
    if (meridianVideoState) { try { await meridianVideoState.actions.leave(); } catch (_) {} meridianVideoState = null; }
  }
}
async function leaveMeridianVideo() {
  if (meridianVideoState) {
    var state = meridianVideoState; meridianVideoState = null;
    try { await state.actions.leave(); } catch (_) {}
    if (state.unsubscribePeers) state.unsubscribePeers();
    state.tiles.forEach(function (tile) { tile.unsubscribe(); if (tile.trackId) state.actions.detachVideo(tile.trackId, tile.video); });
  }
  document.getElementById("meridianVideoPeers").innerHTML = "";
  if (document.getElementById("meridianVideoDialog").open) document.getElementById("meridianVideoDialog").close();
}
document.getElementById("meridianVideoClose").addEventListener("click", leaveMeridianVideo);
document.getElementById("meridianLeaveVideo").addEventListener("click", leaveMeridianVideo);
document.getElementById("meridianReportVideo").addEventListener("click", function () {
  var dialog = document.getElementById("meridianVideoDialog");
  submitMeridianReport({ userId: dialog.dataset.peerId || null, details: "Report submitted during Bearings call " + (dialog.dataset.sessionId || "") });
});
document.getElementById("meridianVideoDialog").addEventListener("cancel", function (event) { event.preventDefault(); leaveMeridianVideo(); });
document.getElementById("meridianMuteAudio").addEventListener("click", async function () { if (!meridianVideoState) return; var enabled = !meridianVideoState.store.getState(meridianVideoState.sdk.selectIsLocalAudioEnabled); await meridianVideoState.actions.setLocalAudioEnabled(enabled); this.textContent = enabled ? "Mute microphone" : "Turn microphone on"; });
document.getElementById("meridianMuteVideo").addEventListener("click", async function () { if (!meridianVideoState) return; var enabled = !meridianVideoState.store.getState(meridianVideoState.sdk.selectIsLocalVideoEnabled); await meridianVideoState.actions.setLocalVideoEnabled(enabled); this.textContent = enabled ? "Turn camera off" : "Turn camera on"; });
async function loadPeerSessionList() {
  var root = document.getElementById("sessionList"); if (!root || !user) return;
  root.innerHTML = '<div class="local-loading">Loading your sessions…</div>';
  var result = await supabaseClient.from("peer_sessions").select("id,connection_id,session_type_id,learner_id,mentor_id,starts_at,ends_at,timezone,status,learner_note,mentor_note,payment_status,learner:profiles!peer_sessions_learner_id_fkey(display_name),mentor:profiles!peer_sessions_mentor_id_fkey(display_name)").order("starts_at", { ascending: true }).limit(100);
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
  root.innerHTML = '<h3>Upcoming</h3>' + (upcoming.length ? upcoming.map(peerSessionRowMarkup).join("") : '<p class="muted">No upcoming sessions.</p>');
}
async function loadPeerSessionHistory() {
  var root = document.getElementById("sessionHistory");
  if (!root) return;
  if (!user) { root.innerHTML = '<div class="community-empty">Sign in to view your session history.</div><a class="btn ghost" href="#me">My page</a>'; return; }
  var result = await supabaseClient.from("peer_sessions").select("id,connection_id,session_type_id,learner_id,mentor_id,starts_at,ends_at,timezone,status,learner_note,mentor_note,payment_status,learner:profiles!peer_sessions_learner_id_fkey(display_name),mentor:profiles!peer_sessions_mentor_id_fkey(display_name)").order("starts_at", { ascending: false }).limit(100);
  if (result.error) { root.innerHTML = '<div class="community-empty">Could not load session history: ' + esc(authErrorText(result.error)) + '</div>'; return; }
  var now = Date.now();
  var historyRows = (result.data || []).filter(function (row) {
    var upcoming = row.status === "confirmed" ? new Date(row.ends_at).getTime() >= now : row.status === "pending" && new Date(row.starts_at).getTime() >= now;
    return !upcoming;
  });
  if (!historyRows.length) { root.innerHTML = '<div class="community-empty">No session history yet.</div>'; return; }
  var recent = historyRows.slice(0, 5), older = historyRows.slice(5);
  root.innerHTML = recent.map(peerSessionRowMarkup).join("") + (older.length ? '<details class="session-history-more"><summary>Show ' + older.length + ' older sessions</summary><div class="session-history-older">' + older.map(peerSessionRowMarkup).join("") + '</div></details>' : '');
}
async function loadPeerSettingsPage() {
  var account = document.getElementById("accountSettingsBody"), mentor = document.getElementById("mentorSettingsPanel"), mentorBody = document.getElementById("mentorSettingsBody");
  if (!account) return;
  account.innerHTML = '<div class="local-loading">Loading your account settings…</div>';
  if (!user) { account.innerHTML = '<p class="muted">Sign in to manage your account settings.</p><button class="btn" type="button" data-settings-signin>Sign in</button>'; if (mentor) mentor.hidden = true; await loadPeerSessionHistory(); return; }
  var safetyNotice = user.safety && meridianAge(user.safety.date_of_birth) < 18 && !user.safety.guardian_consent_verified_at ? '<p class="muted">Parent or guardian confirmation is still needed before bookings unlock. Your date of birth and guardian details are private.</p>' : '';
  account.innerHTML = '<p><b>' + esc(user.n) + '</b><br>' + esc(user.e) + '<br>' + esc(accountTypeLabel(user.role)) + ' · Class ' + esc(String(user.grade || "—")) + '</p><p class="muted">' + esc((user.location && [user.location.school,user.location.city,user.location.state,user.location.country].filter(Boolean).join(" · ")) || "Add your school and location") + '</p>' + safetyNotice + '<div class="row"><button class="btn ghost" type="button" data-settings-edit-profile>Edit account details</button><label class="btn ghost">Profile photo<input type="file" accept="image/jpeg,image/png,image/webp" data-settings-image="avatar" hidden></label><label class="btn ghost">Banner<input type="file" accept="image/jpeg,image/png,image/webp" data-settings-image="banner" hidden></label></div>';
  if (mentor) mentor.hidden = !canMentor(user);
  if (canMentor(user) && mentorBody) {
    mentorBody.innerHTML = '<div class="local-loading">Loading mentor settings…</div>';
    var results = await Promise.all([
      supabaseClient.from("tutor_profiles").select("headline,subjects,is_available").eq("user_id", user.id).maybeSingle(),
      supabaseClient.from("tutor_verification_requests").select("id,status,submitted_at").eq("user_id", user.id).order("submitted_at", { ascending: false }).limit(1),
    ]);
    var profile = results[0].data, status = results[1].data && results[1].data[0] || null;
    var verify = results[1].error ? '<p class="err">' + esc(authErrorText(results[1].error)) + '</p>' : tutorVerificationPanel(status);
    mentorBody.innerHTML = verify + '<section class="settings-subsection"><h3>Mentor profile</h3><p class="muted">' + esc(profile && profile.headline || "Create your mentor profile to help learners find you.") + '</p><p class="muted">Guidance areas: ' + esc(profile && profile.subjects ? profile.subjects.join(", ") : "Not set") + '</p><button class="btn ghost" type="button" data-edit-tutor>' + (profile ? 'Edit mentor profile' : 'Create mentor profile') + '</button><label class="availability"><input type="checkbox" data-available ' + (profile && profile.is_available ? "checked" : "") + ' ' + (!profile || !status || status.status !== "verified" ? "disabled" : "") + '> Show my profile in mentor search</label></section><section class="settings-subsection"><h3>Achievements and credentials</h3><p class="muted">Reviewed highlights shown on your public mentor profile.</p><button class="btn ghost" type="button" data-manage-achievements>Manage achievements</button></section>';
  }
  await loadPeerSessionHistory();
}
async function loadPeerSessionsPage() {
  var note = document.getElementById("sessionPageNote");
  if (note) note.textContent = !user ? "Sign in to view your booked sessions." : "Your upcoming bookings and session chats appear here.";
  if (!user) {
    var root = document.getElementById("sessionList");
    if (root) root.innerHTML = '<div class="community-empty">Sign in to see your session requests and chats.</div><button type="button" class="btn" data-schedule-signin>Sign in</button>';
    return;
  }
  await loadPeerSessionList();
}
document.getElementById("refreshSessions").addEventListener("click", loadPeerSessionsPage);
document.getElementById("sessionHistory").addEventListener("click", async function(event){
  var button=event.target.closest("[data-session-feedback]"); if(!button)return;
  var stars=window.prompt("Rate the guidance from 1 to 5 stars:"); if(stars===null)return;
  if(!/^[1-5]$/.test(stars.trim())){window.alert("Enter a rating from 1 to 5.");return;}
  var outcome=window.prompt("Was the guidance helpful? Enter 1 for yes, 2 for somewhat, or 3 for no."); if(outcome===null)return;
  var resultValue=({"1":"helpful","2":"somewhat","3":"not_helpful"})[outcome.trim()]; if(!resultValue){window.alert("Choose 1, 2, or 3.");return;}
  var nextStep=window.prompt("What will you try next? (5–500 characters)"); if(nextStep===null)return;
  button.disabled=true;
  var feedback=await supabaseClient.rpc("meridian_submit_session_feedback",{p_session_id:button.dataset.sessionFeedback,p_stars:Number(stars),p_result:resultValue,p_next_step:nextStep.trim()});
  if(feedback.error){window.alert(/duplicate key/i.test(feedback.error.message)?"You already rated this Bearings call.":authErrorText(feedback.error));button.disabled=false;return;}
  button.textContent="Feedback sent";
});
document.getElementById("sessionList").addEventListener("click", async function(event){
  if (event.target.closest("[data-schedule-signin]")) { openSign(); return; }
  var videoButton=event.target.closest("[data-video-session]"); if(videoButton){videoButton.disabled=true;await openMeridianVideo(videoButton.dataset.videoSession,videoButton.dataset.videoPeer);videoButton.disabled=false;return;}
  var chatButton=event.target.closest("[data-session-chat]"); if(chatButton){openSessionChat(chatButton.dataset.sessionChat);return;}
  var feedbackButton=event.target.closest("[data-session-feedback]");
  if(feedbackButton){
    var stars=window.prompt("Rate the guidance from 1 to 5 stars:"); if(stars===null)return;
    if(!/^[1-5]$/.test(stars.trim())){window.alert("Enter a rating from 1 to 5.");return;}
    var outcome=window.prompt("Was the guidance helpful? Enter 1 for yes, 2 for somewhat, or 3 for no."); if(outcome===null)return;
    var resultValue=({"1":"helpful","2":"somewhat","3":"not_helpful"})[outcome.trim()]; if(!resultValue){window.alert("Choose 1, 2, or 3.");return;}
    var nextStep=window.prompt("What will you try next? (5–500 characters)"); if(nextStep===null)return;
    feedbackButton.disabled=true;
    var feedback=await supabaseClient.rpc("meridian_submit_session_feedback",{p_session_id:feedbackButton.dataset.sessionFeedback,p_stars:Number(stars),p_result:resultValue,p_next_step:nextStep.trim()});
    if(feedback.error){window.alert(/duplicate key/i.test(feedback.error.message)?"You already rated this Bearings call.":authErrorText(feedback.error));feedbackButton.disabled=false;return;}
    feedbackButton.textContent="Feedback sent";
    return;
  }
  var button=event.target.closest("[data-session-action]"); if(!button)return;
  var action=button.dataset.sessionAction, declineReason=null;
  if(action === "declined") { declineReason=askMeridianDeclineReason(); if(declineReason===null)return; if(!declineReason){window.alert("Choose 1, 2, 3, or 4.");return;} }
  button.disabled=true;
  var result=await supabaseClient.functions.invoke("meridian-session-action",{body:{sessionId:button.dataset.sessionId,action:action,declineReason:declineReason}});
  if(result.error || result.data && result.data.error)window.alert(authErrorText(result.error || {message:result.data.error})); await loadPeerSessionList();
});
document.getElementById("settings").addEventListener("click", function (event) {
  var chatButton = event.target.closest("[data-session-chat]");
  if (chatButton) openSessionChat(chatButton.dataset.sessionChat);
  if (event.target.closest("[data-settings-signin]")) { openSign(); return; }
  if (event.target.closest("[data-settings-edit-profile]")) { openOnboarding(false); return; }
  if (event.target.closest("[data-edit-tutor]")) { openTutor(); return; }
  if (event.target.closest("[data-manage-achievements]")) { openMentorAchievementManager(); return; }
  if (event.target.closest("[data-start-verification]")) { openTutorVerificationForm(); return; }
});
document.getElementById("settings").addEventListener("change", async function (event) {
  var imageInput = event.target.closest("[data-settings-image]");
  if (imageInput && imageInput.files && imageInput.files[0]) { await uploadProfileImage(imageInput.files[0], imageInput.dataset.settingsImage); imageInput.value = ""; return; }
});
document.querySelectorAll("[data-workspace-switch]").forEach(function (button) { button.addEventListener("click", switchWorkspace); });
document.getElementById("closeBooking").addEventListener("click", function () { document.getElementById("bookingDialog").close(); });
document.getElementById("bookingDialog").addEventListener("click", function (event) { if (event.target === this) this.close(); });

function sessionChatCanSend(session) {
  var now = Date.now();
  return !!(user && session && session.status === "confirmed" && (session.learner_id === user.id || session.mentor_id === user.id) && now >= new Date(session.starts_at).getTime() && now < new Date(session.ends_at).getTime());
}
function sessionCountdown(milliseconds) {
  var total = Math.max(0, Math.floor(milliseconds / 1000));
  var days = Math.floor(total / 86400), hours = Math.floor((total % 86400) / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  if (days) return days + "d " + hours + "h " + minutes + "m";
  return (hours ? String(hours).padStart(2, "0") + ":" : "") + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}
function updateSessionChatComposer() {
  var state = document.getElementById("sessionChatState"), text = document.getElementById("sessionChatText"), file = document.getElementById("sessionChatFile"), send = document.getElementById("sessionChatSend"), participant = document.getElementById("sessionChatParticipant"), timer = document.getElementById("sessionChatTimeRemaining"), cancel = document.getElementById("sessionChatCancel");
  if (!state || !activeChatSession) return;
  var now = Date.now(), start = new Date(activeChatSession.starts_at).getTime(), end = new Date(activeChatSession.ends_at).getTime(), writable = sessionChatCanSend(activeChatSession);
  var isMentor = activeChatSession.mentor_id === user.id, peer = relationRow(isMentor ? activeChatSession.learner : activeChatSession.mentor);
  var peerGrade = isMentor && peer.grade ? "Class " + String(peer.grade).replace(/^Class\s*/i, "") : "";
  if (participant) participant.innerHTML = '<span class="community-kicker">' + (isMentor ? "LEARNER" : "MENTOR") + '</span><b>' + esc(peer.display_name || (isMentor ? "Learner" : "Mentor")) + '</b>' + (peerGrade ? '<span>' + esc(peerGrade) + '</span>' : '');
  if (timer) {
    if (["cancelled", "declined"].includes(activeChatSession.status)) timer.textContent = "Session cancelled";
    else if (["completed", "no_show"].includes(activeChatSession.status) || now >= end) timer.textContent = "Session ended";
    else if (activeChatSession.status === "pending") timer.textContent = "Awaiting mentor confirmation";
    else if (now < start) timer.textContent = "Starts in " + sessionCountdown(start - now);
    else timer.textContent = "Time remaining " + sessionCountdown(end - now);
  }
  if (["cancelled", "declined"].includes(activeChatSession.status)) state.textContent = "This session was cancelled. The chat is read-only.";
  else if (activeChatSession.status === "completed" || activeChatSession.status === "no_show") state.textContent = "This session has ended. You can read its history, but can’t send more messages.";
  else state.textContent = writable ? "Your booked chat is open. Keep it focused on learning; don’t share private contact or home details." : (now < start && activeChatSession.status === "confirmed" ? "This chat opens at " + sessionTime(activeChatSession.starts_at, activeChatSession.timezone) + "." : (activeChatSession.status === "pending" ? "Chat unlocks after the mentor confirms the booking." : (activeChatSession.status === "confirmed" && now < end ? "This chat is temporarily unavailable." : "This session has ended. You can read its history, but can’t send more messages.")));
  if (text) text.disabled = !writable || sessionChatBusy;
  if (file) file.disabled = !writable || sessionChatBusy;
  if (send) send.disabled = !writable || sessionChatBusy;
  if (cancel) { cancel.hidden = !["pending", "confirmed"].includes(activeChatSession.status) || now >= start; cancel.disabled = sessionChatBusy; }
  var close = document.getElementById("sessionChatClose"); if (close) close.disabled = sessionChatBusy;
}
function sessionChatTime(value) {
  return new Intl.DateTimeFormat(undefined, { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
async function refreshSessionChatState() {
  if (!activeChatSession || !user || !supabaseClient) return;
  var current = activeChatSession, result = await supabaseClient.from("peer_sessions").select("status,starts_at,ends_at,timezone").eq("id", current.id).maybeSingle();
  if (result.error || !result.data || !activeChatSession || activeChatSession.id !== current.id) return;
  Object.assign(activeChatSession, result.data);
  updateSessionChatComposer();
}
async function openSessionChat(sessionId) {
  if (!user || !supabaseClient) return;
  var result = await supabaseClient.from("peer_sessions").select("id,learner_id,mentor_id,starts_at,ends_at,timezone,status,learner:profiles!peer_sessions_learner_id_fkey(display_name,grade),mentor:profiles!peer_sessions_mentor_id_fkey(display_name,grade)").eq("id", sessionId).maybeSingle();
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
  if (sessionChatClock) clearInterval(sessionChatClock);
  sessionChatPoll = setInterval(function () { loadSessionChatMessages(); refreshSessionChatState(); }, 3000);
  sessionChatClock = setInterval(updateSessionChatComposer, 1000);
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
  if (sessionChatClock) clearInterval(sessionChatClock);
  sessionChatPoll = null; sessionChatClock = null; activeChatSession = null; sessionChatSignature = "";
});
document.getElementById("sessionChatDialog").addEventListener("cancel", function (event) { if (sessionChatBusy) event.preventDefault(); });
document.getElementById("sessionChatClose").addEventListener("click", function () { document.getElementById("sessionChatDialog").close(); });
document.getElementById("sessionChatCancel").addEventListener("click", async function () {
  if (!activeChatSession || !user || sessionChatBusy || !["pending", "confirmed"].includes(activeChatSession.status)) return;
  if (!window.confirm("Cancel this booked session? The chat will become read-only for both people.")) return;
  var button = this, sessionId = activeChatSession.id;
  sessionChatBusy = true;
  updateSessionChatComposer();
  var result = await supabaseClient.functions.invoke("meridian-session-action", { body: { sessionId: sessionId, action: "cancelled" } });
  if (result.error || result.data && result.data.error) { document.getElementById("sessionChatStatus").textContent = authErrorText(result.error || {message:result.data.error}); sessionChatBusy = false; updateSessionChatComposer(); return; }
  activeChatSession.status = "cancelled";
  document.getElementById("sessionChatStatus").textContent = "Session cancelled. The chat is now read-only.";
  sessionChatBusy = false;
  updateSessionChatComposer();
  await loadPeerSessionList();
});
document.getElementById("sessionChatForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!activeChatSession || !sessionChatCanSend(activeChatSession) || sessionChatBusy) return;
  var sendingSession = activeChatSession, text = document.getElementById("sessionChatText"), picker = document.getElementById("sessionChatFile"), status = document.getElementById("sessionChatStatus"), body = text.value.trim(), file = picker.files && picker.files[0];
  if (!body && !file) { status.textContent = "Write a message or choose a file first."; return; }
  if (body.length > 2000) { status.textContent = "Messages can be up to 2,000 characters."; return; }
  if (meridianContactWarning(body)) { status.textContent = "For safety, remove phone numbers, emails, links, and social handles from chat."; text.focus(); return; }
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
  return '<div class="schedule-manage"><div class="social-feed-title"><div><span class="community-kicker">MENTOR TOOLS</span><h2>Unavailable times</h2></div></div><p class="muted">Meridian sets 30-minute Bearings call slots every day from 8:00 AM to 8:00 PM IST. Block any time you cannot meet.</p><form class="schedule-form" data-schedule-form="block"><label>Block from (IST)<input name="starts_at" type="datetime-local" required></label><label>Until (IST)<input name="ends_at" type="datetime-local" required></label><button class="btn" type="submit">Block time</button></form><div id="blockedTimeList" class="schedule-manage-list"></div><div id="scheduleManageMessage" class="social-message" role="status"></div></div>';
}
async function loadMentorScheduleControls() {
  var root=document.getElementById("blockedTimeList"); if(!root||!user)return;
  root.innerHTML='<div class="local-loading">Loading blocked times…</div>';
  var result=await supabaseClient.from("peer_blocked_times").select("id,starts_at,ends_at,timezone").eq("mentor_id",user.id).gte("ends_at",new Date().toISOString()).order("starts_at").limit(20);
  root.innerHTML=result.error?'<span>'+esc(authErrorText(result.error))+'</span>':(result.data||[]).map(function(row){return '<div>Unavailable · '+esc(sessionTime(row.starts_at,row.timezone))+' to '+esc(sessionTime(row.ends_at,row.timezone))+' <button class="act" data-schedule-delete="block" data-id="'+esc(row.id)+'">Remove</button></div>';}).join("")||"No blocked times.";
}
document.getElementById("dashboard").addEventListener("submit",async function(event){
  var form=event.target.closest("[data-schedule-form]"); if(!form)return; event.preventDefault(); if(!user)return;
  var data=new FormData(form), row={mentor_id:user.id,starts_at:zonedInputToIso(data.get("starts_at"),"Asia/Kolkata"),ends_at:zonedInputToIso(data.get("ends_at"),"Asia/Kolkata"),timezone:"Asia/Kolkata",label:"Unavailable"};
  if(!row.starts_at||!row.ends_at||row.starts_at>=row.ends_at){document.getElementById("scheduleManageMessage").textContent="Choose an end time after the start time.";return;}
  var result=await supabaseClient.from("peer_blocked_times").insert(row);var msg=document.getElementById("scheduleManageMessage");msg.textContent=result.error?authErrorText(result.error):"Those times are now blocked.";if(!result.error){form.reset();await loadMentorScheduleControls();}
});
document.getElementById("dashboard").addEventListener("click",async function(event){var button=event.target.closest("[data-schedule-delete]");if(!button)return;var result=await supabaseClient.from("peer_blocked_times").delete().eq("id",button.dataset.id).eq("mentor_id",user.id);if(result.error)window.alert(authErrorText(result.error));await loadMentorScheduleControls();});
function tutorVerificationPanel(status) {
  if (Number(user && user.grade) < 9 || Number(user && user.grade) > 12) return '<section class="box verify-status"><b>Finish your class details</b><p class="muted">Set your class before submitting mentor verification.</p></section>';
  if (status && status.status === "verified") {
    var noticeKey = "meridianVerifiedNoticeSeen:" + user.id;
    try {
      if (window.localStorage.getItem(noticeKey) === "1" || window.localStorage.getItem("peerConnectVerifiedNoticeSeen:" + user.id) === "1") {
        window.localStorage.setItem(noticeKey, "1");
        window.localStorage.removeItem("peerConnectVerifiedNoticeSeen:" + user.id);
        return "";
      }
      window.localStorage.setItem(noticeKey, "1");
    } catch (_localNoticeError) {
      try {
        if (window.sessionStorage.getItem(noticeKey) === "1" || window.sessionStorage.getItem("peerConnectVerifiedNoticeSeen:" + user.id) === "1") return "";
        window.sessionStorage.setItem(noticeKey, "1");
      } catch (_sessionNoticeError) {}
    }
    return '<section class="box verify-status"><b><span class="verify-badge">Verified</span> Your mentor profile is approved</b><p class="muted">Your profile can appear in mentor search while availability is on.</p></section>';
  }
  if (status && status.status === "pending") return '<section class="box verify-status"><b>Verification pending</b><p class="muted">Your school ID and fee receipt are private. A reviewer will check them before your mentor profile becomes visible.</p></section>';
  if (status && status.status === "rejected") return '<section class="box verify-status"><b>Verification needs another review</b><p class="muted">Resubmit both documents if a reviewer declined them, or if your verified name, class, or school changed. Editing your bio or guidance areas does not restart verification.</p><button class="btn" data-start-verification>Submit documents again</button></section>';
  return '<section class="box verify-status"><b>Verify your mentor profile</b><p class="muted">Mentors from every class submit a school ID and fee receipt. A trusted reviewer checks your identity, class, and school before approving your profile. Files stay private and are removed after review.</p><button class="btn" data-start-verification>Submit for review</button></section>';
}
async function loadMeridianFinancialLedger(target, adminView) {
  if (!target || !user) return;
  var result = await supabaseClient.rpc("meridian_financial_ledger", { p_mentor_id: adminView ? null : user.id });
  if (result.error) { target.innerHTML = '<p class="muted">Settlement ledger needs the latest Meridian database migration.</p>'; return; }
  var rows = result.data || [];
  if (!rows.length) { target.innerHTML = '<p class="muted">No paid bookings are in the ledger yet.</p>'; return; }
  var totals = rows.reduce(function (sum, row) { sum.gross += Number(row.gross_inr || 0); sum.fee += Number(row.platform_fee_inr || 0); sum.mentor += Number(row.mentor_amount_inr || 0); return sum; }, { gross: 0, fee: 0, mentor: 0 });
  var statusNames = { awaiting_capture: "Awaiting payment", captured: "Payment captured · call not completed", waiting_for_completion: "Awaiting call completion", payout_pending: "Ready for manual settlement", paid: "Marked paid", refund_pending: "Refund in progress", refunded: "Refunded", payout_setup_required: "Payout setup needed" };
  target.innerHTML = '<div class="dash-stats"><div class="dash-stat"><b>₹' + totals.gross.toFixed(2) + '</b><span>Session revenue</span></div><div class="dash-stat"><b>₹' + totals.fee.toFixed(2) + '</b><span>Meridian fee</span></div><div class="dash-stat"><b>₹' + totals.mentor.toFixed(2) + '</b><span>Mentor share</span></div></div><div class="session-history-list">' + rows.slice(0, 20).map(function (row) {
    return '<article class="session-row"><b>' + (adminView ? esc(row.mentor_name || "Meridian Mentor") + ' · ' : '') + '₹' + Number(row.gross_inr).toFixed(2) + ' session</b><p>' + esc(sessionTime(row.starts_at, "Asia/Kolkata")) + ' · Meridian ₹' + Number(row.platform_fee_inr).toFixed(2) + ' · Mentor ₹' + Number(row.mentor_amount_inr).toFixed(2) + '</p><span class="muted">' + esc(statusNames[row.payout_status] || row.payout_status) + '</span></article>';
  }).join("") + '</div><p class="muted">Earnings are recorded for manual settlement. Meridian does not send automatic mentor payouts.</p>';
}
async function drawTutorDashboard() {
  var body = document.getElementById("tutorDashboardBody");
  if (!body) return;
  if (!canMentor(user)) {
    body.innerHTML = '<div class="box">Choose Mentor or Both to open the mentor dashboard.</div>';
    return;
  }
  body.innerHTML = '<div class="box local-loading">Loading your mentor dashboard…</div>';
  var results = await Promise.all([
    supabaseClient.from("tutor_profiles").select("headline, subjects, is_available").eq("user_id", user.id).maybeSingle(),
    supabaseClient.from("peer_sessions").select("id,learner_id,starts_at,ends_at,timezone,status,learner:profiles!peer_sessions_learner_id_fkey(display_name)").eq("mentor_id", user.id).order("starts_at", { ascending: true }).limit(100),
    supabaseClient.from("tutor_verification_requests").select("status").eq("user_id", user.id).order("submitted_at", { ascending: false }).limit(1),
  ]);
  if (results[0].error || results[1].error || results[2].error) {
    body.innerHTML = '<div class="box err">' + esc(authErrorText(results[0].error || results[1].error || results[2].error)) + '</div>';
    return;
  }
  var profile = results[0].data, sessions = results[1].data || [], verification = (results[2].data || [])[0];
  var now = Date.now();
  var pendingSessions = sessions.filter(function (s) { return s.status === "pending"; });
  var upcomingSessions = sessions.filter(function (s) { return s.status === "confirmed" && new Date(s.ends_at).getTime() >= now; });
  var bookingRows = pendingSessions.length ? pendingSessions.map(function (s) {
    var learner = relationRow(s.learner);
    return '<article class="request-row"><div><b>' + esc(learner.display_name || "Learner") + '</b><p class="muted">30-minute session · ' + esc(sessionTime(s.starts_at, s.timezone)) + '</p></div><div class="row"><button class="btn" data-session-action="confirmed" data-session-id="' + esc(s.id) + '">Accept</button><button class="btn ghost" data-session-action="declined" data-session-id="' + esc(s.id) + '">Decline</button></div></article>';
  }).join("") : '<p class="muted">No booking requests to review.</p>';
  var unavailablePanel = verification && verification.status === "verified"
    ? '<section class="box dashboard-unavailable">' + scheduleManagerMarkup() + '</section>'
    : '<section class="box dashboard-unavailable"><h2>Unavailable times</h2><p class="muted">Blocking booking times will be available after your mentor profile is verified.</p><a class="btn ghost" href="#settings">Mentor settings</a></section>';
  body.innerHTML = '<div class="dash-stats"><div class="dash-stat"><b>' + pendingSessions.length + '</b><span>Bookings to review</span></div><div class="dash-stat"><b>' + upcomingSessions.length + '</b><span>Upcoming sessions</span></div><div class="dash-stat"><b>' + (profile && profile.is_available ? "Available" : "Paused") + '</b><span>Profile visibility</span></div></div>' +
    unavailablePanel + '<section class="box request-box"><div class="dash-heading"><div><b>Booking requests</b><p class="muted">Accept or decline requests for a scheduled learning session.</p></div></div>' + bookingRows + '</section><section class="box request-box"><h2>Earnings ledger</h2><div id="mentorEarningsLedger"><div class="local-loading">Loading earnings…</div></div></section>';
  await loadMeridianFinancialLedger(document.getElementById("mentorEarningsLedger"), false);
  if (verification && verification.status === "verified") await loadMentorScheduleControls();
}
document.getElementById("tutorDashboardBody").addEventListener("click", async function (e) {
  var sessionAction = e.target.closest("[data-session-action]");
  if (sessionAction) {
    var action = sessionAction.dataset.sessionAction, declineReason = null;
    if (action === "declined") { declineReason = askMeridianDeclineReason(); if (declineReason === null) return; if (!declineReason) { window.alert("Choose 1, 2, 3, or 4."); return; } }
    sessionAction.disabled = true;
    var result = await supabaseClient.functions.invoke("meridian-session-action", { body: { sessionId: sessionAction.dataset.sessionId, action: action, declineReason: declineReason } });
    if (result.error || result.data && result.data.error) window.alert(authErrorText(result.error || {message:result.data.error}));
    await drawTutorDashboard();
  }
});
document.getElementById("settings").addEventListener("change", async function (e) {
  if (!e.target.matches("[data-available]")) return;
  var result = await supabaseClient.from("tutor_profiles").update({ is_available: e.target.checked }).eq("user_id", user.id);
  if (result.error) window.alert(authErrorText(result.error));
  await loadTutorDirectory();
  await loadPeerSettingsPage();
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
    if (curRoute === "settings") await loadPeerSettingsPage();
    else await drawTutorDashboard();
  };
}

async function drawVerificationAdmin() {
  var body = document.getElementById("verificationAdminBody");
  if (!body) return;
  if (!user || !isVerificationAdmin) { body.innerHTML = '<div class="box">This area is for trusted reviewers only.</div>'; return; }
  body.innerHTML = '<div class="box local-loading">Loading review queue…</div>';
  var result = await supabaseClient.from("tutor_verification_requests").select("id, user_id, submitted_at").eq("status", "pending").order("submitted_at", { ascending: true });
  if (result.error) body.innerHTML = '<section class="safety-review-section" id="safety-mentor-verification"><h2>Mentor applications</h2><div class="box err">' + esc(authErrorText(result.error)) + '</div></section>';
  else if (!result.data || !result.data.length) body.innerHTML = '<section class="safety-review-section" id="safety-mentor-verification"><h2>Mentor applications</h2><div class="box">No mentor verification requests waiting.</div></section>';
  else {
  var ids = result.data.map(function (r) { return r.user_id; }), reqIds = result.data.map(function (r) { return r.id; });
  var extra = await Promise.all([
    supabaseClient.from("profiles").select("id, display_name, grade").in("id", ids),
    supabaseClient.from("profile_locations").select("user_id, school, city, state, country").in("user_id", ids),
    supabaseClient.from("tutor_verification_documents").select("request_id, document_type, storage_path").in("request_id", reqIds),
    supabaseClient.from("tutor_profiles").select("user_id, headline, subjects").in("user_id", ids),
  ]);
  if (extra.some(function (item) { return item.error; })) body.innerHTML = '<section class="safety-review-section" id="safety-mentor-verification"><h2>Mentor applications</h2><div class="box err">' + esc(authErrorText(extra.filter(function (item) { return item.error; })[0].error)) + '</div></section>';
  else {
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
    cards.push('<article class="box"><h3>' + esc(p.display_name || "Learner") + ' · Class ' + esc(String(p.grade || "—")) + '</h3><p class="muted">' + esc([l.school,l.city,l.state,l.country].filter(Boolean).join(" · ") || "Location not set") + '<br>Guidance areas: ' + esc((tp.subjects || []).join(", ") || "Not set") + '<br>Guidance note: ' + esc(tp.headline || "Not set") + '<br>Submitted ' + esc(new Date(row.submitted_at).toLocaleString()) + '</p>' + (links.join("") || '<p class="err">No documents attached.</p>') + '<label>Reviewer note (optional)<input data-review-note="' + esc(row.id) + '" maxlength="500" placeholder="Private note; not shown on the mentor profile"></label><div class="row"><button class="btn" data-review="verified" data-review-id="' + esc(row.id) + '" data-user-id="' + esc(row.user_id) + '" ' + (!(hasId && hasReceipt && Number(p.grade) >= 9 && Number(p.grade) <= 12 && allDocsAvailable) ? 'disabled title="Both documents must be available and class must be 9–12"' : '') + '>Approve and verify</button><button class="btn ghost" data-review="rejected" data-review-id="' + esc(row.id) + '" data-user-id="' + esc(row.user_id) + '">Reject</button></div></article>');
  }
  body.innerHTML = '<section class="safety-review-section" id="safety-mentor-verification"><h2>Mentor applications</h2>' + cards.join("") + '</section>';
  }
  }
  await drawGuardianConsentQueue(body);
  await drawAchievementReviewQueue(body);
  await drawMeridianReportQueue(body);
}
async function drawMeridianFinancialQueue(body) {
  body.querySelectorAll(".meridian-financial-queue").forEach(function (section) { section.remove(); });
  var section = document.createElement("section"); section.className = "box meridian-financial-queue";
  section.innerHTML = '<h2>Session settlement ledger</h2><p class="muted">Review session price, Meridian fee, Mentor share, and payment/refund state. Settlements are manual; no transfer is sent from this page.</p><div data-ledger-content><div class="local-loading">Loading settlement ledger…</div></div>';
  body.appendChild(section);
  await loadMeridianFinancialLedger(section.querySelector("[data-ledger-content]"), true);
}
async function drawGuardianConsentQueue(body) {
  body.querySelectorAll(".guardian-consent-queue").forEach(function (section) { section.remove(); });
  var section = document.createElement("section"); section.className = "guardian-consent-queue safety-review-section"; section.id = "safety-guardians";
  section.innerHTML = '<h2>Guardian consent checks</h2><p class="muted">Confirm consent privately with the parent or guardian before unlocking bookings for a learner under 18. Do not approve from their self-reported form alone.</p>';
  var result = await supabaseClient.from("meridian_account_safety").select("user_id,date_of_birth,guardian_name,guardian_contact,guardian_contact_type,guardian_consent_verified_at").is("guardian_consent_verified_at", null).not("guardian_contact", "is", null).order("created_at", { ascending: true }).limit(100);
  if (result.error) section.insertAdjacentHTML("beforeend", '<div class="box">Guardian checks could not load: ' + esc(authErrorText(result.error)) + '</div>');
  else {
    var candidates = (result.data || []).filter(function (row) { var age = meridianAge(row.date_of_birth); return age !== null && age >= 14 && age < 18; });
    if (!candidates.length) section.insertAdjacentHTML("beforeend", '<div class="box">No guardian consent checks waiting.</div>');
    else {
      var ids = candidates.map(function (row) { return row.user_id; }), names = {};
      var profiles = await supabaseClient.from("profiles").select("id,display_name,grade").in("id", ids);
      (profiles.data || []).forEach(function (profile) { names[profile.id] = profile; });
      candidates.forEach(function (row) { var profile = names[row.user_id] || {}; section.insertAdjacentHTML("beforeend", '<article class="box"><b>' + esc(profile.display_name || "Learner") + ' · Class ' + esc(String(profile.grade || "—")) + '</b><p class="muted">Guardian: ' + esc(row.guardian_name || "Not provided") + ' · ' + esc(row.guardian_contact || "Not provided") + '</p><button type="button" class="btn" data-guardian-consent="' + esc(row.user_id) + '">Mark verified after confirming with guardian</button></article>'); });
    }
  }
  body.appendChild(section);
}
async function drawMeridianReportQueue(body) {
  body.querySelectorAll(".meridian-report-queue").forEach(function (section) { section.remove(); });
  var result = await supabaseClient.from("reports").select("id,reporter_id,reported_user_id,post_id,doubt_id,reason,details,status,severity,is_auto_flagged,created_at").eq("status", "new").order("created_at", { ascending: true }).limit(100);
  var section = document.createElement("section"); section.className = "meridian-report-queue safety-review-section"; section.id = "safety-reports";
  section.innerHTML = '<h2>Community safety reports</h2><p class="muted">Review reports and apply a proportionate action. Suspensions expire after 24 hours by default.</p>';
  if (result.error) section.insertAdjacentHTML("beforeend", '<div class="box">Reports could not load: ' + esc(authErrorText(result.error)) + '</div>');
  else if (!result.data || !result.data.length) section.insertAdjacentHTML("beforeend", '<div class="box">No new reports.</div>');
  else {
    var ids = Array.from(new Set(result.data.map(function (row) { return row.reported_user_id; }).filter(Boolean))), names = {};
    if (ids.length) { var profiles = await supabaseClient.from("profiles").select("id,display_name").in("id", ids); (profiles.data || []).forEach(function (profile) { names[profile.id] = profile.display_name; }); }
    result.data.forEach(function (row) {
      var target = row.reported_user_id ? (names[row.reported_user_id] || "Meridian account") : "Content report";
      section.insertAdjacentHTML("beforeend", '<article class="box"><b>' + esc(row.reason.replace(/_/g," ")) + (row.is_auto_flagged ? ' · Safety filter' : '') + '</b><p>' + esc(target) + ' · ' + esc(new Date(row.created_at).toLocaleString()) + '</p>' + (row.details ? '<p class="muted">' + esc(row.details) + '</p>' : '') + '<div class="row"><button class="btn ghost" data-meridian-review="warn" data-report-id="' + esc(row.id) + '">Warn</button><button class="btn ghost" data-meridian-review="suspend" data-report-id="' + esc(row.id) + '">Suspend 24h</button><button class="btn ghost" data-meridian-review="ban" data-report-id="' + esc(row.id) + '">Ban</button><button class="btn" data-meridian-review="resolve" data-report-id="' + esc(row.id) + '">Resolve</button></div></article>');
    });
  }
  body.appendChild(section);
}
async function drawAchievementReviewQueue(body) {
  body.querySelectorAll(".achievement-review-queue").forEach(function (oldSection) { oldSection.remove(); });
  var result = await supabaseClient.from("mentor_achievements")
    .select("id,user_id,category,title,issuer,achievement_year,public_summary,evidence_path,public_evidence_path,created_at")
    .eq("status", "pending").order("created_at", { ascending: true });
  var section = document.createElement("section"); section.className = "achievement-review-queue safety-review-section"; section.id = "safety-achievements";
  if (result.error) { section.innerHTML = '<h2>Achievement review</h2><p class="muted">Run the latest Meridian database migration to enable this review queue.</p>'; body.appendChild(section); return; }
  section.innerHTML = '<h2>Achievement review</h2><p class="muted">Review the private evidence. Only approve an optional public file if it has no sensitive details.</p>';
  if (!result.data || !result.data.length) { section.insertAdjacentHTML("beforeend", '<div class="box">No achievement submissions waiting.</div>'); body.appendChild(section); return; }
  var ids = result.data.map(function (row) { return row.user_id; });
  var profileResult = await supabaseClient.from("profiles").select("id,display_name,grade").in("id", ids), profiles = {};
  (profileResult.data || []).forEach(function (profile) { profiles[profile.id] = profile; });
  for (var i = 0; i < result.data.length; i++) {
    var item = result.data[i], profile = profiles[item.user_id] || {}, privateLink = await supabaseClient.storage.from("mentor-achievements").createSignedUrl(item.evidence_path, 300), publicLink = item.public_evidence_path ? await supabaseClient.storage.from("mentor-achievements").createSignedUrl(item.public_evidence_path, 300) : null;
    var links = '<div class="admin-doc"><span>Private supporting proof</span>' + (privateLink.error ? '<span class="muted">Preview unavailable</span>' : '<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(privateLink.data.signedUrl) + '">Review private proof</a>') + '</div>';
    if (item.public_evidence_path) links += '<div class="admin-doc"><span>Proposed public copy — check redaction</span>' + (!publicLink || publicLink.error ? '<span class="muted">Preview unavailable</span>' : '<a class="btn ghost" target="_blank" rel="noopener" href="' + esc(publicLink.data.signedUrl) + '">Review proposed copy</a>') + '</div>';
    section.insertAdjacentHTML("beforeend", '<article class="box achievement-review-card"><h3>' + esc(profile.display_name || "Mentor") + ' · Class ' + esc(String(profile.grade || "—")) + '</h3><p><b>' + esc(item.title) + '</b><br>' + esc([item.category, item.issuer, item.achievement_year].filter(Boolean).join(" · ")) + '</p><p class="muted">' + esc(item.public_summary) + '</p>' + links + '<div class="row"><button type="button" class="btn" data-achievement-review="approved" data-achievement-id="' + esc(item.id) + '">Approve for profile</button><button type="button" class="btn ghost" data-achievement-review="rejected" data-achievement-id="' + esc(item.id) + '">Decline</button></div></article>');
  }
  body.appendChild(section);
}
var safetyReviewJumps = document.querySelector(".safety-review-jumps");
if (safetyReviewJumps) safetyReviewJumps.addEventListener("click", function (event) {
  var jump = event.target.closest("[data-review-jump]");
  var target = jump && document.getElementById(jump.dataset.reviewJump);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});
document.getElementById("verificationAdminBody").addEventListener("click", async function (event) {
  var guardianButton = event.target.closest("[data-guardian-consent]");
  if (guardianButton) {
    if (!isVerificationAdmin) return;
    var consentDialog = document.getElementById("guardianConsentConfirmDialog");
    if (!consentDialog) return;
    consentDialog.returnValue = "";
    var guardianConfirmed = await new Promise(function (resolve) {
      consentDialog.addEventListener("close", function () { resolve(consentDialog.returnValue === "confirmed"); }, { once: true });
      consentDialog.showModal();
    });
    if (!guardianConfirmed) return;
    guardianButton.disabled = true;
    var consent = await supabaseClient.from("meridian_account_safety").update({ guardian_consent_verified_at: new Date().toISOString() }).eq("user_id", guardianButton.dataset.guardianConsent).is("guardian_consent_verified_at", null);
    if (consent.error) { window.alert(authErrorText(consent.error)); guardianButton.disabled = false; return; }
    await drawVerificationAdmin(); return;
  }
  var moderationButton = event.target.closest("[data-meridian-review]");
  if (moderationButton) {
    if (!isVerificationAdmin) return;
    var note = window.prompt("Optional private reviewer note:", "");
    if (note === null) return;
    moderationButton.disabled = true;
    var action = moderationButton.dataset.meridianReview;
    var moderation = await supabaseClient.rpc("meridian_review_report", { p_report_id: moderationButton.dataset.reportId, p_action: action, p_note: note, p_suspend_until: action === "suspend" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null });
    if (moderation.error) { window.alert(authErrorText(moderation.error)); moderationButton.disabled = false; return; }
    await drawVerificationAdmin();
    return;
  }
  var achievementButton = event.target.closest("[data-achievement-review]");
  if (achievementButton) {
    if (!isVerificationAdmin) return;
    achievementButton.disabled = true;
    var achievementId = achievementButton.dataset.achievementId;
    var achievementRow = await supabaseClient.from("mentor_achievements").select("evidence_path,public_evidence_path").eq("id", achievementId).eq("status", "pending").maybeSingle();
    if (achievementRow.error || !achievementRow.data) { window.alert(achievementRow.error ? authErrorText(achievementRow.error) : "This submission has already been reviewed."); await drawVerificationAdmin(); return; }
    var achievementDecision = achievementButton.dataset.achievementReview;
    var achievementResult = await supabaseClient.from("mentor_achievements").update({ status: achievementDecision, reviewed_at: new Date().toISOString(), reviewed_by: user.id }).eq("id", achievementId).eq("status", "pending");
    if (achievementResult.error) { window.alert(authErrorText(achievementResult.error)); achievementButton.disabled = false; return; }
    var proofPaths = [achievementRow.data.evidence_path];
    if (achievementDecision === "rejected") proofPaths.push(achievementRow.data.public_evidence_path);
    proofPaths = proofPaths.filter(Boolean);
    var proofRemoval = proofPaths.length ? await supabaseClient.storage.from("mentor-achievements").remove(proofPaths) : { error: null };
    if (proofRemoval.error) window.alert("Decision saved, but a private file could not be deleted. Only you and trusted reviewers can still open it.");
    else {
      var clearedPaths = { evidence_path: null };
      if (achievementDecision === "rejected") clearedPaths.public_evidence_path = null;
      var clearResult = await supabaseClient.from("mentor_achievements").update(clearedPaths).eq("id", achievementId);
      if (clearResult.error) window.alert("Decision saved and files removed, but the file record could not be cleared: " + authErrorText(clearResult.error));
    }
    await drawVerificationAdmin();
    return;
  }
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
  return { n: user ? user.n : "You", g: "Learner" };
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
    : esc(ini(name || "Meridian").slice(0, 2).toUpperCase());
}
function socialPostHtml(row, myId) {
  var profile = relationRow(row.profiles), name = profile.display_name || "Meridian member";
  var reactions = Array.isArray(row.post_reactions) ? row.post_reactions : [];
  var comments = Array.isArray(row.post_comments) ? row.post_comments : [];
  var liked = reactions.some(function (reaction) { return reaction.user_id === myId; });
  var media = row.media_url ? (row.media_signed_url ? (row.media_type === "video"
    ? '<div class="social-post-media"><video controls preload="metadata" playsinline src="' + esc(row.media_signed_url) + '"></video></div>'
    : '<div class="social-post-media"><img loading="lazy" src="' + esc(row.media_signed_url) + '" alt="Photo shared by ' + esc(name) + '"></div>') : '<p class="muted">Media is temporarily unavailable. Refresh the feed to reload it.</p>') : "";
  return '<article class="social-post" data-social-post="' + esc(row.id) + '"><div class="social-post-head"><div class="social-avatar">' + socialAvatar(profile, name) + '</div><div><div class="social-post-author">' + esc(name) + (profile.grade ? ' · Class ' + esc(String(profile.grade)) : '') + '</div><div class="social-post-time">' + esc(relativeTime(row.created_at)) + '</div></div>' + (row.author_id === myId ? '<button class="act delete-action" data-social-delete="' + esc(row.id) + '" style="margin-left:auto">Delete</button>' : '<button class="act" data-social-report="' + esc(row.id) + '" data-report-user="' + esc(row.author_id) + '" style="margin-left:auto">Report</button>') + '</div><div class="social-post-copy">' + esc(row.content) + '</div>' + media + '<div class="social-post-actions"><button type="button" data-social-like="' + esc(row.id) + '" aria-pressed="' + liked + '">♥ ' + reactions.length + ' Like</button><button type="button" data-social-comments="' + esc(row.id) + '">◯ ' + comments.length + ' Comments</button><button type="button" data-social-focus="comment-' + esc(row.id) + '">Reply</button></div><div class="social-comments">' + comments.slice(-3).map(function (comment) { var author = relationRow(comment.profiles); return '<div class="social-comment"><b>' + esc(author.display_name || "Learner") + '</b>' + esc(comment.content) + (comment.author_id === myId ? '' : ' <button class="act" data-social-report="' + esc(row.id) + '" data-report-user="' + esc(comment.author_id) + '">Report</button>') + '</div>'; }).join("") + '<form class="social-comment-form" data-social-comment-form="' + esc(row.id) + '"><input id="comment-' + esc(row.id) + '" maxlength="2000" placeholder="Write a comment…" aria-label="Write a comment"><button class="btn ghost" type="submit">Comment</button></form></div></article>';
}
async function loadSocialFeed() {
  var list = document.getElementById("socialPostList");
  if (!list) return;
  if (!user || !supabaseClient) { list.innerHTML = '<div class="community-empty">Sign in to view and share posts.</div>'; return; }
  var loadingUserId = user.id;
  list.innerHTML = '<div class="local-loading">Loading your learning feed…</div>';
  var result = await supabaseClient.from("posts").select("id, author_id, content, post_type, media_url, media_type, created_at, profiles!posts_author_id_fkey(display_name, grade, avatar_url), post_reactions(user_id, reaction), post_comments(id, author_id, content, created_at, profiles!post_comments_author_id_fkey(display_name))").order("created_at", { ascending: false }).limit(50);
  if (!user || user.id !== loadingUserId || curRoute !== "feed") return;
  if (result.error) { list.innerHTML = '<div class="community-empty">Could not load posts: ' + esc(authErrorText(result.error)) + '. Check the Meridian database setup guide.</div>'; return; }
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
  if (meridianContactWarning(content)) { message.textContent = "Meridian keeps personal contact details private. Remove phone numbers, emails, links, and social handles before posting."; return; }
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
  var like = event.target.closest("[data-social-like]"), del = event.target.closest("[data-social-delete]"), focus = event.target.closest("[data-social-focus]"), report = event.target.closest("[data-social-report]");
  if (report) { await submitMeridianReport({ postId: report.dataset.socialReport, userId: report.dataset.reportUser }); return; }
  if (focus) { var input = document.getElementById(focus.dataset.socialFocus); if (input) input.focus(); return; }
  if (!user) { openSign(); return; }
  if (like) { like.disabled = true; var existing = like.getAttribute("aria-pressed") === "true"; var result = existing ? await supabaseClient.from("post_reactions").delete().eq("post_id", like.dataset.socialLike).eq("user_id", user.id) : await supabaseClient.from("post_reactions").insert({ post_id: like.dataset.socialLike, user_id: user.id, reaction: "like" }); if (result.error) window.alert(authErrorText(result.error)); await loadSocialFeed(); }
  else if (del) { if (!window.confirm("Delete this post?")) return; var postRow=await supabaseClient.from("posts").select("media_url").eq("id",del.dataset.socialDelete).eq("author_id",user.id).maybeSingle(); var removed = await supabaseClient.from("posts").delete().eq("id", del.dataset.socialDelete).eq("author_id", user.id); if (removed.error) window.alert(authErrorText(removed.error)); else { if(postRow.data&&postRow.data.media_url&&!/^https:\/\//i.test(postRow.data.media_url)) await supabaseClient.storage.from("post-media").remove([postRow.data.media_url]); await loadSocialFeed(); } }
});
document.getElementById("socialPostList").addEventListener("submit", async function (event) {
  var form = event.target.closest("[data-social-comment-form]"); if (!form) return; event.preventDefault();
  if (!user) { openSign(); return; }
  var input = form.querySelector("input"), value = input.value.trim(); if (!value) return;
  if (meridianContactWarning(value)) { window.alert("For safety, remove phone numbers, emails, links, and social handles from comments."); return; }
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
  flist.innerHTML = '<div class="local-loading">Loading saved doubts…</div>';
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
      n: author.display_name || "Meridian member",
      g: authorGrade ? "Class " + authorGrade : "Learner",
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
          n: answerAuthor.display_name || "Meridian member",
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
  if (a === "report-doubt") {
    await submitMeridianReport({ doubtId: p.id, userId: p.authorId });
  } else if (a === "report-answer") {
    await submitMeridianReport({ doubtId: p.id, userId: b.dataset.authorId });
  } else if (a === "like") {
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
    if (meridianContactWarning(v)) { document.getElementById("ferr").textContent = "For safety, remove phone numbers, emails, links, and social handles from your answer."; inp.focus(); return; }
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
  if (meridianContactWarning(v)) { er.textContent = "For safety, remove phone numbers, emails, links, and social handles from your doubt."; return; }
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
    g: user.grade ? "Class " + user.grade : "Learner",
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
            : '<button class="act" data-act="report-answer" data-id="' + p.id + '" data-author-id="' + esc(r.authorId || "") + '">Report answer</button>') +
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
      : '<button class="act" data-act="report-doubt" data-id="' + p.id + '">Report doubt</button>') +
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
    ["all", "All doubts"],
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
  fch.innerHTML = Object.keys(counts)
    .map(function (s) {
      return (
        '<button class="chip" aria-pressed="' +
        (s === fSub) +
        '" data-fs="' +
        s +
        '">' +
        "#" + s.replace(/ /g, "") + " (" + counts[s] + ")" +
        "</button>"
      );
    })
    .join("");
  var list = posts.filter(function (p) {
    return fSub === "All" || p.sub === fSub;
  });
  list.sort(function (a, b) {
    if (fSort === "all" || fSort === "new") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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
  if (fSort === "all") fSub = "All";
  drawFeed();
});
function drawMe() {
  var h = "";
  if (!user) {
    h = '<div class="box me-signin-card"><div><span class="community-kicker">YOUR MERIDIAN PROFILE</span><h3>Sign in to see your page</h3><p class="muted">Your profile and community details live here.</p></div><button class="btn" data-go="signin">Sign in</button></div>';
  } else {
    var location = user.location || {};
    var locationText = [location.city, location.state, location.country].filter(Boolean).join(", ") || "Add your location";
    var guidance = user.guidance || {};
    var goalDecision = learnerGoalDecisionChoices.filter(function (item) { return item[0] === guidance.goal_decision; })[0];
    var guidanceDetail = canLearn(user)
      ? '<section class="me-guidance-goals"><h4>Guidance goals</h4><p><b>' + esc(goalDecision ? goalDecision[1] : "Add your goal") + '</b></p><p class="muted">Board: ' + esc(guidance.board || "Not set") + (guidance.target_exam ? '<br>Target exam: ' + esc(guidance.target_exam) : '') + (guidance.help_subjects && guidance.help_subjects.length ? '<br>Focus subjects: ' + esc(guidance.help_subjects.join(", ")) : '') + (guidance.preferred_languages && guidance.preferred_languages.length ? '<br>Languages: ' + esc(guidance.preferred_languages.join(", ")) : '') + '</p></section>'
      : '';
    h = '<div class="me-profile-page"><div class="me-profile-hero"><div class="me-cover" id="myProfileCover"></div><div class="me-identity-row"><div class="me-avatar">' + (user.avatarUrl ? '<img src="' + esc(user.avatarUrl) + '" alt="Profile photo">' : esc(ini(user.n))) + '</div><div class="me-identity-copy"><h3>' + esc(user.n) + '</h3><p>' + esc(accountTypeLabel(user.role)) + ' · Class ' + esc(String(user.grade || "—")) + '</p></div></div></div><div class="me-page-grid"><section class="box me-detail-panel"><h3>Account details</h3><dl class="me-detail-list"><div><dt>Email</dt><dd>' + esc(user.e) + '</dd></div><div><dt>Account type</dt><dd>' + esc(accountTypeLabel(user.role)) + '</dd></div><div><dt>Class</dt><dd>' + esc(String(user.grade || "—")) + '</dd></div><div><dt>School</dt><dd>' + esc(location.school || "Add your school") + '</dd></div><div><dt>Location</dt><dd>' + esc(locationText) + '</dd></div></dl></section><aside class="box me-control-panel"><h3>Profile settings</h3><p class="muted">Keep your profile photo, banner, school, and location up to date.</p><button class="btn me-edit-button" data-edit-details>Edit profile</button><div class="me-image-actions"><label class="btn ghost">Change profile photo<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-image="avatar"></label><label class="btn ghost">Change banner<input type="file" accept="image/jpeg,image/png,image/webp" data-profile-image="banner"></label></div><div class="me-community"><h4>Community</h4><div class="profile-social" id="myFollowStats">Loading followers…</div></div></aside></div></div>';
    h = h.replace(/<section class="box me-detail-panel">[\s\S]*?<\/section>/, '<section class="box me-detail-panel"><h3>Profile</h3><p>' + esc(accountTypeLabel(user.role)) + ' · Class ' + esc(String(user.grade || "—")) + '</p><p class="muted">School: ' + esc(location.school || "—") + '<br>Location: ' + esc(locationText) + '</p>' + guidanceDetail + '</section>');
    h = h.replace(/<aside class="box me-control-panel">[\s\S]*?<\/aside>/, '<aside class="box me-control-panel"><h3>Community</h3><div class="profile-social" id="myFollowStats">Loading followers…</div><a class="btn ghost" href="#settings">Account and profile settings</a></aside>');
  }
  document.getElementById("meBody").innerHTML = h;
  if (user && user.bannerUrl) {
    var cover = document.getElementById("myProfileCover");
    if (cover) cover.style.backgroundImage = 'url("' + user.bannerUrl.replace(/["\\\\]/g, "") + '")';
    enableProfileImageView(cover, user.bannerUrl, "profile banner");
  }
  if (user) enableProfileImageView(document.querySelector("#meBody .me-avatar"), user.avatarUrl, "profile photo");
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
  onboardingOpen = false;
  if (curRoute === "me") drawMe();
});
dlg.addEventListener("cancel", function (event) {
  if (dlg.dataset.setupRequired === "true") event.preventDefault();
});
var routes = ["home", "feed", "profile", "doubts", "sessions", "pricing", "me", "settings", "dashboard", "verification"],
  names = {
    home: "Mentors",
    feed: "Feed",
    profile: "Tutor profile",
    doubts: "Doubts",
    sessions: "Study sessions",
    pricing: "Pricing",
    me: "My page",
    settings: "Settings",
    dashboard: "Tutor dashboard",
    verification: "Safety review",
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
    h = canMentor(user) && activeWorkspace === "mentor" ? "dashboard" : "home";
    if (location.hash !== "#" + h) history.replaceState(null, document.title, location.pathname + location.search + "#" + h);
  }
  if (h === "home" && canMentor(user) && !canLearn(user)) h = "dashboard";
  if (h === "home" && canLearn(user) && canMentor(user) && activeWorkspace === "mentor") h = "dashboard";
  if (h === "dashboard" && canLearn(user) && canMentor(user) && activeWorkspace !== "mentor") h = "home";
  if (h === "dashboard" && !canMentor(user)) h = "home";
  if (h === "verification" && (!user || !isVerificationAdmin)) h = "home";
  curRoute = h;
  document.body.classList.toggle("home-feed", h === "feed");
  document.body.classList.toggle("safety-reviewer-portal", h === "verification" && isVerificationAdmin);
  document.querySelectorAll("[data-v]").forEach(function (el) {
    el.hidden = el.dataset.v.split(" ").indexOf(h) < 0;
  });
  document.querySelectorAll("[data-nav]").forEach(function (a) {
    if (a.dataset.nav === (h === "profile" ? "home" : h)) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.title = names[h] + " | Meridian";
  if (h === "doubts") {
    if (user) loadDoubtsFromSupabase();
    else drawFeed();
  }
  if (h === "verification") drawVerificationAdmin();
  if (h === "profile") renderTutorProfilePage();
  if (h === "feed") loadSocialFeed();
  if (h === "sessions") loadPeerSessionsPage();
  if (h === "settings") loadPeerSettingsPage();
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

/* Step 1c account-menu open/close behavior. Existing menu item actions remain untouched. */
(function () {
  var menu = document.getElementById("accountMenu");
  var toggle = document.getElementById("accountMenuToggle");
  var mobileMe = document.querySelector('.tabbar [data-nav="me"]');
  if (!menu || !toggle) return;

  function setMenuOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    var mobileToggle = document.querySelector('.tabbar [aria-controls="accountMenu"]');
    if (mobileToggle) mobileToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  toggle.addEventListener("click", function () {
    setMenuOpen(menu.hidden);
  });

  if (mobileMe) mobileMe.addEventListener("click", function () {
    if (window.matchMedia("(max-width: 640px)").matches) setMenuOpen(true);
  });

  menu.addEventListener("click", function (event) {
    if (event.target.closest("a, button")) setMenuOpen(false);
  });

  document.addEventListener("click", function (event) {
    if (menu.hidden || menu.contains(event.target) || toggle.contains(event.target) || (mobileMe && mobileMe.contains(event.target))) return;
    setMenuOpen(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || menu.hidden) return;
    setMenuOpen(false);
    toggle.focus();
  });
})();
