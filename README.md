# Ninja Time — synchronisation française

Projet Next.js / Vercel / Supabase pour synchroniser le tableau source :

- Source : https://trello.com/b/wvkggmxv/ninja-time-trello
- Destination : https://trello.com/b/xCgaCQ32/ninja-time-francais

Le moteur :

- détecte les nouvelles cartes dans toutes les listes ;
- évite les doublons avec `card_map` ;
- mémorise une progression dans `sync_state` ;
- traduit via DeepL avec cache Supabase ;
- synchronise labels, checklists, check items et pièces jointes ;
- expose `/api/status` pour le dashboard ;
- expose `/api/sync` pour le Cron Vercel ou un appel manuel authentifié.

## Déploiement

1. Importer le projet dans GitHub.
2. Connecter le dépôt à Vercel.
3. Ajouter les variables de `.env.example` dans Vercel.
4. Exécuter `supabase/schema.sql` dans le SQL Editor Supabase.
5. Redéployer.

Ne jamais ajouter `.env.local`, `TRELLO_TOKEN`, `TRELLO_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DEEPL_API_KEY` ou `CRON_SECRET` au dépôt GitHub.
