import crypto from "crypto";
import { supabaseAdmin } from "./supabase";
import { trello } from "./trello";
import { translateListName, translateText } from "./translate";

const env = (key, fallback = "") => process.env[key] || fallback;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hash = (value) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");

/* =========================================================
   DESTINATION
========================================================= */

async function destinationBoard(s) {
  if (env("DEST_BOARD_ID")) {
    return env("DEST_BOARD_ID");
  }

  const { data, error } = await s
    .from("sync_config")
    .select("value")
    .eq("key", "destination_board_id")
    .maybeSingle();

  if (error) throw error;

  if (data?.value) {
    return data.value;
  }

  const board = await trello.post("/boards", {
    name: env("DEST_BOARD_NAME", "Ninja Time — Français"),
    defaultLists: "false",
  });

  await s.from("sync_config").upsert({
    key: "destination_board_id",
    value: board.id,
    updated_at: new Date().toISOString(),
  });

  return board.id;
}

/* =========================================================
   TRADUCTION AVEC CACHE
========================================================= */

async function translateCached(s, text, stats) {
  if (!text) {
    return {
      text: "",
      created: false,
    };
  }

  const sourceHash = hash(text);

  const { data, error } = await s
    .from("translation_cache")
    .select("translated_text")
    .eq("source_hash", sourceHash)
    .maybeSingle();

  if (error) throw error;

  if (data?.translated_text) {
    return {
      text: data.translated_text,
      created: false,
    };
  }

  const result = await translateText(text, null);

  if (result.translated) {
    await s.from("translation_cache").upsert({
      source_hash: sourceHash,
      source_text: text,
      translated_text: result.text,
      updated_at: new Date().toISOString(),
    });

    stats.translationsCreated++;
  }

  return {
    text: result.text,
    created: result.translated,
  };
}

/* =========================================================
   LISTES
========================================================= */

async function ensureList(s, sourceList, destinationLists, destinationBoardId) {
  const { data, error } = await s
    .from("list_map")
    .select("destination_list_id")
    .eq("source_list_id", sourceList.id)
    .maybeSingle();

  if (error) throw error;

  if (data?.destination_list_id) {
    return data.destination_list_id;
  }

  const translatedName = translateListName(sourceList.name);

  let destinationList = destinationLists.find(
    (list) =>
      !list.closed &&
      list.name.toLowerCase() === translatedName.toLowerCase()
  );

  if (!destinationList) {
    destinationList = await trello.post("/lists", {
      name: translatedName,
      idBoard: destinationBoardId,
      pos: sourceList.pos || "bottom",
    });
  }

  await s.from("list_map").upsert({
    source_list_id: sourceList.id,
    destination_list_id: destinationList.id,
    source_name: sourceList.name,
    destination_name: translatedName,
    updated_at: new Date().toISOString(),
  });

  return destinationList.id;
}

/* =========================================================
   LABELS
========================================================= */

async function ensureLabel(s, sourceLabel, destinationBoardId) {
  const { data, error } = await s
    .from("label_map")
    .select("destination_label_id")
    .eq("source_label_id", sourceLabel.id)
    .maybeSingle();

  if (error) throw error;

  if (data?.destination_label_id) {
    return data.destination_label_id;
  }

  const destinationLabel = await trello.post(
    `/boards/${destinationBoardId}/labels`,
    {
      name: sourceLabel.name || "",
      color: sourceLabel.color || "null",
    }
  );

  await s.from("label_map").upsert({
    source_label_id: sourceLabel.id,
    destination_label_id: destinationLabel.id,
    source_name: sourceLabel.name || "",
    color: sourceLabel.color || "",
    updated_at: new Date().toISOString(),
  });

  return destinationLabel.id;
}

/* =========================================================
   PIECES JOINTES
========================================================= */

