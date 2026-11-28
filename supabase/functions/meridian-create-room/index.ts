import { adminClient, caller, handleOptions, json, signedJwt } from "../_shared/meridian.ts";

async function managementToken(accessKey: string, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  return await signedJwt(secret, { access_key: accessKey, type: "management", version: 2, jti: crypto.randomUUID(), iat: now, nbf: now, exp: now + 300 });
}

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  try {
    const user = await caller(req), { sessionId } = await req.json();
    if (typeof sessionId !== "string") return json(400, { error: "Booking is missing." });
    const accessKey = Deno.env.get("MERIDIAN_100MS_ACCESS_KEY"), appSecret = Deno.env.get("MERIDIAN_100MS_APP_SECRET"), templateId = Deno.env.get("MERIDIAN_100MS_TEMPLATE_ID");
    if (!accessKey || !appSecret || !templateId) return json(503, { error: "In-site video is not configured yet." });
    const db = adminClient();
    const { data: session, error } = await db.from("peer_sessions").select("id,learner_id,mentor_id,status,payment_status,starts_at,ends_at,video_room_id").eq("id", sessionId).maybeSingle();
    if (error || !session || ![session.learner_id, session.mentor_id].includes(user.id)) return json(404, { error: "This booking is unavailable." });
    const now = Date.now(), start = new Date(session.starts_at).getTime(), end = new Date(session.ends_at).getTime();
    if (session.status !== "confirmed" || session.payment_status !== "captured" || now < start - 5 * 60_000 || now >= end) return json(409, { error: "Video opens five minutes before the confirmed call and closes when it ends." });
    let roomId = session.video_room_id as string | null;
    if (!roomId) {
      const token = await managementToken(accessKey, appSecret);
      const response = await fetch("https://api.100ms.live/v2/rooms", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({
        name: `meridian-${session.id}`, description: "Private 30-minute Meridian guidance call", template_id: templateId, region: "in", size: 2, max_duration_seconds: 2100, recording_info: { enabled: false },
      }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.id !== "string") throw new Error("Video room could not be created. Check the 100ms template and server secrets.");
      roomId = body.id;
      const saved = await db.from("peer_sessions").update({ video_room_id: roomId, video_room_created_at: new Date().toISOString() }).eq("id", session.id).eq("status", "confirmed").is("video_room_id", null);
      if (saved.error) {
        const latest = await db.from("peer_sessions").select("video_room_id").eq("id", session.id).single();
        if (latest.data?.video_room_id) roomId = latest.data.video_room_id;
        else throw saved.error;
      }
    }
    return json(200, { roomId });
  } catch (error) { return json(400, { error: error instanceof Error ? error.message : "Could not open the call." }); }
});
