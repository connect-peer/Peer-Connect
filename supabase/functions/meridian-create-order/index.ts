import { adminClient, basicRazorpay, caller, handleOptions, json, razorpay } from "../_shared/meridian.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  try {
    const user = await caller(req), { sessionId } = await req.json();
    if (typeof sessionId !== "string") return json(400, { error: "Booking is missing." });
    const db = adminClient();
    const { data: session, error } = await db.from("peer_sessions").select("id,learner_id,mentor_id,status,payment_status,price_inr,razorpay_order_id,starts_at").eq("id", sessionId).maybeSingle();
    if (error || !session || session.learner_id !== user.id || session.status !== "pending") return json(404, { error: "This booking is no longer available." });
    if (new Date(session.starts_at).getTime() <= Date.now() || Number(session.price_inr) < 99 || Number(session.price_inr) > 299) return json(400, { error: "This booking time or price is no longer valid." });
    const key = basicRazorpay();
    if (session.razorpay_order_id) return json(200, { keyId: key.keyId, orderId: session.razorpay_order_id, amount: Math.round(Number(session.price_inr) * 100), currency: "INR" });
    if (session.payment_status !== "checkout_pending") return json(409, { error: "This booking payment is no longer open." });
    const order = await razorpay("/orders", "POST", {
      amount: Math.round(Number(session.price_inr) * 100), currency: "INR", receipt: `meridian-${session.id}`,
      notes: { session_id: session.id, mentor_id: session.mentor_id, learner_id: session.learner_id, product: "Meridian Bearings call" },
    });
    const orderId = String(order.id || "");
    if (!orderId) throw new Error("Payment provider did not return an order.");
    const saved = await db.from("peer_sessions").update({ razorpay_order_id: orderId }).eq("id", session.id).eq("learner_id", user.id).eq("status", "pending");
    if (saved.error) throw saved.error;
    return json(200, { keyId: key.keyId, orderId, amount: Math.round(Number(session.price_inr) * 100), currency: "INR" });
  } catch (error) { return json(400, { error: error instanceof Error ? error.message : "Could not start secure checkout." }); }
});
