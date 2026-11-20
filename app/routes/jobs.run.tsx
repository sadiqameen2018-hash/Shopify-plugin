import type { ActionFunctionArgs } from "react-router";
import crypto from "node:crypto";
import { runScheduledJobs } from "../lib/verification.server";

/**
 * POST /jobs/run with header `Authorization: Bearer <CRON_SECRET>`.
 * Call it every 15–60 minutes from a cron service (Render/Fly cron,
 * GitHub Actions, cron-job.org, ...). Sends reminders and expires orders.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok =
    !!secret &&
    given.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response("Unauthorized", { status: 401 });

  const result = await runScheduledJobs();
  return Response.json(result);
};
