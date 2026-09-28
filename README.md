# Ninja Time — Synchronisation FR

Projet Next.js pour synchroniser le tableau Trello source Ninja Time vers le tableau français.

## Variables Vercel

Conserver les variables existantes :

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TRELLO_KEY
- TRELLO_TOKEN
- SOURCE_BOARD_ID=wvkggmxv
- DEST_BOARD_ID=xCgaCQ32
- DEST_BOARD_NAME=Ninja Time — Français
- DEEPL_API_KEY
- DEEPL_API_URL=https://api-free.deepl.com/v2/translate
- CRON_SECRET
- MAX_CARDS_PER_RUN=30
- NEXT_PUBLIC_SITE_URL

## Synchronisation manuelle d'une carte

Le dashboard contient une section « Créer / traduire une carte manuellement ».
Elle utilise la même valeur que `CRON_SECRET`, saisie uniquement dans le navigateur et non enregistrée dans le projet.

Le parcours est :

1. saisir `CRON_SECRET` ;
2. charger les listes du tableau source ;
3. choisir une liste ;
4. choisir une carte ;
5. cliquer sur « Créer et traduire cette carte ».

La carte est créée dans la liste française correspondante. Si elle existe déjà, elle est mise à jour. Le moteur conserve aussi les labels, checklists, pièces jointes et traductions gérées par le projet.
