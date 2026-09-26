# Ninja Time — Trello → Français

Projet Next.js prêt pour Vercel + Supabase.

Le cron Vercel lance `/api/sync` une fois par jour à 03:00 UTC. Supabase conserve les correspondances, le cache de traduction et l'historique.

Synchronise : listes, nouvelles cartes, cartes modifiées, titres, descriptions, dates, labels, checklists et pièces jointes.

La traduction utilise DeepL si `DEEPL_API_KEY` est renseignée. Sans cette clé, le contenu source reste tel quel au lieu d'utiliser l'ancien endpoint Google qui provoquait les 429.

## Installation

1. Crée le projet Supabase.
2. Exécute `supabase/schema.sql` dans SQL Editor.
3. Mets le projet sur GitHub.
4. Importe le dépôt dans Vercel.
5. Ajoute les variables de `.env.example`.
6. Déploie en Production.
7. Vérifie `/api/status`.
8. Le cron lance automatiquement la synchronisation chaque jour.

Ne mets jamais `SUPABASE_SERVICE_ROLE_KEY`, `TRELLO_TOKEN`, `TRELLO_KEY`, `DEEPL_API_KEY` ou `CRON_SECRET` dans le code client ou GitHub.

`DEST_BOARD_ID` peut être laissé vide : le programme créera alors `Ninja Time — Français` et mémorisera son ID dans Supabase.

Pour un gros tableau, augmente progressivement `MAX_CARDS_PER_RUN`. Sur Vercel Hobby, garde le cron quotidien ; une fréquence supérieure nécessite un plan adapté ou Supabase pg_cron.
