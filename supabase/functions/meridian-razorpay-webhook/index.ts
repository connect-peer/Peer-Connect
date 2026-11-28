import { adminClient, corsHeaders, hmacHex, json, safeEqual } from "../_shared/meridian.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  try {
    const raw = await req.text(), signature = req.headers.get("x-razorpay-signature") || "", eventId = req.headers.get("x-razorpay-event-id") || "";
    const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    if (!secret || !signature || !eventId) return json(401, { error: "Webhook authentication is missing." });
    if (!safeEqual(await hmacHex(secret, raw), signature.toLowerCase())) return json(401, { error: "Webhook signature is invalid." });
    const body = JSON.parse(raw), eventName = String(body.event || ""), db = adminClient();
    const duplicate = await db.from("meridian_payment_webhook_events").select("event_id").eq("event_id", eventId).maybeSingle();
    if (duplicate.data) return json(200, { received: true, duplicate: true });
    if (eventName === "payment.authorized" || eventName === "payment.captured") {
      const payment = body.payload?.payment?.entity;
      if (!payment || typeof payment.id !== "string" || typeof payment.order_id !== "string") return json(400, { error: "Payment event is incomplete." });
      const { data: session, error } = await db.from("peer_sessions").select("id,status,payment_status,price_inr,razorpay_order_id,razorpay_payment_id").eq("razorpay_order_id", payment.order_id).maybeSingle();
      if (error) throw error;
      if (session && (!session.razorpay_payment_id || session.razorpay_payment_id === payment.id) && Number(payment.amount) === Math.round(Number(session.price_inr) * 100)) {
        const captured = eventName === "payment.captured" || payment.status === "captured";
        const terminal = ["declined", "cancelled"].includes(session.status);
        const next = captured
          ? (terminal ? (["refund_pending", "refunded"].includes(session.payment_status) ? session.payment_status : session.payment_status === "voided" ? "refund_pending" : "captured") : "captured")
          : (terminal ? session.payment_status : "held");
        const saved = await db.from("peer_sessions").update({ razorpay_payment_id: payment.id, payment_status: next }).eq("id", session.id);
        if (saved.error) throw saved.error;
        if (captured && terminal && next === "captured") {
          const flagged = await db.from("peer_sessions").update({ payment_status: "refund_pending" }).eq("id", session.id).eq("payment_status", "captured");
          if (flagged.error) throw flagged.error;
        }
        if (captured && terminal) await db.from("meridian_session_financials").update({ payout_status: "refund_pending", updated_at: new Date().toISOString() }).eq("session_id", session.id);
        else if (captured) await db.from("meridian_session_financials").update({ payout_status: "captured", updated_at: new Date().toISOString() }).eq("session_id", session.id);
      }
    } else if (eventName === "refund.processed") {
      const refund = body.payload?.refund?.entity;
      const paymentId = String(refund?.payment_id || "");
      if (paymentId) {
        const { data: session } = await db.from("peer_sessions").select("id,payment_status").eq("razorpay_payment_id", paymentId).maybeSingle();
        if (session && session.payment_status === "refund_pending") {
          const updated = await db.from("peer_sessions").update({ payment_status: "refunded" }).eq("id", session.id).eq("payment_status", "refund_pending");
          if (updated.error) throw updated.error;
          await db.from("meridian_session_financials").update({ payout_status: "refunded", updated_at: new Date().toISOString() }).eq("session_id", session.id);
        }
      }
    }
    const recorded = await db.from("meridian_payment_webhook_events").insert({ event_id: eventId, event_name: eventName });
    if (recorded.error && recorded.error.code !== "23505") throw recorded.error;
    return json(200, { received: true });
  } catch (error) { return json(500, { error: error instanceof Error ? error.message : "Could not process webhook." }); }
});
