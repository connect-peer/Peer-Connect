import { adminClient, caller, handleOptions, json } from "../_shared/meridian.ts";

type SessionRow = {
  session_id: string;
  status: string;
  payment_status: string;
  payout_status: string;
};

async function listObjectPaths(db: ReturnType<typeof adminClient>, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`Could not prepare account files for removal (${bucket}): ${error.message}`);
    const objects = data || [];
    for (const item of objects) {
      const path = `${prefix}/${item.name}`;
      if (item.id) paths.push(path);
      else paths.push(...await listObjectPaths(db, bucket, path));
    }
    if (objects.length < 100) break;
  }
  return paths;
}

async function removePrefix(db: ReturnType<typeof adminClient>, bucket: string, prefix: string) {
  const paths = await listObjectPaths(db, bucket, prefix);
  for (let start = 0; start < paths.length; start += 100) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(start, start + 100));
    if (error) throw new Error(`Could not remove account files (${bucket}): ${error.message}`);
  }
}

function hasUnresolvedSession(sessions: SessionRow[]) {
  return sessions.some((session) => {
    const payment = session.payment_status;
    const payout = session.payout_status;
    if (["pending", "confirmed"].includes(session.status)) return true;
    if (["held", "refund_pending", "credit_pending"].includes(payment)) return true;
    if (payment === "captured" && payout !== "paid") return true;
    if (payment === "checkout_pending" && !["cancelled", "declined", "no_show"].includes(session.status)) return true;
    if (["captured", "waiting_for_completion", "payout_pending", "refund_pending", "payout_setup_required"].includes(payout || "")) return true;
    return false;
  });
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  try {
    const user = await caller(req);
    const body = await req.json().catch(() => ({}));
    if (body.confirmation !== "DELETE MY ACCOUNT") {
      return json(400, { error: "Confirm permanent deletion in the Meridian dialog." });
    }

    const db = adminClient();
    // Use the privileged, narrowly scoped RPC instead of querying peer_sessions
    // directly. This still works when table grants/RLS intentionally block reads.
    const { data: sessions, error: sessionCheckError } = await db.rpc(
      "meridian_account_deletion_check",
      { p_user_id: user.id },
    );
    if (sessionCheckError) throw new Error(`Could not check your bookings before deletion: ${sessionCheckError.message}`);
    const sessionRows = (sessions || []) as SessionRow[];
    const sessionIds = sessionRows.map((session) => session.session_id);
    if (hasUnresolvedSession(sessionRows)) {
      return json(409, { error: "First cancel or complete active calls and resolve any pending refund or mentor payout. Your account has not been deleted." });
    }

    // Remove user-owned uploads before deleting Auth; Supabase Auth refuses to
    // delete users that still own Storage objects.
    for (const bucket of ["profile-media", "post-media", "mentor-achievements", "tutor-verification"]) {
      await removePrefix(db, bucket, user.id);
    }
    for (const sessionId of sessionIds) {
      await removePrefix(db, "session-chat-files", `${sessionId}/${user.id}`);
    }

    const { error: dataError } = await db.rpc("meridian_prepare_account_deletion", { p_user_id: user.id });
    if (dataError) throw new Error(`Account data could not be fully removed: ${dataError.message}`);

    const { error: deleteError } = await db.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw new Error(`Meridian data was removed, but Supabase could not finish deleting the sign-in account. Try again or contact Meridian support: ${deleteError.message}`);

    return json(200, { ok: true });
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "Could not delete this Meridian account." });
  }
});
