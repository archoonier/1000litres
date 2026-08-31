const API = "/api/beers";

let allEntries = [];

/* =========================
   OUTILS
========================= */

const $ = selector =>
    document.querySelector(selector);

const $$ = selector =>
    [...document.querySelectorAll(selector)];

function escapeHtml(value = "") {
    return String(value).replace(
        /[&<>"']/g,
        character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]
    );
}

function formatLiters(value, digits = 3) {
    return (
        Number(value || 0).toLocaleString(
            "fr-FR",
            {
                maximumFractionDigits: digits
            }
        ) + " L"
    );
}

function formatDate(value) {
    const date =
        new Date(
            value + "T12:00:00"
        );

    return date.toLocaleDateString(
        "fr-FR",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );
}

function showNotice(
    element,
    message,
    type = ""
) {
    if (!element) {
        return;
    }

    element.textContent =
        message;

    element.className =
        "notice " + type;

    element.hidden =
        false;
}

/* =========================
   API
========================= */

async function requestAPI(
    options = {}
) {
    const response =
        await fetch(
            API,
            options
        );

    let data = null;

    try {
        data =
            await response.json();
    }

    catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.error ||
            "Erreur " +
            response.status
        );
    }

    return data;
}

/* =========================
   CHARGEMENT
========================= */

async function loadEntries() {
    const data =
        await requestAPI();

    allEntries =
        data.entries || [];

    updateProgress();
}

/* =========================
   BARRE 1000 L
========================= */

function getGlobalTotal() {
    return allEntries.reduce(
        (total, entry) =>
            total +
            Number(
                entry.volumeLiters
            ),
        0
    );
}

function updateProgress() {
    const total =
        getGlobalTotal();

    const percentage =
        Math.min(
            100,
            (
                total /
                1000
            ) * 100
        );

    $$(
        "[data-total-liters]"
    ).forEach(element => {
        element.textContent =
            formatLiters(
                total
            );
    });

    $$(
        "[data-progress]"
    ).forEach(element => {
        element.style.width =
            percentage + "%";
    });

    $$(
        "[data-progress-percent]"
    ).forEach(element => {
        element.textContent =
            percentage
                .toFixed(3)
                .replace(".", ",")
            + " %";
    });

    $$(
        "[data-remaining]"
    ).forEach(element => {
        element.textContent =
            formatLiters(
                Math.max(
                    0,
                    1000 - total
                )
            );
    });
}

/* =========================
   STATISTIQUES
========================= */

function getStats(person) {
    const entries =
        allEntries.filter(
            entry =>
                entry.drinker ===
                person
        );

    const count =
        entries.length;

    const total =
        entries.reduce(
            (sum, entry) =>
                sum +
                Number(
                    entry.volumeLiters
                ),
            0
        );

    const averageVolume =
        count
            ? total / count
            : 0;

    const averageABV =
        count
            ? entries.reduce(
                (sum, entry) =>
                    sum +
                    Number(
                        entry.abv
                    ),
                0
            ) / count
            : 0;

    /*
    Bière préférée =
    bière la plus souvent bue.

    On normalise le nom pour éviter
    que "Chouffe" et "chouffe"
    soient considérées comme
    deux bières différentes.
    */

    const beerCount = {};
    const beerDisplayNames = {};

    entries.forEach(entry => {
        const originalName =
            String(
                entry.beerName || ""
            ).trim();

        const normalizedName =
            originalName
                .toLocaleLowerCase(
                    "fr-FR"
                );

        if (!normalizedName) {
            return;
        }

        beerCount[normalizedName] =
            (
                beerCount[
                    normalizedName
                ]
                || 0
            ) + 1;

        if (
            !beerDisplayNames[
                normalizedName
            ]
        ) {
            beerDisplayNames[
                normalizedName
            ] = originalName;
        }
    });

    let favorite =
        "—";

    const names =
        Object.keys(
            beerCount
        );

    if (names.length) {
        const maximum =
            Math.max(
                ...Object.values(
                    beerCount
                )
            );

        const winners =
            names.filter(
                name =>
                    beerCount[name]
                    === maximum
            );

        favorite =
            winners
                .map(
                    name =>
                        beerDisplayNames[
                            name
                        ]
                )
                .join(" / ");
    }

    return {
        count,
        total,
        averageVolume,
        averageABV,
        favorite
    };
}

