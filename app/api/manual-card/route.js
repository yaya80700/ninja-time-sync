import { syncSingleSourceCard } from "../../../lib/sync";

export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("x-manual-secret") === secret;
}

export async function POST(request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Accès non autorisé." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const sourceCardId = String(body?.sourceCardId || "").trim();

    if (!sourceCardId) {
      return Response.json({ ok: false, error: "Carte source manquante." }, { status: 400 });
    }

    const result = await syncSingleSourceCard(sourceCardId);

    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Manual card error:", error);
    return Response.json(
      { ok: false, error: error?.message || "Impossible de synchroniser cette carte." },
      { status: 500 }
    );
  }
}
