"use client";

import { useEffect, useState } from "react";

export default function Home() {
const [status, setStatus] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);
const [lastRefresh, setLastRefresh] = useState(null);

async function loadStatus() {
try {
setLoading(true);
setError(null);

```
  const response = await fetch("/api/status", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Impossible de récupérer le statut.");
  }

  const data = await response.json();

  setStatus(data);
  setLastRefresh(new Date());
} catch (err) {
  console.error(err);
  setError(err.message || "Erreur inconnue.");
} finally {
  setLoading(false);
}
```

}

useEffect(() => {
loadStatus();

```
const interval = setInterval(() => {
  loadStatus();
}, 30000);

return () => clearInterval(interval);
```

}, []);

const isSuccess = status?.status === "success";
const isRunning = status?.status === "running";
const isError = status?.status === "error";

return (
<main
style={{
minHeight: "100vh",
background: "#080d1d",
color: "#ffffff",
padding: "50px 20px",
fontFamily:
"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
}}
>
<div
style={{
maxWidth: 1000,
margin: "0 auto",
}}
>
<header style={{ marginBottom: 30 }}>
<div
style={{
display: "flex",
justifyContent: "space-between",
alignItems: "center",
gap: 20,
flexWrap: "wrap",
}}
> <div>
<h1
style={{
margin: 0,
fontSize: 34,
fontWeight: 800,
}}
>
🥷 Ninja Time — Synchronisation </h1>

```
          <p
            style={{
              marginTop: 10,
              color: "#aab4cc",
              fontSize: 16,
            }}
          >
            Synchronisation automatique Trello → tableau français.
          </p>
        </div>

        <button
          onClick={loadStatus}
          disabled={loading}
          style={{
            border: "1px solid #33415f",
            background: loading ? "#182038" : "#1c2948",
            color: "#ffffff",
            padding: "12px 18px",
            borderRadius: 10,
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {loading ? "⏳ Actualisation..." : "🔄 Actualiser"}
        </button>
      </div>
    </header>

    {error && (
      <section
        style={{
          background: "#351b25",
          border: "1px solid #7f3045",
          borderRadius: 16,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h2 style={{ marginTop: 0 }}>❌ Erreur</h2>
        <p style={{ marginBottom: 0 }}>{error}</p>
      </section>
    )}

    <section
      style={{
        background: "#151d33",
        borderRadius: 18,
        padding: 28,
        marginBottom: 20,
        border: "1px solid #202b48",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 15,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>
            État de la synchronisation
          </h2>

          <p
            style={{
              color: "#9da9c4",
              marginBottom: 0,
            }}
          >
            État actuel du système Trello → Trello français.
          </p>
        </div>

        <div
          style={{
            padding: "9px 14px",
            borderRadius: 999,
            background: isSuccess
              ? "#123b2a"
              : isRunning
              ? "#3b3212"
              : isError
              ? "#421b27"
              : "#252d42",
            color: isSuccess
              ? "#61e6a5"
              : isRunning
              ? "#ffd76a"
              : isError
              ? "#ff8299"
              : "#b9c2d8",
            fontWeight: 800,
          }}
        >
          {loading
            ? "⏳ Chargement"
            : isSuccess
            ? "🟢 Opérationnelle"
            : isRunning
            ? "🟡 En cours"
            : isError
            ? "🔴 Erreur"
            : "⚪ Jamais exécutée"}
        </div>
      </div>

      <div
        style={{
          marginTop: 25,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 15,
        }}
      >
        <Stat
          title="Statut"
          value={
            loading
              ? "Chargement..."
              : status?.status || "Jamais exécutée"
          }
          icon="⚙️"
        />

        <Stat
          title="Dernière synchronisation"
          value={
            status?.lastRunAt
              ? new Date(status.lastRunAt).toLocaleString("fr-FR")
              : "Jamais"
          }
          icon="🕐"
        />

        <Stat
          title="Cartes traitées"
          value={status?.cardsProcessed ?? 0}
          icon="📦"
        />

        <Stat
          title="Cartes créées"
          value={status?.cardsCreated ?? 0}
          icon="➕"
        />

        <Stat
          title="Cartes mises à jour"
          value={status?.cardsUpdated ?? 0}
          icon="🔄"
        />

        <Stat
          title="Traductions"
          value={status?.translationsCreated ?? 0}
          icon="🌍"
        />

        <Stat
          title="Pièces jointes"
          value={status?.attachmentsCreated ?? 0}
          icon="📎"
        />

        <Stat
          title="Limite par exécution"
          value="30 cartes"
          icon="🎯"
        />
      </div>

      {status?.error && (
        <div
          style={{
            marginTop: 20,
            padding: 15,
            background: "#351b25",
            border: "1px solid #7f3045",
            borderRadius: 10,
            color: "#ff9bad",
          }}
        >
          <strong>Erreur :</strong> {status.error}
        </div>
      )}
    </section>

    <section
      style={{
        background: "#151d33",
        borderRadius: 18,
        padding: 28,
        marginBottom: 20,
        border: "1px solid #202b48",
      }}
    >
      <h2 style={{ marginTop: 0 }}>
        🤖 Automatisation
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 15,
          marginTop: 20,
        }}
      >
        <div
          style={{
            background: "#0e1528",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div
            style={{
              color: "#8996b2",
              fontSize: 13,
            }}
          >
            FRÉQUENCE
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: 20,
              fontWeight: 800,
            }}
          >
            Tous les jours
          </div>
        </div>

        <div
          style={{
            background: "#0e1528",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div
            style={{
              color: "#8996b2",
              fontSize: 13,
            }}
          >
            PROCHAINE EXÉCUTION
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: 20,
              fontWeight: 800,
            }}
          >
            03:00 UTC
          </div>
        </div>

        <div
          style={{
            background: "#0e1528",
            borderRadius: 12,
            padding: 18,
          }}
        >
          <div
            style={{
              color: "#8996b2",
              fontSize: 13,
            }}
          >
            CRON VERCEL
          </div>

          <div
            style={{
              marginTop: 6,
              fontSize: 20,
              fontWeight: 800,
              color: "#61e6a5",
            }}
          >
            🟢 Actif
          </div>
        </div>
      </div>
    </section>

    <footer
      style={{
        textAlign: "center",
        color: "#66728c",
        fontSize: 13,
        marginTop: 25,
      }}
    >
      {lastRefresh
        ? `Dernière vérification de l'état : ${lastRefresh.toLocaleTimeString(
            "fr-FR"
          )}`
        : "Vérification de l'état..."}
    </footer>
  </div>
</main>
```

);
}

function Stat({ title, value, icon }) {
return (
<div
style={{
background: "#0e1528",
borderRadius: 12,
padding: 18,
border: "1px solid #1e2942",
}}
>
<div
style={{
fontSize: 13,
color: "#8996b2",
textTransform: "uppercase",
letterSpacing: 0.5,
}}
>
{icon} {title} </div>

```
  <div
    style={{
      marginTop: 8,
      fontSize: 21,
      fontWeight: 800,
      wordBreak: "break-word",
    }}
  >
    {value}
  </div>
</div>
```

);
}
