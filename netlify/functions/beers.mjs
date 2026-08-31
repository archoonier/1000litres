import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const entriesStore = () => getStore("beer1000-entries");
const imagesStore = () => getStore("beer1000-images");

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function validateEntry(data) {
  if (!["Nicolas", "Léo"].includes(data.drinker)) {
    return "Profil invalide.";
  }

  if (!String(data.beerName || "").trim()) {
    return "Le nom de la bière est obligatoire.";
  }

  const volume = Number(data.volumeLiters);

  if (!Number.isFinite(volume) || volume <= 0 || volume > 10) {
    return "Volume invalide.";
  }

  const abv = Number(data.abv);

  if (!Number.isFinite(abv) || abv < 0 || abv > 30) {
    return "Degré d'alcool invalide.";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date || ""))) {
    return "Date invalide.";
  }

  return null;
}

async function readJSON(store, key) {
  const result = await store.get(key, {
    type: "json",
    consistency: "strong"
  });

  if (!result) {
    return null;
  }

  return result.data;
}

async function getAllEntries() {
  const store = entriesStore();

  const { blobs } = await store.list();

  const entries = await Promise.all(
    blobs.map(async blob => {
      try {
        return await readJSON(store, blob.key);
      } catch (error) {
        console.error("Erreur lecture entrée", blob.key, error);
        return null;
      }
    })
  );

  return entries
    .filter(Boolean)
    .sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);

    /* ==========================
       IMAGE
    ========================== */

    if (
      request.method === "GET" &&
      url.searchParams.get("image") === "1"
    ) {
      const id = url.searchParams.get("id");

      if (!id) {
        return new Response("ID manquant", {
          status: 400
        });
      }

      const result = await imagesStore().get(id, {
        type: "arrayBuffer",
        consistency: "strong"
      });

      if (!result) {
        return new Response("Image introuvable", {
          status: 404
        });
      }

      return new Response(result.data, {
        status: 200,
        headers: {
          "Content-Type":
            result.metadata?.contentType || "image/jpeg",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }

    /* ==========================
       LISTE
    ========================== */

    if (request.method === "GET") {
      const entries = await getAllEntries();

      return json({
        entries
      });
    }

    /* ==========================
       AJOUT / MODIFICATION
    ========================== */

    if (request.method === "POST") {
      const data = await request.json();

      if (data.action === "create") {
        const validationError = validateEntry(data);

        if (validationError) {
          return json(
            {
              error: validationError
            },
            400
          );
        }

        const imageData = String(data.imageData || "");

        const match = imageData.match(
          /^data:image\/[^;]+;base64,(.+)$/
        );

        if (!match) {
          return json(
            {
              error: "Photo invalide."
            },
            400
          );
        }

        const bytes = Buffer.from(match[1], "base64");

        /*
        IMPORTANT :
        Netlify limite le payload total.
        On garde une marge de sécurité.
        */
        if (bytes.length > 3_500_000) {
          return json(
            {
              error:
                "La photo reste trop volumineuse après compression."
            },
            413
          );
        }

        const id = randomUUID();
        const now = new Date().toISOString();

        const entry = {
          id,
          beerName: String(data.beerName).trim(),
          drinker: data.drinker,
          volumeLiters: Number(data.volumeLiters),
          abv: Number(data.abv),
          date: data.date,
          createdAt: now,
          updatedAt: now
        };

        const imageBlob = new Blob([bytes], {
          type: "image/jpeg"
        });

        await imagesStore().set(id, imageBlob, {
          metadata: {
            contentType: "image/jpeg"
          }
        });

        await entriesStore().setJSON(id, entry);

        return json(
          {
            success: true,
            entry
          },
          201
        );
      }

      if (data.action === "update") {
        const id = String(data.id || "");

        if (!id) {
          return json(
            {
              error: "ID manquant."
            },
            400
          );
        }

        const oldEntry = await readJSON(
          entriesStore(),
          id
        );

        if (!oldEntry) {
          return json(
            {
              error: "Entrée introuvable."
            },
            404
          );
        }

        const updatedEntry = {
          ...oldEntry,
          beerName: String(data.beerName || "").trim(),
          volumeLiters: Number(data.volumeLiters),
          abv: Number(data.abv),
          date: data.date,
          updatedAt: new Date().toISOString()
        };

        const validationError =
          validateEntry(updatedEntry);

        if (validationError) {
          return json(
            {
              error: validationError
            },
            400
          );
        }

        await entriesStore().setJSON(
          id,
          updatedEntry
        );

        return json({
          success: true,
          entry: updatedEntry
        });
      }

      return json(
        {
          error: "Action inconnue."
        },
        400
      );
    }

    /* ==========================
       SUPPRESSION
    ========================== */

    if (request.method === "DELETE") {
      const data = await request.json();

      const id = String(data.id || "");

      if (!id) {
        return json(
          {
            error: "ID manquant."
          },
          400
        );
      }

      await entriesStore().delete(id);
      await imagesStore().delete(id);

      return json({
        success: true
      });
    }

    return json(
      {
        error: "Méthode HTTP non autorisée."
      },
      405
    );
  } catch (error) {
    console.error(error);

    return json(
      {
        error:
          "Erreur serveur : " +
          (error?.message || "inconnue")
      },
      500
    );
  }
}
