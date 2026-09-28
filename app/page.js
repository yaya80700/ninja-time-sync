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

  return (
    <span className={`badge ${kind}`}>
      {labels[normalized] || String(status || "INCONNU").toUpperCase()}
    </span>
  );
}

export default function HomePage() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");

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

  return (
    <main className="page">
      <style jsx>{`
        .page { max-width: 1100px; margin: 0 auto; padding: 44px 22px 64px; }
        .hero { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; flex-wrap:wrap; margin-bottom:28px; }
        h1 { margin:0 0 8px; font-size:clamp(30px,5vw,46px); letter-spacing:-1px; }
        .sub { margin:0; color:var(--muted); max-width:700px; line-height:1.6; }
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
        @media (max-width: 820px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .details { grid-template-columns:1fr; } }
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

      <section className="panel" style={{ marginTop: 16 }}>
        <p className="sectionTitle">Automatisation</p>
        <p className="mutedText">Le traitement est prévu par le Cron Vercel configuré dans <code>vercel.json</code>. Les nouvelles cartes sont recherchées dans toutes les listes avant la reprise des cartes déjà connues, afin qu’une carte ajoutée loin dans le tableau puisse être détectée au prochain passage.</p>
      </section>
    </main>
  );
}
