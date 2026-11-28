import { adminClient, caller, handleOptions, json, signedJwt } from "../_shared/meridian.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  try {
    const user = await caller(req), { sessionId } = await req.json();
    if (typeof sessionId !== "string") return json(400, { error: "Booking is missing." });
    const accessKey = Deno.env.get("MERIDIAN_100MS_ACCESS_KEY"), appSecret = Deno.env.get("MERIDIAN_100MS_APP_SECRET");
    if (!accessKey || !appSecret) return json(503, { error: "In-site video is not configured yet." });
    const db = adminClient();
    const { data: session, error } = await db.from("peer_sessions").select("id,learner_id,mentor_id,status,payment_status,starts_at,ends_at,video_room_id").eq("id", sessionId).maybeSingle();
    if (error || !session || ![session.learner_id, session.mentor_id].includes(user.id)) return json(404, { error: "This booking is unavailable." });
    const now = Date.now(), start = new Date(session.starts_at).getTime(), end = new Date(session.ends_at).getTime();
    if (session.status !== "confirmed" || session.payment_status !== "captured" || !session.video_room_id || now < start - 5 * 60_000 || now >= end) return json(403, { error: "You can join only the confirmed call, from five minutes before it starts until it ends." });
    const issued = Math.floor(now / 1000), role = Deno.env.get("MERIDIAN_100MS_ROLE") || "peer";
    const token = await signedJwt(appSecret, { access_key: accessKey, room_id: session.video_room_id, user_id: user.id, role, type: "app", version: 2, jti: crypto.randomUUID(), iat: issued, nbf: issued, exp: Math.min(issued + 40 * 60, Math.floor(end / 1000)) });
    return json(200, { authToken: token, userName: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Meridian member" });
  } catch (error) { return json(400, { error: error instanceof Error ? error.message : "Could not authorize the video call." }); }
});
