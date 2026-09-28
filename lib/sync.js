import crypto from "crypto";
import { supabaseAdmin } from "./supabase";
import { trello } from "./trello";
import { translateListName, translateText } from "./translate";

const env = (k, d = "") => process.env[k] || d;
const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function destinationBoard(s) {
  if (env("DEST_BOARD_ID")) return env("DEST_BOARD_ID");

  const { data } = await s
    .from("sync_config")
    .select("value")
    .eq("key", "destination_board_id")
    .maybeSingle();

  if (data?.value) return data.value;

  const b = await trello.post("/boards", {
    name: env("DEST_BOARD_NAME", "Ninja Time — Français"),
    defaultLists: "false",
  });

  await s.from("sync_config").upsert({
    key: "destination_board_id",
    value: b.id,
    updated_at: new Date().toISOString(),
  });

  return b.id;
}

async function translateCached(s, text, stats) {
  if (!text) return { text: "", created: false };

  const h = hash(text);
  const { data } = await s
    .from("translation_cache")
    .select("translated_text")
    .eq("source_hash", h)
    .maybeSingle();

  if (data?.translated_text) {
    return { text: data.translated_text, created: false };
  }

  const x = await translateText(text, null);

  if (x.translated) {
    await s.from("translation_cache").upsert({
      source_hash: h,
      source_text: text,
      translated_text: x.text,
      updated_at: new Date().toISOString(),
    });
    stats.translationsCreated++;
  }

  return { text: x.text, created: x.translated };
}

async function ensureList(s, l, dests, bid) {
  const { data: m } = await s
    .from("list_map")
    .select("destination_list_id")
    .eq("source_list_id", l.id)
    .maybeSingle();

  if (m?.destination_list_id) return m.destination_list_id;

  const name = translateListName(l.name);
  let d = dests.find((x) => !x.closed && x.name === name);

  if (!d) {
    d = await trello.post("/lists", {
      name,
      idBoard: bid,
      pos: l.pos || "bottom",
    });
    dests.push(d);
  }

  await s.from("list_map").upsert({
    source_list_id: l.id,
    destination_list_id: d.id,
    source_name: l.name,
    destination_name: name,
    updated_at: new Date().toISOString(),
  });

  return d.id;
}

async function ensureLabel(s, l, bid) {
  const { data: m } = await s
    .from("label_map")
    .select("destination_label_id")
    .eq("source_label_id", l.id)
    .maybeSingle();

  if (m?.destination_label_id) return m.destination_label_id;

  const d = await trello.post(`/boards/${bid}/labels`, {
    name: l.name || "",
    color: l.color || "null",
  });

  await s.from("label_map").upsert({
    source_label_id: l.id,
    destination_label_id: d.id,
    source_name: l.name || "",
    color: l.color || "",
    updated_at: new Date().toISOString(),
  });

  return d.id;
}

async function attachments(s, src, dst, stats) {
  const a = await trello.get(`/cards/${src}/attachments`, {
    fields: "all",
    limit: 1000,
  });

  for (const x of a) {
    const { data: m } = await s
      .from("attachment_map")
      .select("source_attachment_id")
      .eq("source_attachment_id", x.id)
      .maybeSingle();

    if (m || !x.url) continue;

    try {
      const d = await trello.post(`/cards/${dst}/attachments`, {
        url: x.url,
        name: x.name || "Pièce jointe",
      });

      await s.from("attachment_map").insert({
        source_attachment_id: x.id,
        destination_attachment_id: d.id,
        source_card_id: src,
        destination_card_id: dst,
        name: x.name || "",
        url: x.url,
        updated_at: new Date().toISOString(),
      });

      stats.attachmentsCreated++;
    } catch (e) {
      console.error("Attachment:", e.message);
    }

    await sleep(80);
  }
}

async function checklists(s, src, dst, stats) {
  const cs = await trello.get(`/cards/${src}/checklists`, {
    checkItems: "all",
    checkItem_fields: "all",
    fields: "all",
  });

  for (const c of cs) {
    const { data: m } = await s
      .from("checklist_map")
      .select("destination_checklist_id")
      .eq("source_checklist_id", c.id)
      .maybeSingle();

    let did = m?.destination_checklist_id;

    if (!did) {
      const d = await trello.post(`/cards/${dst}/checklists`, {
        name: c.name,
        pos: c.pos || "bottom",
      });

      did = d.id;

      await s.from("checklist_map").upsert({
        source_checklist_id: c.id,
        destination_checklist_id: did,
        source_card_id: src,
        destination_card_id: dst,
        updated_at: new Date().toISOString(),
      });
    }

    for (const i of c.checkItems || []) {
      const { data: im } = await s
        .from("checkitem_map")
        .select("destination_checkitem_id")
        .eq("source_checkitem_id", i.id)
        .maybeSingle();

      if (!im) {
        const d = await trello.post(`/checklists/${did}/checkItems`, {
          name: i.name,
          pos: i.pos || "bottom",
        });

        await s.from("checkitem_map").insert({
          source_checkitem_id: i.id,
          destination_checkitem_id: d.id,
          source_checklist_id: c.id,
          destination_checklist_id: did,
          state: i.state || "incomplete",
          updated_at: new Date().toISOString(),
        });
      } else {
        await trello.put(`/checklists/${did}/checkItems/${im.destination_checkitem_id}`, {
          name: i.name,
          state: i.state || "incomplete",
        });
      }
    }

    stats.checklists++;
  }
}

