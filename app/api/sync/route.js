export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { runSync } from "../../../lib/sync";

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return (
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.headers.get("x-cron-secret") === secret
  );
}

async function handler(request) {
  if (!authorized(request)) {
    return Response.json(
      { ok: false, error: "Non autorisé" },
      { status: 401 }
    );
  }

  try {
    return Response.json({
      ok: true,
      ...(await runSync()),
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { ok: false, error: error?.message || "Erreur de synchronisation" },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return handler(request);
}

export async function POST(request) {
  return handler(request);
}
