import { adminClient, basicRazorpay, caller, handleOptions, hmacHex, json, razorpay, safeEqual } from "../_shared/meridian.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  try {
    const user = await caller(req), body = await req.json();
    const sessionId = String(body.sessionId || ""), orderId = String(body.orderId || ""), paymentId = String(body.paymentId || ""), signature = String(body.signature || "");
    if (!sessionId || !orderId || !paymentId || !signature) return json(400, { error: "Payment confirmation is incomplete." });
    const db = adminClient();
    const { data: session, error } = await db.from("peer_sessions").select("id,learner_id,status,payment_status,price_inr,razorpay_order_id,razorpay_payment_id").eq("id", sessionId).maybeSingle();
    if (error || !session || session.learner_id !== user.id || session.status !== "pending" || session.razorpay_order_id !== orderId) return json(404, { error: "This payment does not match an open booking." });
    if (session.razorpay_payment_id && session.razorpay_payment_id !== paymentId) return json(409, { error: "A different payment is already attached to this booking." });
    const { secret } = basicRazorpay();
    const expected = await hmacHex(secret, `${orderId}|${paymentId}`);
    if (!safeEqual(expected, signature.toLowerCase())) return json(403, { error: "Payment signature could not be verified." });
    const payment = await razorpay(`/payments/${encodeURIComponent(paymentId)}`);
    if (payment.order_id !== orderId || Number(payment.amount) !== Math.round(Number(session.price_inr) * 100) || !["authorized", "captured"].includes(String(payment.status))) return json(409, { error: "Payment is not authorized for this booking." });
    const paymentState = payment.status === "captured" ? "captured" : "held";
    const saved = await db.from("peer_sessions").update({ razorpay_payment_id: paymentId, payment_status: paymentState }).eq("id", sessionId).eq("status", "pending");
    if (saved.error) throw saved.error;
    return json(200, { ok: true, status: paymentState });
  } catch (error) { return json(400, { error: error instanceof Error ? error.message : "Could not verify payment." }); }
});
