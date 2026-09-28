import { supabaseAdmin } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = supabaseAdmin();

    const [{ data: run, error: runError }, { data: state, error: stateError }] = await Promise.all([
      supabase
        .from("sync_runs")
        .select("id,status,started_at,finished_at,cards_processed,cards_created,cards_updated,attachments_created,translations_created,error")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("sync_state")
        .select("cursor_list_index,cursor_card_index,updated_at")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (runError) throw runError;
    if (stateError) throw stateError;

    return Response.json({
      ok: true,
      status: run?.status || "jamais exécuté",
      lastRun: run?.finished_at || run?.started_at || null,
      startedAt: run?.started_at || null,
      finishedAt: run?.finished_at || null,
      cardsProcessed: run?.cards_processed || 0,
      cardsCreated: run?.cards_created || 0,
      cardsUpdated: run?.cards_updated || 0,
      attachmentsCreated: run?.attachments_created || 0,
      translationsCreated: run?.translations_created || 0,
      error: run?.error || null,
      cursor: {
        list: state?.cursor_list_index || 0,
        card: state?.cursor_card_index || 0,
        updatedAt: state?.updated_at || null,
      },
      limit: Number(process.env.MAX_CARDS_PER_RUN || 30),
      destinationBoardId: process.env.DEST_BOARD_ID || null,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { ok: false, status: "error", error: error?.message || "Erreur de statut" },
      { status: 500 }
    );
  }
}