function renderStats(person) {
    const stats =
        getStats(person);

    $("#stat-count").textContent =
        stats.count;

    $("#stat-total").textContent =
        formatLiters(
            stats.total
        );

    $("#stat-volume").textContent =
        stats.count
            ? (
                stats.averageVolume
                * 100
            )
                .toFixed(1)
                .replace(".", ",")
                + " cL"
            : "—";

    $("#stat-abv").textContent =
        stats.count
            ? stats.averageABV
                .toFixed(2)
                .replace(".", ",")
                + " %"
            : "—";

    $("#stat-favorite").textContent =
        stats.favorite;
}

/* =========================
   IMAGE
========================= */

async function compressImage(file) {
    if (
        !file.type.startsWith(
            "image/"
        )
    ) {
        throw new Error(
            "Le fichier sélectionné n'est pas une image."
        );
    }

    /*
    Charge l'image.
    */
    const bitmap =
        await createImageBitmap(
            file
        );

    /*
    1200 px maximum sur le côté
    le plus long.

    C'est largement suffisant
    pour l'affichage dans la galerie.
    */
    const maxSize =
        1200;

    const scale =
        Math.min(
            1,
            maxSize /
            Math.max(
                bitmap.width,
                bitmap.height
            )
        );

    const canvas =
        document.createElement(
            "canvas"
        );

    canvas.width =
        Math.max(
            1,
            Math.round(
                bitmap.width *
                scale
            )
        );

    canvas.height =
        Math.max(
            1,
            Math.round(
                bitmap.height *
                scale
            )
        );

    const context =
        canvas.getContext(
            "2d"
        );

    if (!context) {
        throw new Error(
            "Impossible de préparer la photo."
        );
    }

    context.drawImage(
        bitmap,
        0,
        0,
        canvas.width,
        canvas.height
    );

    /*
    On libère la bitmap si
    le navigateur le permet.
    */
    if (
        typeof bitmap.close ===
        "function"
    ) {
        bitmap.close();
    }

    /*
    JPEG qualité de départ 70 %.
    */
    let quality =
        0.70;

    let result =
        canvas.toDataURL(
            "image/jpeg",
            quality
        );

    /*
    Si l'image reste volumineuse,
    on réduit progressivement
    la qualité.
    */

    while (
        result.length >
            2_500_000
        &&
        quality > 0.35
    ) {
        quality -=
            0.10;

        result =
            canvas.toDataURL(
                "image/jpeg",
                quality
            );
    }

    /*
    Sécurité supplémentaire
    pour éviter les payloads
    trop gros vers Netlify.
    */

    if (
        result.length >
        3_500_000
    ) {
        throw new Error(
            "La photo reste trop volumineuse. Essaie une photo plus petite."
        );
    }

    return result;
}

/* =========================
   FORMULAIRE ACCUEIL
========================= */

function setupUploadForm() {
    const form =
        $("#beer-form");

    if (!form) {
        return;
    }

    const fileInput =
        $("#photo");

    const preview =
        $("#photo-preview");

    const hint =
        $("#photo-hint");

    let imageData =
        null;

    /*
    Date du jour par défaut.
    */

    $("#date").value =
        new Date()
            .toISOString()
            .slice(
                0,
                10
            );

    /*
    Choix photo
    */

    fileInput.addEventListener(
        "change",
        async () => {
            try {
                const file =
                    fileInput.files[0];

                if (!file) {
                    return;
                }

                imageData =
                    null;

                preview.hidden =
                    true;

                hint.hidden =
                    false;

                hint.textContent =
                    "Préparation de la photo...";

                imageData =
                    await compressImage(
                        file
                    );

                preview.src =
                    imageData;

                preview.hidden =
                    false;

                hint.hidden =
                    true;

                const notice =
                    $("#form-notice");

                if (notice) {
                    notice.hidden =
                        true;
                }
            }

            catch (error) {
                imageData =
                    null;

                fileInput.value =
                    "";

                preview.src =
                    "";

                preview.hidden =
                    true;

                hint.hidden =
                    false;

                hint.innerHTML =
                    "📷<br>CLIQUE ICI POUR AJOUTER LA PHOTO";

                showNotice(
                    $("#form-notice"),
                    error.message,
                    "error"
                );
            }
        }
    );

    /*
    Envoi formulaire
    */

    form.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            const button =
                $("#submit-beer");

            try {
                if (!imageData) {
                    throw new Error(
                        "Ajoute une photo de la bière."
                    );
                }

                const volumeValue =
                    Number(
                        $("#volume").value
                    );

                const volumeUnit =
                    $("#volume-unit").value;

                let volumeLiters;

                if (
                    volumeUnit === "ml"
                ) {
                    volumeLiters =
                        volumeValue /
                        1000;
                }

                else if (
                    volumeUnit === "cl"
                ) {
                    volumeLiters =
                        volumeValue /
                        100;
                }

                else {
                    volumeLiters =
                        volumeValue;
                }

                if (
                    !Number.isFinite(
                        volumeLiters
                    )
                    ||
                    volumeLiters <= 0
                ) {
                    throw new Error(
                        "Le volume indiqué est invalide."
                    );
                }

                const abv =
                    Number(
                        $("#abv").value
                    );

                if (
                    !Number.isFinite(
                        abv
                    )
                ) {
                    throw new Error(
                        "Le degré d'alcool est invalide."
                    );
                }

                button.disabled =
                    true;

                button.textContent =
                    "ENVOI...";

                showNotice(
                    $("#form-notice"),
                    "Envoi de la bière...",
                    ""
                );

                await requestAPI({
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            action:
                                "create",

                            beerName:
                                $("#beer-name")
                                    .value
                                    .trim(),

                            drinker:
                                $("#drinker")
                                    .value,

                            volumeLiters,

                            abv,

                            date:
                                $("#date")
                                    .value,

                            imageData
                        })
                });

                /*
                Reset
                */

                form.reset();

                imageData =
                    null;

                preview.src =
                    "";

                preview.hidden =
                    true;

                hint.hidden =
                    false;

                hint.innerHTML =
                    "📷<br>CLIQUE ICI POUR AJOUTER LA PHOTO";

                $("#date").value =
                    new Date()
                        .toISOString()
                        .slice(
                            0,
                            10
                        );

                showNotice(
                    $("#form-notice"),
                    "Bière ajoutée ! 🍺",
                    "success"
                );

                /*
                Recharge immédiatement
                les données.
                */

                await loadEntries();

                renderHomeStats();
            }

            catch (error) {
                showNotice(
                    $("#form-notice"),
                    error.message,
                    "error"
                );
            }

            finally {
                button.disabled =
                    false;

                button.textContent =
                    "AJOUTER LA BIÈRE";
            }
        }
    );
}