async function syncAttachments(s, sourceCardId, destinationCardId, stats) {
  const attachments = await trello.get(
    `/cards/${sourceCardId}/attachments`,
    {
      fields: "all",
      limit: 1000,
    }
  );

  for (const attachment of attachments) {
    const { data, error } = await s
      .from("attachment_map")
      .select("id")
      .eq("source_attachment_id", attachment.id)
      .maybeSingle();

    if (error) throw error;

    if (data || !attachment.url) {
      continue;
    }

    try {
      const destinationAttachment = await trello.post(
        `/cards/${destinationCardId}/attachments`,
        {
          url: attachment.url,
          name: attachment.name || "Pièce jointe",
        }
      );

      await s.from("attachment_map").insert({
        source_attachment_id: attachment.id,
        destination_attachment_id: destinationAttachment.id,
        source_card_id: sourceCardId,
        destination_card_id: destinationCardId,
        name: attachment.name || "",
        url: attachment.url,
        updated_at: new Date().toISOString(),
      });

      stats.attachmentsCreated++;
    } catch (error) {
      console.error(
        `❌ Erreur pièce jointe ${attachment.name || attachment.id}:`,
        error.message
      );
    }

    await sleep(80);
  }
}

/* =========================================================
   CHECKLISTS
========================================================= */

async function syncChecklists(s, sourceCardId, destinationCardId, stats) {
  const checklists = await trello.get(
    `/cards/${sourceCardId}/checklists`,
    {
      checkItems: "all",
      checkItem_fields: "all",
      fields: "all",
    }
  );

  for (const checklist of checklists) {
    const { data, error } = await s
      .from("checklist_map")
      .select("destination_checklist_id")
      .eq("source_checklist_id", checklist.id)
      .maybeSingle();

    if (error) throw error;

    let destinationChecklistId = data?.destination_checklist_id;

    if (!destinationChecklistId) {
      const destinationChecklist = await trello.post(
        `/cards/${destinationCardId}/checklists`,
        {
          name: checklist.name,
          pos: checklist.pos || "bottom",
        }
      );

      destinationChecklistId = destinationChecklist.id;

      await s.from("checklist_map").upsert({
        source_checklist_id: checklist.id,
        destination_checklist_id: destinationChecklistId,
        source_card_id: sourceCardId,
        destination_card_id: destinationCardId,
        updated_at: new Date().toISOString(),
      });
    }

    for (const item of checklist.checkItems || []) {
      const { data: itemMap, error: itemError } = await s
        .from("checkitem_map")
        .select("destination_checkitem_id")
        .eq("source_checkitem_id", item.id)
        .maybeSingle();

      if (itemError) throw itemError;

      if (!itemMap) {
        const destinationItem = await trello.post(
          `/checklists/${destinationChecklistId}/checkItems`,
          {
            name: item.name,
            pos: item.pos || "bottom",
          }
        );

        await s.from("checkitem_map").insert({
          source_checkitem_id: item.id,
          destination_checkitem_id: destinationItem.id,
          source_checklist_id: checklist.id,
          destination_checklist_id: destinationChecklistId,
          state: item.state || "incomplete",
          updated_at: new Date().toISOString(),
        });
      } else {
        await trello.put(
          `/checklists/${destinationChecklistId}/checkItems/${itemMap.destination_checkitem_id}`,
          {
            name: item.name,
            state: item.state || "incomplete",
          }
        );
      }
    }

    stats.checklists++;
  }
}

/* =========================================================
   CARTE
========================================================= */

