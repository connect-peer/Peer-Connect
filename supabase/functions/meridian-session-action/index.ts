import { adminClient, caller, handleOptions, json, razorpay } from "../_shared/meridian.ts";

type Action = "confirmed" | "declined" | "cancelled" | "completed" | "no_show";

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  try {
    const user = await caller(req), body = await req.json(), action = String(body.action || "") as Action;
    const sessionId = String(body.sessionId || ""), declineReason = String(body.declineReason || "");
    if (!sessionId || !["confirmed", "declined", "cancelled", "completed", "no_show"].includes(action)) return json(400, { error: "Choose a valid booking action." });
    const db = adminClient();
    const { data: row, error } = await db.from("peer_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (error || !row) return json(404, { error: "Booking not found." });
    const mentor = row.mentor_id === user.id, learner = row.learner_id === user.id;
    if (!mentor && !learner) return json(403, { error: "Only people in this booking can change it." });
    const now = Date.now(), starts = new Date(row.starts_at).getTime(), ends = new Date(row.ends_at).getTime();
    if (action === "confirmed") {
      if (!mentor || row.status !== "pending" || now > new Date(row.response_deadline).getTime()) return json(409, { error: "This request can no longer be accepted." });
      if (!["held", "captured"].includes(row.payment_status) || !row.razorpay_payment_id) return json(409, { error: "The learner payment is not authorized." });
      let state = String(row.payment_status);
      if (state === "held") {
        let captured = await razorpay(`/payments/${encodeURIComponent(row.razorpay_payment_id)}`);
        if (captured.status === "authorized") captured = await razorpay(`/payments/${encodeURIComponent(row.razorpay_payment_id)}/capture`, "POST", { amount: Math.round(Number(row.price_inr) * 100), currency: "INR" });
        if (captured.status !== "captured") return json(409, { error: "Payment capture is not complete yet. Try again shortly." });
        state = "captured";
      }
      const saved = await db.from("peer_sessions").update({ status: "confirmed", payment_status: state }).eq("id", sessionId).eq("status", "pending");
      if (saved.error) throw saved.error;
      await db.from("meridian_session_financials").update({ payout_status: "captured", updated_at: new Date().toISOString() }).eq("session_id", sessionId);
      return json(200, { ok: true, status: "confirmed" });
    }
    if (action === "declined") {
      if (!mentor || row.status !== "pending" || now > new Date(row.response_deadline).getTime()) return json(409, { error: "This request can no longer be declined." });
      if (!["unavailable", "schedule_conflict", "not_a_match", "other"].includes(declineReason)) return json(400, { error: "Choose a decline reason." });
    } else if (action === "cancelled") {
      if ((!mentor && !learner) || !["pending", "confirmed"].includes(row.status) || now >= starts) return json(409, { error: "This booking can no longer be cancelled here." });
    } else if (action === "completed" || action === "no_show") {
      if (!mentor || row.status !== "confirmed" || now < ends) return json(409, { error: "This session can be closed after its scheduled time." });
      const saved = await db.from("peer_sessions").update({ status: action }).eq("id", sessionId).eq("status", "confirmed");
      if (saved.error) throw saved.error;
      if (action === "no_show") return json(200, { ok: true, status: action });
      const payout = await db.from("meridian_session_financials").update({ payout_status: "payout_pending", updated_at: new Date().toISOString() }).eq("session_id", sessionId);
      if (payout.error) throw payout.error;
      return json(200, { ok: true, status: action, payoutStatus: "manual_settlement_pending" });
    }

    const nextState = row.payment_status === "captured" ? "refund_pending" : "voided";
    const update: Record<string, unknown> = { status: action, payment_status: nextState };
    if (action === "cancelled") update.cancelled_by = user.id;
    if (action === "declined") update.decline_reason = declineReason;
    const saved = await db.from("peer_sessions").update(update).eq("id", sessionId).in("status", ["pending", "confirmed"]);
    if (saved.error) throw saved.error;
    if (nextState === "refund_pending") await db.from("meridian_session_financials").update({ payout_status: "refund_pending", updated_at: new Date().toISOString() }).eq("session_id", sessionId);
    if (nextState === "refund_pending" && row.razorpay_payment_id) {
      try {
        await razorpay(`/payments/${encodeURIComponent(row.razorpay_payment_id)}/refund`, "POST", { amount: Math.round(Number(row.price_inr) * 100), notes: { session_id: row.id, reason: action } });
        const refunded = await db.from("peer_sessions").update({ payment_status: "refunded" }).eq("id", sessionId).eq("payment_status", "refund_pending");
        if (refunded.error) throw refunded.error;
        await db.from("meridian_session_financials").update({ payout_status: "refunded", updated_at: new Date().toISOString() }).eq("session_id", sessionId);
        return json(200, { ok: true, status: action, refundStatus: "refunded" });
      } catch (refundError) {
        return json(200, { ok: true, status: action, refundStatus: "pending", message: refundError instanceof Error ? refundError.message : "Refund will be retried by support." });
      }
    }
    return json(200, { ok: true, status: action, refundStatus: nextState === "voided" ? "authorization_released_by_provider" : "none" });
  } catch (error) { return json(400, { error: error instanceof Error ? error.message : "Could not update this booking." }); }
});