/* =========================
   MINI STATS ACCUEIL
========================= */

function renderHomeStats() {
    if (!$("#home-nicolas")) {
        return;
    }

    const nicolas =
        getStats(
            "Nicolas"
        );

    const leo =
        getStats(
            "Léo"
        );

    $("#home-nicolas").textContent =
        formatLiters(
            nicolas.total
        );

    $("#home-leo").textContent =
        formatLiters(
            leo.total
        );

    $("#home-count").textContent =
        allEntries.length;

    const sorted =
        [...allEntries].sort(
            (a, b) =>
                new Date(
                    b.createdAt
                )
                -
                new Date(
                    a.createdAt
                )
        );

    $("#home-last").textContent =
        sorted.length
            ? sorted[0].beerName
            : "—";
}

/* =========================
   CARTES DE BIÈRE
========================= */

function createEntryHTML(
    entry
) {
    return `
        <article class="entry">

            <div
                class="entry-photo-container"
            >

                <img
                    class="entry-photo"
                    src="${API}?id=${encodeURIComponent(entry.id)}&image=1"
                    alt="${escapeHtml(entry.beerName)}"
                    loading="lazy"
                >

            </div>

            <div class="entry-body">

                <div
                    class="entry-title"
                >
                    ${escapeHtml(entry.beerName)}
                </div>

                <div
                    class="entry-meta"
                >

                    🍺
                    ${formatLiters(entry.volumeLiters)}

                    <br>

                    ⚗️
                    ${Number(entry.abv).toLocaleString("fr-FR")}
                    % vol.

                    <br>

                    📅
                    ${formatDate(entry.date)}

                </div>

                <div
                    class="entry-actions"
                >

                    <button
                        class="secondary"
                        data-edit="${entry.id}"
                    >
                        MODIFIER
                    </button>

                    <button
                        class="danger"
                        data-delete="${entry.id}"
                    >
                        EFFACER
                    </button>

                </div>

            </div>

        </article>
    `;
}

/* =========================
   GALERIE PERSONNELLE
========================= */

function renderGallery(person) {
    const gallery =
        $("#gallery");

    if (!gallery) {
        return;
    }

    const entries =
        allEntries
            .filter(
                entry =>
                    entry.drinker ===
                    person
            )
            .sort(
                (a, b) =>
                    new Date(
                        b.date
                    )
                    -
                    new Date(
                        a.date
                    )
            );

    if (!entries.length) {
        gallery.innerHTML = `
            <div class="empty">
                Aucune bière enregistrée
                pour le moment :(
            </div>
        `;

        return;
    }

    gallery.innerHTML =
        entries
            .map(
                createEntryHTML
            )
            .join("");

    /*
    Boutons Modifier
    */

    $$("[data-edit]")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    openEditModal(
                        button.dataset.edit
                    );
                }
            );
        });

    /*
    Boutons Supprimer
    */

    $$("[data-delete]")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    deleteEntry(
                        button.dataset.delete,
                        person
                    );
                }
            );
        });
}