async function syncCard(
  s,
  card,
  destinationListId,
  sourceLabels,
  destinationBoardId,
  stats
) {
  console.log(`🃏 Carte : ${card.name}`);

  const translatedName = await translateCached(
    s,
    card.name || "",
    stats
  );

  const translatedDescription = await translateCached(
    s,
    card.desc || "",
    stats
  );

  const sourceHash = hash({
    name: card.name,
    desc: card.desc,
    due: card.due,
    start: card.start,
    dueComplete: card.dueComplete,
    pos: card.pos,
    idLabels: card.idLabels,
  });

  const { data: mapping, error } = await s
    .from("card_map")
    .select("*")
    .eq("source_card_id", card.id)
    .maybeSingle();

  if (error) throw error;

  const body = {
    name: translatedName.text,
    desc: translatedDescription.text,
    pos: card.pos || "bottom",
  };

  if (card.due) {
    body.due = card.due;
    body.dueComplete = !!card.dueComplete;
  }

  if (card.start) {
    body.start = card.start;
  }

  let destinationCardId = mapping?.destination_card_id;

  /* =========================
     NOUVELLE CARTE
  ========================= */

  if (!destinationCardId) {
    console.log(`   ➕ Création : ${translatedName.text}`);

    const destinationCard = await trello.post("/cards", {
      ...body,
      idList: destinationListId,
    });

    destinationCardId = destinationCard.id;

    await s.from("card_map").upsert({
      source_card_id: card.id,
      destination_card_id: destinationCardId,
      source_list_id: card.idList,
      destination_list_id: destinationListId,
      source_hash: sourceHash,
      updated_at: new Date().toISOString(),
    });

    stats.cardsCreated++;
  }

  /* =========================
     CARTE MODIFIÉE
  ========================= */

  else if (
    mapping.source_hash !== sourceHash ||
    mapping.destination_list_id !== destinationListId
  ) {
    console.log(`   🔄 Mise à jour : ${translatedName.text}`);

    await trello.put(`/cards/${destinationCardId}`, {
      ...body,
      idList: destinationListId,
    });

    await s
      .from("card_map")
      .update({
        source_hash: sourceHash,
        destination_list_id: destinationListId,
        updated_at: new Date().toISOString(),
      })
      .eq("source_card_id", card.id);

    stats.cardsUpdated++;
  }

  /* =========================
     LABELS
  ========================= */

  const destinationLabelIds = [];

  for (const labelId of card.idLabels || []) {
    if (!sourceLabels[labelId]) {
      continue;
    }

    const destinationLabelId = await ensureLabel(
      s,
      sourceLabels[labelId],
      destinationBoardId
    );

    destinationLabelIds.push(destinationLabelId);
  }

  if (destinationLabelIds.length > 0) {
    await trello.put(`/cards/${destinationCardId}`, {
      idLabels: destinationLabelIds,
    });
  }

  /* =========================
     CHECKLISTS
  ========================= */

  await syncChecklists(
    s,
    card.id,
    destinationCardId,
    stats
  );

  /* =========================
     PIECES JOINTES
  ========================= */

  await syncAttachments(
    s,
    card.id,
    destinationCardId,
    stats
  );

  stats.cardsProcessed++;

  console.log(`   ✅ Terminé : ${card.name}`);
}

/* =========================================================
   ETAT DE PROGRESSION
========================================================= */

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