async function syncCard(s, c, listId, labels, bid, stats) {
  const n = await translateCached(s, c.name || "", stats);
  const d = await translateCached(s, c.desc || "", stats);

  const sig = hash({
    name: c.name,
    desc: c.desc,
    due: c.due,
    start: c.start,
    dueComplete: c.dueComplete,
    pos: c.pos,
    idLabels: c.idLabels,
  });

  const { data: m } = await s
    .from("card_map")
    .select("*")
    .eq("source_card_id", c.id)
    .maybeSingle();

  const body = {
    name: n.text,
    desc: d.text,
    pos: c.pos || "bottom",
  };

  if (c.due) {
    body.due = c.due;
    body.dueComplete = !!c.dueComplete;
  }

  if (c.start) body.start = c.start;

  let did = m?.destination_card_id;

  if (!did) {
    const x = await trello.post("/cards", {
      ...body,
      idList: listId,
    });

    did = x.id;

    await s.from("card_map").insert({
      source_card_id: c.id,
      destination_card_id: did,
      source_list_id: c.idList,
      destination_list_id: listId,
      source_hash: sig,
      updated_at: new Date().toISOString(),
    });

    stats.cardsCreated++;
  } else if (m.source_hash !== sig || m.destination_list_id !== listId) {
    await trello.put(`/cards/${did}`, {
      ...body,
      idList: listId,
    });

    await s
      .from("card_map")
      .update({
        source_hash: sig,
        destination_list_id: listId,
        updated_at: new Date().toISOString(),
      })
      .eq("source_card_id", c.id);

    stats.cardsUpdated++;
  }

  const ids = [];
  for (const lid of c.idLabels || []) {
    if (labels[lid]) ids.push(await ensureLabel(s, labels[lid], bid));
  }

  if (ids.length) {
    await trello.put(`/cards/${did}`, { idLabels: ids });
  }

  await checklists(s, c.id, did, stats);
  await attachments(s, c.id, did, stats);

  stats.cardsProcessed++;
}

async function getSyncState(s) {
  const { data, error } = await s
    .from("sync_state")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { data: created, error: createError } = await s
      .from("sync_state")
      .insert({
        id: 1,
        cursor_list_index: 0,
        cursor_card_index: 0,
      })
      .select()
      .single();

    if (createError) throw createError;
    return created;
  }

  return data;
}

