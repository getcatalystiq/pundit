import crypto from "node:crypto";
import { sql } from "@/lib/db";
import { jsonResponse } from "@/lib/utils";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization") ?? "";
    const provided = authHeader.replace("Bearer ", "");
    const a = Buffer.from(provided);
    const b = Buffer.from(cronSecret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // Delete expired authorization codes
  await sql`DELETE FROM oauth_authorization_codes WHERE expires_at < NOW()`;

  // Delete expired refresh tokens
  await sql`DELETE FROM oauth_refresh_tokens WHERE expires_at < NOW()`;

  // Delete revoked refresh tokens older than 7 days
  await sql`DELETE FROM oauth_refresh_tokens WHERE revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days'`;

  // Delete used authorization codes older than 1 hour
  await sql`DELETE FROM oauth_authorization_codes WHERE used_at IS NOT NULL AND used_at < NOW() - INTERVAL '1 hour'`;

  return jsonResponse({ ok: true });
}
