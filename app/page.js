"use client";

import { useEffect, useMemo, useState } from "react";

function formatDate(value) {
  if (!value) return "Jamais";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StatusBadge({ status }) {
  const normalized = String(status || "").toLowerCase();
  const kind = normalized === "success" ? "ok" : normalized === "running" ? "warn" : normalized === "error" ? "danger" : "muted";
  const labels = { success: "OK", running: "EN COURS", error: "ERREUR", "jamais exécuté": "JAMAIS EXÉCUTÉ" };

  return <span className={`badge ${kind}`}>{labels[normalized] || String(status || "INCONNU").toUpperCase()}</span>;
}

export default function HomePage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [cards, setCards] = useState([]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [manualRunning, setManualRunning] = useState(false);
  const [manualMessage, setManualMessage] = useState("");

  async function loadStatus() {
    try {
      const response = await fetch("/api/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Impossible de récupérer le statut.");
      setStatus(data);
      setError("");
    } catch (err) {
      setError(err?.message || "Erreur réseau.");
    }
  }

  async function loadLists() {
    if (!manualSecret.trim()) {
      setManualMessage("Entre la valeur de CRON_SECRET pour charger le tableau source.");
      return;
    }

    setSourceLoading(true);
    setManualMessage("");
    setSelectedListId("");
    setSelectedCardId("");
    setCards([]);

    try {
      const response = await fetch("/api/source-cards", {
        headers: { "x-manual-secret": manualSecret.trim() },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Impossible de charger les listes source.");
      setLists(data.lists || []);
      setManualMessage(`${data.lists?.length || 0} liste(s) source chargée(s).`);
    } catch (err) {
      setManualMessage(err?.message || "Erreur de chargement.");
    } finally {
      setSourceLoading(false);
    }
  }

  async function loadCards(listId) {
    setSelectedListId(listId);
    setSelectedCardId("");
    setCards([]);
    if (!listId) return;

    if (!manualSecret.trim()) {
      setManualMessage("Entre d'abord la valeur de CRON_SECRET.");
      return;
    }

    setCardsLoading(true);
    setManualMessage("");
    try {
      const response = await fetch(`/api/source-cards?listId=${encodeURIComponent(listId)}`, {
        headers: { "x-manual-secret": manualSecret.trim() },
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Impossible de charger les cartes.");
      setCards(data.cards || []);
      setManualMessage(`${data.cards?.length || 0} carte(s) trouvée(s) dans cette liste.`);
    } catch (err) {
      setManualMessage(err?.message || "Erreur de chargement.");
    } finally {
      setCardsLoading(false);
    }
  }

  async function syncSelectedCard() {
    if (!manualSecret.trim()) {
      setManualMessage("Entre d'abord la valeur de CRON_SECRET.");
      return;
    }
    if (!selectedCardId) {
      setManualMessage("Sélectionne une carte à créer / synchroniser.");
      return;
    }

    setManualRunning(true);
    setManualMessage("Création et traduction de la carte en cours…");

    try {
      const response = await fetch("/api/manual-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-manual-secret": manualSecret.trim(),
        },
        body: JSON.stringify({ sourceCardId: selectedCardId }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "La synchronisation manuelle a échoué.");

      const action = data.cardsCreated > 0 ? "Carte créée" : data.cardsUpdated > 0 ? "Carte mise à jour" : "Carte déjà synchronisée";
      setManualMessage(`${action} : ${data.sourceCardName || "carte sélectionnée"}. ${data.translationsCreated || 0} traduction(s), ${data.attachmentsCreated || 0} pièce(s) jointe(s).`);
      await loadStatus();
    } catch (err) {
      setManualMessage(err?.message || "Erreur lors de la synchronisation.");
    } finally {
      setManualRunning(false);
    }
  }

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 30000);
    return () => clearInterval(timer);
  }, []);

  const progress = useMemo(() => {
    const done = Number(status?.cardsProcessed || 0);
    const limit = Math.max(1, Number(status?.limit || 30));
    return Math.min(100, Math.round((done / limit) * 100));
  }, [status]);

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) || null,
    [cards, selectedCardId]
  );

  return (
    <main className="page">
      <style jsx>{`
        .page { max-width: 1100px; margin: 0 auto; padding: 44px 22px 64px; }
        .hero { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; flex-wrap:wrap; margin-bottom:28px; }
        h1 { margin:0 0 8px; font-size:clamp(30px,5vw,46px); letter-spacing:-1px; }
        .sub { margin:0; color:var(--muted); max-width:760px; line-height:1.6; }
        .panel { background:rgba(17,19,27,.88); border:1px solid var(--border); border-radius:20px; padding:20px; backdrop-filter: blur(10px); }
        .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-top:16px; }
        .metric { padding:18px; background:var(--panel-2); border:1px solid var(--border); border-radius:16px; }
        .label { color:var(--muted); font-size:13px; margin-bottom:8px; }
        .value { font-size:28px; font-weight:800; }
        .row { display:flex; justify-content:space-between; gap:16px; align-items:center; flex-wrap:wrap; }
        .badge { display:inline-flex; align-items:center; padding:7px 10px; border-radius:999px; font-size:12px; font-weight:800; border:1px solid currentColor; }
        .badge.ok { color:var(--ok); background:rgba(63,213,138,.08); }
        .badge.warn { color:var(--warn); background:rgba(255,202,104,.08); }
        .badge.danger { color:var(--danger); background:rgba(255,112,112,.08); }
        .badge.muted { color:var(--muted); background:rgba(157,164,178,.08); }
        .sectionTitle { font-size:18px; font-weight:800; margin:0 0 12px; }
        .details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:16px; }
        .line { padding:14px 15px; border:1px solid var(--border); border-radius:14px; background:rgba(255,255,255,.02); }
        .line strong { display:block; margin-top:5px; }
        .progress { margin-top:16px; height:10px; border-radius:999px; background:#242836; overflow:hidden; }
        .progress > div { height:100%; background:linear-gradient(90deg,#7d5cff,#c47dff); width:${progress}%; transition:width .3s ease; }
        .notice { margin-top:16px; padding:14px 16px; border-radius:14px; border:1px solid rgba(255,112,112,.35); color:#ffd6d6; background:rgba(255,112,112,.08); }
        .mutedText { color:var(--muted); line-height:1.6; }
        .manual { margin-top:16px; }
        .fieldGrid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:14px; }
        .field { display:flex; flex-direction:column; gap:7px; }
        .field span { font-size:13px; color:var(--muted); }
        input, select, button { font:inherit; }
        input, select { width:100%; min-height:44px; border-radius:12px; border:1px solid var(--border); background:#12151d; color:#f5f7fb; padding:10px 12px; outline:none; }
        input:focus, select:focus { border-color:#8b6cff; box-shadow:0 0 0 3px rgba(139,108,255,.13); }
        button { min-height:44px; border-radius:12px; border:1px solid #8b6cff; background:linear-gradient(135deg,#7457ff,#a16cff); color:white; font-weight:800; padding:10px 16px; cursor:pointer; }
        button.secondary { background:#171a24; border-color:var(--border); }
        button:disabled { opacity:.55; cursor:not-allowed; }
        .actions { display:flex; gap:10px; flex-wrap:wrap; margin-top:14px; }
        .preview { margin-top:14px; padding:15px; border-radius:14px; border:1px solid var(--border); background:rgba(255,255,255,.02); }
        .previewTitle { font-weight:800; margin-bottom:6px; }
        .previewText { color:var(--muted); line-height:1.5; white-space:pre-wrap; max-height:180px; overflow:auto; }
        .successText { color:#9bf0c2; margin-top:12px; }
        @media (max-width: 820px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .details, .fieldGrid { grid-template-columns:1fr; } }
        @media (max-width: 520px) { .grid { grid-template-columns:1fr; } .page { padding:28px 14px 44px; } }
      `}</style>

      <section className="hero">
        <div>
          <h1>🥷 Ninja Time — Synchronisation</h1>
          <p className="sub">Suivi du tableau source Ninja Time et du tableau français. Le tableau est vérifié par l’API et le statut est actualisé automatiquement.</p>
        </div>
        <StatusBadge status={status?.status || "jamais exécuté"} />
      </section>

      <section className="panel">
        <div className="row">
          <div>
            <p className="sectionTitle">État actuel</p>
            <div className="mutedText">Dernière exécution : {formatDate(status?.lastRun)}</div>
          </div>
          <div className="mutedText">Limite par exécution : {status?.limit ?? 30} cartes</div>
        </div>

        <div className="grid">
          <div className="metric"><div className="label">Cartes traitées</div><div className="value">{status?.cardsProcessed ?? 0}</div></div>
          <div className="metric"><div className="label">Nouvelles cartes</div><div className="value">{status?.cardsCreated ?? 0}</div></div>
          <div className="metric"><div className="label">Cartes mises à jour</div><div className="value">{status?.cardsUpdated ?? 0}</div></div>
          <div className="metric"><div className="label">Traductions créées</div><div className="value">{status?.translationsCreated ?? 0}</div></div>
        </div>

        <div className="progress" aria-label="Progression de la dernière exécution"><div /></div>

        <div className="details">
          <div className="line"><span className="label">Pièces jointes</span><strong>{status?.attachmentsCreated ?? 0}</strong></div>
          <div className="line"><span className="label">Curseur liste / carte</span><strong>{status?.cursor?.list ?? 0} / {status?.cursor?.card ?? 0}</strong></div>
          <div className="line"><span className="label">Début</span><strong>{formatDate(status?.startedAt)}</strong></div>
          <div className="line"><span className="label">Fin</span><strong>{formatDate(status?.finishedAt)}</strong></div>
        </div>

        {error && <div className="notice">{error}</div>}
        {status?.error && <div className="notice">Erreur de synchronisation : {status.error}</div>}
      </section>

      <section className="panel manual">
        <p className="sectionTitle">🃏 Créer / traduire une carte manuellement</p>
        <p className="mutedText">Choisis directement une liste puis une carte du tableau source. Le système traduit le nom et la description, puis crée la carte dans la liste française correspondante. Si elle existe déjà, elle est mise à jour sans créer de doublon.</p>

        <div className="fieldGrid">
          <label className="field">
            <span>Clé d'accès manuel</span>
            <input type="password" value={manualSecret} onChange={(e) => setManualSecret(e.target.value)} placeholder="Valeur de CRON_SECRET" autoComplete="off" />
          </label>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <span>Tableau source</span>
            <button type="button" onClick={loadLists} disabled={sourceLoading}>{sourceLoading ? "Chargement…" : "Charger les listes source"}</button>
          </div>
        </div>

        <div className="fieldGrid">
          <label className="field">
            <span>Liste source</span>
            <select value={selectedListId} onChange={(e) => loadCards(e.target.value)} disabled={!lists.length || cardsLoading}>
              <option value="">Sélectionner une liste…</option>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Carte source</span>
            <select value={selectedCardId} onChange={(e) => setSelectedCardId(e.target.value)} disabled={!cards.length || cardsLoading}>
              <option value="">{cardsLoading ? "Chargement…" : "Sélectionner une carte…"}</option>
              {cards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
            </select>
          </label>
        </div>

        {selectedCard && (
          <div className="preview">
            <div className="previewTitle">Aperçu : {selectedCard.name}</div>
            <div className="previewText">{selectedCard.desc || "Cette carte n’a pas de description."}</div>
          </div>
        )}

        <div className="actions">
          <button type="button" onClick={syncSelectedCard} disabled={!selectedCardId || manualRunning}>{manualRunning ? "Création / traduction…" : "Créer et traduire cette carte"}</button>
          <button type="button" className="secondary" onClick={() => loadCards(selectedListId)} disabled={!selectedListId || cardsLoading}>Actualiser les cartes</button>
        </div>

        {manualMessage && <div className="successText">{manualMessage}</div>}
      </section>

      <section className="panel manual">
        <p className="sectionTitle">Automatisation</p>
        <p className="mutedText">Le traitement automatique continue de fonctionner avec le Cron Vercel et le moteur de synchronisation. La section ci-dessus permet de forcer immédiatement la création et la traduction d’une carte précise sans attendre le prochain passage automatique.</p>
      </section>
    </main>
  );
}
