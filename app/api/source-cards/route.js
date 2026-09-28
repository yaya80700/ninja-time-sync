import { trello } from "../../../lib/trello";

export const dynamic = "force-dynamic";

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("x-manual-secret") === secret;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Accès non autorisé." }, { status: 401 });
  }

  try {
    const boardId = process.env.SOURCE_BOARD_ID || "wvkggmxv";
    const url = new URL(request.url);
    const listId = url.searchParams.get("listId");

    if (!listId) {
      const lists = await trello.get(`/boards/${boardId}/lists`, {
        fields: "id,name,closed,pos",
      });

      return Response.json({
        ok: true,
        lists: (lists || []).filter((list) => !list.closed),
      });
    }

    const cards = await trello.get(`/lists/${listId}/cards`, {
      fields: "id,name,desc,closed,pos,due,start,dueComplete,idLabels,idList,dateLastActivity",
      limit: 1000,
    });

    return Response.json({
      ok: true,
      cards: (cards || []).filter((card) => !card.closed),
    });
  } catch (error) {
    console.error("Source cards error:", error);
    return Response.json(
      { ok: false, error: error?.message || "Impossible de récupérer les cartes source." },
      { status: 500 }
    );
  }
}
