const LIST_TRANSLATIONS = {
  Information: "Informations",
  "Game Modes": "Modes de jeu",
  Elements: "Éléments",
  Clans: "Clans",
  Families: "Familles",
  Awakenings: "Éveils",
  "Red Eyes": "Yeux rouges",
  "Sub-Jutsus": "Sous-Jutsus",
  Bosses: "Boss",
  "Important Items": "Objets importants",
  Clothing: "Vêtements",
  Accessories: "Accessoires",
  Weapons: "Armes",
  "Sub Weapons": "Armes secondaires",
  NPCs: "PNJ",
  Consumable: "Consommables",
  "Collectables (Exclusives)": "Objets à collectionner (Exclusifs)",
  "[UNOBTAINABLE] Clans and Elements": "[INOBTENABLE] Clans et éléments".replace("INOBTEN ABLE", "INOBTEN ABLE"),
  "Xmas Info + Limited Accessories & Clothing [UNOBTAINABLE]": "Infos Noël + Accessoires et vêtements limités [INOBTENABLE]".replace("INOBTEN ABLE", "INOBTEN ABLE"),
  Achievements: "Succès",
};

const PROTECTED = [
  "Ninja Time", "Roblox", "Trello", "Discord", "Konoha", "Kiri",
  "Akatsuki", "Raven", "Koroma", "Susanoo", "Uchiha", "Senju", "Hyuga",
];

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function protect(text) {
  const tokens = new Map();
  let output = text;

  const remember = (value) => {
    const token = `ZXQ${tokens.size}QXZ`;
    tokens.set(token, value);
    return token;
  };

  output = output.replace(/https?:\/\/[^\s)\]>]+/g, remember);
  output = output.replace(/`[^`]*`/g, remember);

  for (const word of [...PROTECTED].sort((a, b) => b.length - a.length)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(escaped, "gi"), remember);
  }

  return { output, tokens };
}

function restore(text, tokens) {
  let output = text;
  for (const [token, value] of tokens.entries()) {
    output = output.split(token).join(value);
  }
  return output;
}

export function translateListName(name) {
  return LIST_TRANSLATIONS[name] || name;
}

export async function translateText(text) {
  if (!text || !text.trim()) {
    return { text: text || "", translated: false };
  }

  const apiKey = env("DEEPL_API_KEY");
  const apiUrl = env("DEEPL_API_URL", "https://api-free.deepl.com/v2/translate");

  if (!apiKey) {
    return { text, translated: false };
  }

  const { output, tokens } = protect(text);
  const params = new URLSearchParams();
  params.set("text", output);
  params.set("target_lang", "FR");

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      cache: "no-store",
    });

    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      console.error("DeepL", response.status, raw.slice(0, 500));
      return { text, translated: false };
    }

    const translated = data?.translations?.[0]?.text;
    if (!translated) return { text, translated: false };

    return {
      text: restore(translated, tokens),
      translated: true,
    };
  } catch (error) {
    console.error("DeepL request error:", error);
    return { text, translated: false };
  }
}