async function saveSyncState(
  s,
  listIndex,
  cardIndex
) {
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

/* =========================================================
   SYNCHRONISATION PRINCIPALE
========================================================= */

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

  if (runError) {
    throw runError;
  }

  const stats = {
    cardsProcessed: 0,
    cardsCreated: 0,
    cardsUpdated: 0,
    attachmentsCreated: 0,
    translationsCreated: 0,
    checklists: 0,
  };

  try {
    /* =========================
       CONFIGURATION
    ========================= */

    const sourceBoardId = env(
      "SOURCE_BOARD_ID",
      "wvkggmxv"
    );

    const destinationBoardId =
      await destinationBoard(s);

    const maxCards = Number(
      env("MAX_CARDS_PER_RUN", "30")
    );

    /* =========================
       RECUPERATION DES LISTES
    ========================= */

    console.log("📋 Récupération des listes...");

    const sourceLists = await trello.get(
      `/boards/${sourceBoardId}/lists`,
      {
        fields: "id,name,closed,pos",
      }
    );

    const destinationLists = await trello.get(
      `/boards/${destinationBoardId}/lists`,
      {
        fields: "id,name,closed,pos",
      }
    );

    /* =========================
       LABELS
    ========================= */

    const sourceLabels = await trello.get(
      `/boards/${sourceBoardId}/labels`,
      {
        limit: 1000,
        fields: "all",
      }
    );

    const labels = Object.fromEntries(
      sourceLabels.map((label) => [
        label.id,
        label,
      ])
    );

    /* =========================
       POSITION MEMORISEE
    ========================= */

    const state = await getSyncState(s);

    let listIndex = Number(
      state.cursor_list_index || 0
    );

    let cardIndex = Number(
      state.cursor_card_index || 0
    );

    console.log(
      `📍 Reprise : liste ${listIndex}, carte ${cardIndex}`
    );

    let processedThisRun = 0;

    /* =========================
       PARCOURS DES LISTES
    ========================= */

    for (
      let i = listIndex;
      i < sourceLists.length;
      i++
    ) {
      const sourceList = sourceLists[i];

      if (sourceList.closed) {
        continue;
      }

      console.log(
        `📁 Liste : ${sourceList.name}`
      );

      const destinationListId =
        await ensureList(
          s,
          sourceList,
          destinationLists,
          destinationBoardId
        );

      const cards = await trello.get(
        `/lists/${sourceList.id}/cards`,
        {
          fields:
            "id,name,desc,closed,pos,due,start,dueComplete,idLabels",
          limit: 1000,
        }
      );

      const startCard =
        i === listIndex ? cardIndex : 0;

      for (
        let j = startCard;
        j < cards.length;
        j++
      ) {
        const sourceCard = cards[j];

        if (sourceCard.closed) {
          continue;
        }

        if (processedThisRun >= maxCards) {
          await saveSyncState(
            s,
            i,
            j
          );

          console.log(
            `⏸️ Limite atteinte : ${maxCards} cartes`
          );

          break;
        }

        await syncCard(
          s,
          {
            ...sourceCard,
            idList: sourceList.id,
          },
          destinationListId,
          labels,
          destinationBoardId,
          stats
        );

        processedThisRun++;

        /*
         * Sauvegarde après CHAQUE carte.
         * Si Vercel coupe le programme,
         * la prochaine exécution reprend ici.
         */

        await saveSyncState(
          s,
          i,
          j + 1
        );
      }

      if (processedThisRun >= maxCards) {
        break;
      }

      /*
       * Cette liste est terminée.
       * On recommence la prochaine liste à 0.
       */

      await saveSyncState(
        s,
        i + 1,
        0
      );
    }

    /* =========================
       FIN DU TABLEAU
    ========================= */

    const reachedEnd =
      listIndex < sourceLists.length &&
      processedThisRun < maxCards;

    if (
      reachedEnd ||
      sourceLists.length === 0
    ) {
      /*
       * On a terminé le tableau.
       * Le prochain passage recommencera
       * au début pour détecter les changements.
       */

      await saveSyncState(
        s,
        0,
        0
      );

      console.log(
        "🔄 Tableau entièrement parcouru."
      );
    }

    /* =========================
       ENREGISTREMENT SUCCÈS
    ========================= */

    await s
      .from("sync_runs")
      .update({
        status: "success",
        finished_at:
          new Date().toISOString(),
        cards_processed:
          stats.cardsProcessed,
        cards_created:
          stats.cardsCreated,
        cards_updated:
          stats.cardsUpdated,
        attachments_created:
          stats.attachmentsCreated,
        translations_created:
          stats.translationsCreated,
        error: null,
      })
      .eq("id", run.id);

    console.log(
      "✅ Synchronisation terminée."
    );

    return {
      destinationBoardId,
      limitedTo: maxCards,
      processedThisRun,
      ...stats,
    };
  } catch (error) {
    console.error(
      "❌ Synchronisation échouée :",
      error
    );

    await s
      .from("sync_runs")
      .update({
        status: "error",
        finished_at:
          new Date().toISOString(),
        cards_processed:
          stats.cardsProcessed,
        cards_created:
          stats.cardsCreated,
        cards_updated:
          stats.cardsUpdated,
        attachments_created:
          stats.attachmentsCreated,
        translations_created:
          stats.translationsCreated,
        error: error.message,
      })
      .eq("id", run.id);

    throw error;
  }
}
