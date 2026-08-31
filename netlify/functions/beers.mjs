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

async function getAllEntries() {
  const store = entriesStore();

  const { blobs } = await store.list();

  const entries = [];

  for (const blob of blobs) {
    const entry = await store.get(blob.key, {
      type: "json",
      consistency: "strong"
    });

    if (entry) {
      entries.push(entry);
    }
  }

  entries.sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return entries;
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);

    /*
    ==========================
    RÉCUPÉRATION D'UNE IMAGE
    ==========================
    */

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

      const image = await imagesStore().get(id, {
        type: "arrayBuffer",
        consistency: "strong"
      });

      if (!image) {
        return new Response("Image introuvable", {
          status: 404
        });
      }

      return new Response(image, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }

    /*
    ==========================
    LISTE DES BIÈRES
    ==========================
    */

    if (request.method === "GET") {
      const entries = await getAllEntries();

      return json({
        entries
      });
    }

    /*
    ==========================
    AJOUT / MODIFICATION
    ==========================
    */

    if (request.method === "POST") {
      const data = await request.json();

      /*
      AJOUT
      */

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
        Sécurité supplémentaire :
        la photo est déjà réduite par le navigateur,
        mais on limite malgré tout à 5 Mo.
        */

        if (bytes.length > 5_000_000) {
          return json(
            {
              error: "La photo est trop volumineuse."
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

        /*
        Stockage photo
        */

        const imageBlob = new Blob(
          [bytes],
          {
            type: "image/jpeg"
          }
        );

        await imagesStore().set(
          id,
          imageBlob,
          {
            metadata: {
              contentType: "image/jpeg"
            }
          }
        );

        /*
        Stockage informations
        */

        await entriesStore().setJSON(
          id,
          entry
        );

        return json(
          {
            success: true,
            entry
          },
          201
        );
      }

      /*
      MODIFICATION
      */

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

        const oldEntry = await entriesStore().get(
          id,
          {
            type: "json",
            consistency: "strong"
          }
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

          beerName: String(
            data.beerName || ""
          ).trim(),

          volumeLiters:
            Number(data.volumeLiters),

          abv:
            Number(data.abv),

          date:
            data.date,

          updatedAt:
            new Date().toISOString()
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

    /*
    ==========================
    SUPPRESSION
    ==========================
    */

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
  }

  catch (error) {
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