/* =========================
   MODIFICATION
========================= */

function openEditModal(id) {
    const entry =
        allEntries.find(
            item =>
                item.id === id
        );

    if (!entry) {
        return;
    }

    $("#edit-id").value =
        entry.id;

    $("#edit-name").value =
        entry.beerName;

    /*
    Stocké en litres.
    Affiché en cL.
    */

    $("#edit-volume").value =
        (
            Number(
                entry.volumeLiters
            ) * 100
        ).toFixed(1);

    $("#edit-abv").value =
        entry.abv;

    $("#edit-date").value =
        entry.date;

    const notice =
        $("#edit-notice");

    if (notice) {
        notice.hidden =
            true;
    }

    $("#edit-modal")
        .classList
        .add(
            "open"
        );
}

function setupEditForm(person) {
    const modal =
        $("#edit-modal");

    if (!modal) {
        return;
    }

    /*
    Fermeture X
    */

    $("#close-modal")
        .addEventListener(
            "click",
            () => {
                modal
                    .classList
                    .remove(
                        "open"
                    );
            }
        );

    /*
    Clic extérieur
    */

    modal.addEventListener(
        "click",
        event => {
            if (
                event.target ===
                modal
            ) {
                modal
                    .classList
                    .remove(
                        "open"
                    );
            }
        }
    );

    /*
    Sauvegarde
    */

    $("#edit-form")
        .addEventListener(
            "submit",
            async event => {
                event.preventDefault();

                const submitButton =
                    event.currentTarget.querySelector(
                        'button[type="submit"]'
                    );

                try {
                    if (submitButton) {
                        submitButton.disabled =
                            true;

                        submitButton.textContent =
                            "ENREGISTREMENT...";
                    }

                    await requestAPI({
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                action:
                                    "update",

                                id:
                                    $("#edit-id")
                                        .value,

                                beerName:
                                    $("#edit-name")
                                        .value
                                        .trim(),

                                volumeLiters:
                                    Number(
                                        $("#edit-volume")
                                            .value
                                    ) / 100,

                                abv:
                                    Number(
                                        $("#edit-abv")
                                            .value
                                    ),

                                date:
                                    $("#edit-date")
                                        .value
                            })
                    });

                    modal
                        .classList
                        .remove(
                            "open"
                        );

                    await loadEntries();

                    renderGallery(
                        person
                    );
                }

                catch (error) {
                    showNotice(
                        $("#edit-notice"),
                        error.message,
                        "error"
                    );
                }

                finally {
                    if (submitButton) {
                        submitButton.disabled =
                            false;

                        submitButton.textContent =
                            "ENREGISTRER";
                    }
                }
            }
        );
}

/* =========================
   SUPPRESSION
========================= */

async function deleteEntry(
    id,
    person
) {
    const entry =
        allEntries.find(
            item =>
                item.id === id
        );

    if (!entry) {
        return;
    }

    const confirmed =
        confirm(
            `Effacer définitivement "${entry.beerName}" ?`
        );

    if (!confirmed) {
        return;
    }

    try {
        await requestAPI({
            method:
                "DELETE",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body:
                JSON.stringify({
                    id
                })
        });

        await loadEntries();

        renderGallery(
            person
        );
    }

    catch (error) {
        alert(
            error.message
        );
    }
}

/* =========================
   DÉMARRAGE
========================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        try {
            await loadEntries();

            const page =
                document.body.dataset.page;

            if (
                page === "home"
            ) {
                setupUploadForm();

                renderHomeStats();
            }

            else if (
                page ===
                "stats-nicolas"
            ) {
                renderStats(
                    "Nicolas"
                );
            }

            else if (
                page ===
                "stats-leo"
            ) {
                renderStats(
                    "Léo"
                );
            }

            else if (
                page ===
                "nicolas"
            ) {
                renderGallery(
                    "Nicolas"
                );

                setupEditForm(
                    "Nicolas"
                );
            }

            else if (
                page ===
                "leo"
            ) {
                renderGallery(
                    "Léo"
                );

                setupEditForm(
                    "Léo"
                );
            }
        }

        catch (error) {
            showNotice(
                $("#global-error"),
                "Impossible de charger les données : "
                + error.message,
                "error"
            );
        }
    }
);