async function saveSyncState(s, listIndex, cardIndex) {
  const { error } = await s
    .from("sync_state")
    .update({
      cursor_list_index: listIndex,
      cursor_card_index: cardIndex,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) throw error;
}

export async function runSync() {
  const s = supabaseAdmin();
  const started = new Date().toISOString();

  const { data: run, error: runError } = await s
    .from("sync_runs")
    .insert({
      status: "running",
      started_at: started,
    })
    .select()
    .single();

  if (runError) throw runError;

  const stats = {
    cardsProcessed: 0,
    cardsCreated: 0,
    cardsUpdated: 0,
    attachmentsCreated: 0,
    translationsCreated: 0,
    checklists: 0,
  };

  try {
    const sourceBoardId = env("SOURCE_BOARD_ID", "wvkggmxv");
    const destinationBoardId = await destinationBoard(s);
    const maxCards = Number(env("MAX_CARDS_PER_RUN", "30"));

    console.log("📋 Récupération des listes...");

    const sourceLists = await trello.get(`/boards/${sourceBoardId}/lists`, {
      fields: "id,name,closed,pos",
    });

    const destinationLists = await trello.get(`/boards/${destinationBoardId}/lists`, {
      fields: "id,name,closed,pos",
    });

    const sourceLabels = await trello.get(`/boards/${sourceBoardId}/labels`, {
      limit: 1000,
      fields: "all",
    });

    const labels = Object.fromEntries(sourceLabels.map((x) => [x.id, x]));

    const state = await getSyncState(s);

    // Récupère une seule fois les IDs déjà synchronisés.
    const { data: mappedCards, error: mappedError } = await s
      .from("card_map")
      .select("source_card_id")
      .limit(10000);

    if (mappedError) throw mappedError;

    const mappedIds = new Set((mappedCards || []).map((x) => x.source_card_id));
    const processedIds = new Set();
    const cardsByList = new Map();
    const destinationListBySource = new Map();

    // ------------------------------------------------------------
    // 1) DÉCOUVERTE DES NOUVELLES CARTES
    // ------------------------------------------------------------
    // Cette passe est volontairement séparée du curseur :
    // une nouvelle carte ajoutée aujourd'hui, même dans une liste
    // située très loin dans le tableau, est détectée dès le prochain run.
    for (const l of sourceLists) {
      if (l.closed) continue;

      const destinationListId = await ensureList(
        s,
        l,
        destinationLists,
        destinationBoardId
      );

      destinationListBySource.set(l.id, destinationListId);

      const cards = await trello.get(`/lists/${l.id}/cards`, {
        fields: "id,name,desc,closed,pos,due,start,dueComplete,idLabels",
        limit: 1000,
      });

      cardsByList.set(l.id, cards);

      for (const c of cards) {
        if (c.closed) continue;
        if (mappedIds.has(c.id)) continue;
        if (processedIds.has(c.id)) continue;

        if (stats.cardsProcessed >= maxCards) {
          await saveSyncState(s, 0, 0);
          break;
        }

        await syncCard(
          s,
          { ...c, idList: l.id },
          destinationListId,
          labels,
          destinationBoardId,
          stats
        );

        processedIds.add(c.id);
        mappedIds.add(c.id);
      }

      if (stats.cardsProcessed >= maxCards) break;
    }

    // ------------------------------------------------------------
    // 2) CONTINUATION DES CARTES EXISTANTES
    // ------------------------------------------------------------
    if (stats.cardsProcessed < maxCards) {
      let listIndex = Number(state.cursor_list_index) || 0;
      let cardIndex = Number(state.cursor_card_index) || 0;
      let finished = true;

      for (let i = listIndex; i < sourceLists.length; i++) {
        const l = sourceLists[i];
        if (l.closed) {
          cardIndex = 0;
          continue;
        }

        const destinationListId =
          destinationListBySource.get(l.id) ||
          (await ensureList(s, l, destinationLists, destinationBoardId));

        const cards =
          cardsByList.get(l.id) ||
          (await trello.get(`/lists/${l.id}/cards`, {
            fields: "id,name,desc,closed,pos,due,start,dueComplete,idLabels",
            limit: 1000,
          }));

        const startIndex = i === listIndex ? cardIndex : 0;

        for (let j = startIndex; j < cards.length; j++) {
          const c = cards[j];

          if (c.closed) {
            await saveSyncState(s, i, j + 1);
            continue;
          }

          if (processedIds.has(c.id)) {
            await saveSyncState(s, i, j + 1);
            continue;
          }

          if (stats.cardsProcessed >= maxCards) {
            await saveSyncState(s, i, j);
            finished = false;
            break;
          }

          // Les nouvelles cartes ont déjà été traitées pendant la passe 1.
          // Elles sont donc ignorées ici pour éviter un double traitement.
          if (!mappedIds.has(c.id)) {
            await saveSyncState(s, i, j + 1);
            continue;
          }

          await syncCard(
            s,
            { ...c, idList: l.id },
            destinationListId,
            labels,
            destinationBoardId,
            stats
          );

          processedIds.add(c.id);
          await saveSyncState(s, i, j + 1);
        }

        if (!finished) break;

        await saveSyncState(s, i + 1, 0);
        cardIndex = 0;
      }

      // Fin du parcours : le prochain run repart du début.
      if (finished) {
        await saveSyncState(s, 0, 0);
      }
    }

    await s
      .from("sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        cards_processed: stats.cardsProcessed,
        cards_created: stats.cardsCreated,
        cards_updated: stats.cardsUpdated,
        attachments_created: stats.attachmentsCreated,
        translations_created: stats.translationsCreated,
        error: null,
      })
      .eq("id", run.id);

    console.log("✅ Synchronisation terminée.");

    return {
      destinationBoardId,
      limitedTo: maxCards,
      processedThisRun: stats.cardsProcessed,
      ...stats,
    };
  } catch (e) {
    console.error("❌ Synchronisation échouée :", e);

    await s
      .from("sync_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        cards_processed: stats.cardsProcessed,
        cards_created: stats.cardsCreated,
        cards_updated: stats.cardsUpdated,
        attachments_created: stats.attachmentsCreated,
        translations_created: stats.translationsCreated,
        error: e.message,
      })
      .eq("id", run.id);

    throw e;
  }
}
