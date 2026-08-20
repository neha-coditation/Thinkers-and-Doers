(() => {
  "use strict";

  /*
   * Thinkers & Doers
   * Contentful-compatible + content.json fallback
   *
   * Current Contentful models:
   * Episode:
   *   name, description, episodeDate, status[], episodeNumber,
   *   format, durationMinutes, watchUrl, stillImage, guests[]
   *
   * Guest:
   *   name, headline, bio, headshot, socialLinks[]
   *
   * SocialLink:
   *   provider[], url
   */

  const CONFIG = window.CONTENTFUL_CONFIG || {
    spaceId: "",
    environment: "master",
    deliveryToken: "",
    contentType: "episode",
    enabled: false
  };

  const CONTENT_URL = "content.json";

  const $ = (selector, root = document) => root.querySelector(selector);

  const escapeHTML = (value = "") =>
    String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));

  function getStatus(episode) {
    const status = episode?.status;

    if (Array.isArray(status)) {
      return status[0] || "";
    }

    return status || "";
  }

  function getImageUrl(image) {
    if (!image) return "";

    // Local content.json image path
    if (typeof image === "string") {
      if (image.startsWith("//")) return "https:" + image;
      return image;
    }

    // Contentful linked asset after normalization
    if (image.url) {
      return image.url.startsWith("//") ? "https:" + image.url : image.url;
    }

    return "";
  }

  function getSocialProvider(link) {
    if (!link) return "";

    if (Array.isArray(link.provider)) {
      return link.provider[0] || "";
    }

    return link.provider || "";
  }

  function normalizeFallback(data) {
    const episodes = Array.isArray(data?.episodes) ? data.episodes : [];

    return {
      episodes: episodes.map(normalizeEpisode)
    };
  }

  function normalizeEpisode(episode) {
    const guests = Array.isArray(episode?.guests)
      ? episode.guests.map(normalizeGuest)
      : [];

    return {
      id: episode?.id || "",
      name: episode?.name || episode?.title || "",
      description: episode?.description || "",
      episodeDate: episode?.episodeDate || null,
      status: Array.isArray(episode?.status)
        ? episode.status
        : [episode?.status || ""],
      episodeNumber: Number(
        episode?.episodeNumber ??
        episode?.number ??
        0
      ),
      format: episode?.format || "Conversation",
      durationMinutes:
        episode?.durationMinutes ??
        episode?.duration ??
        null,
      watchUrl: episode?.watchUrl || "#",
      stillImage: getImageUrl(
        episode?.stillImage || episode?.image || ""
      ),
      guests
    };
  }

  function normalizeGuest(guest) {
    const socialLinks = Array.isArray(guest?.socialLinks)
      ? guest.socialLinks.map(link => ({
          provider: getSocialProvider(link),
          url: link?.url || "#"
        }))
      : [];

    return {
      id: guest?.id || "",
      name: guest?.name || "",
      headline: guest?.headline || "",
      bio: guest?.bio || "",
      headshot: getImageUrl(
        guest?.headshot || guest?.image || ""
      ),
      socialLinks
    };
  }

  async function loadFallback() {
    const response = await fetch(CONTENT_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `Could not load ${CONTENT_URL} (${response.status})`
      );
    }

    const data = await response.json();
    return normalizeFallback(data);
  }

  async function loadContentful() {
    if (
      !CONFIG.enabled ||
      !CONFIG.spaceId ||
      !CONFIG.deliveryToken
    ) {
      return null;
    }

    const environment = CONFIG.environment || "master";

    const endpoint =
      `https://cdn.contentful.com/spaces/` +
      `${encodeURIComponent(CONFIG.spaceId)}/environments/` +
      `${encodeURIComponent(environment)}/entries`;

    const params = new URLSearchParams({
      access_token: CONFIG.deliveryToken,
      content_type: CONFIG.contentType || "episode",
      include: "3",
      limit: "1000"
    });

    const response = await fetch(
      `${endpoint}?${params.toString()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(
        `Contentful returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    return normalizeContentful(data);
  }

  function normalizeContentful(data) {
    const includedEntries =
      data?.includes?.Entry || [];

    const includedAssets =
      data?.includes?.Asset || [];

    const entries = new Map(
      includedEntries.map(entry => [entry.sys.id, entry])
    );

    const assets = new Map(
      includedAssets.map(asset => [asset.sys.id, asset])
    );

    function resolveAsset(link) {
      const assetId = link?.sys?.id;

      if (!assetId) return "";

      const asset = assets.get(assetId);

      const url =
        asset?.fields?.file?.url || "";

      if (!url) return "";

      return url.startsWith("//")
        ? "https:" + url
        : url;
    }

    function resolveGuest(link) {
      const guestId = link?.sys?.id;
      const guest = entries.get(guestId);

      if (!guest) return null;

      const fields = guest.fields || {};

      const socialLinks = Array.isArray(fields.socialLinks)
        ? fields.socialLinks
            .map(link => {
              const social = entries.get(link?.sys?.id);

              if (!social) return null;

              return {
                provider: getSocialProvider(
                  social.fields || {}
                ),
                url: social.fields?.url || "#"
              };
            })
            .filter(Boolean)
        : [];

      return {
        id: guest.sys.id,
        name: fields.name || "",
        headline: fields.headline || "",
        bio: fields.bio || "",
        headshot: resolveAsset(fields.headshot),
        socialLinks
      };
    }

    const episodes = (data?.items || []).map(item => {
      const fields = item.fields || {};

      const guests = Array.isArray(fields.guests)
        ? fields.guests
            .map(resolveGuest)
            .filter(Boolean)
        : [];

      return {
        id: item.sys.id,
        name: fields.name || "",
        description: fields.description || "",
        episodeDate: fields.episodeDate || null,
        status: Array.isArray(fields.status)
          ? fields.status
          : [fields.status || ""],
        episodeNumber: Number(
          fields.episodeNumber || 0
        ),
        format: fields.format || "Conversation",
        durationMinutes:
          fields.durationMinutes ?? null,
        watchUrl: fields.watchUrl || "#",
        stillImage: resolveAsset(fields.stillImage),
        guests
      };
    });

    return { episodes };
  }

  function isPublic(episode) {
    return getStatus(episode) === "public";
  }

  function isUpcoming(episode) {
    return getStatus(episode) === "upcoming";
  }

  function sortByNumberDescending(a, b) {
    return (
      Number(b.episodeNumber || 0) -
      Number(a.episodeNumber || 0)
    );
  }

  function sortByNumberAscending(a, b) {
    return (
      Number(a.episodeNumber || 0) -
      Number(b.episodeNumber || 0)
    );
  }

  function guestAvatar(guest, light = false) {
    const className = light
      ? "td-guest-avatar td-light-avatar"
      : "td-guest-avatar";

    if (guest.headshot) {
      return `
        <img
          class="${className}"
          src="${escapeHTML(guest.headshot)}"
          alt="${escapeHTML(guest.name)}"
          loading="lazy"
        >
      `;
    }

    return `<span class="${className}"></span>`;
  }

  function socialIcon(provider) {
    const name = String(provider || "").toLowerCase();

    if (name === "linkedin") return "in";
    if (name === "x") return "𝕏";
    if (name === "youtube") return "▶";
    if (name === "instagram") return "◎";
    if (name === "facebook") return "f";

    return "↗";
  }

  function renderSocialLinks(guest) {
    if (!guest.socialLinks?.length) return "";

    return `
      <div style="
        display:flex;
        gap:8px;
        margin-top:10px;
      ">
        ${guest.socialLinks.map(link => `
          <a
            href="${escapeHTML(link.url || "#")}"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="${escapeHTML(link.provider)}"
            style="
              width:30px;
              height:30px;
              border:1px solid rgba(242,240,234,.25);
              display:flex;
              align-items:center;
              justify-content:center;
              color:#F2F0EA;
              text-decoration:none;
              font-family:'IBM Plex Mono',monospace;
              font-size:11px;
            "
          >${escapeHTML(socialIcon(link.provider))}</a>
        `).join("")}
      </div>
    `;
  }

  function renderLatest(episode) {
    const media = $("#latest-media");
    const content = $("#latest-content");

    if (!media || !content) return;

    const image = episode.stillImage
      ? `
        <img
          src="${escapeHTML(episode.stillImage)}"
          alt="${escapeHTML(episode.name)}"
        >
      `
      : "";

    const watchUrl = episode.watchUrl || "#";

    media.innerHTML = `
      <a
        href="${escapeHTML(watchUrl)}"
        ${watchUrl !== "#" ? 'target="_blank" rel="noopener noreferrer"' : ""}
        style="display:block;height:100%;position:relative"
      >
        ${image}

        <span class="td-play">▶</span>

        <span style="
          position:absolute;
          left:18px;
          bottom:18px;
          font-family:'IBM Plex Mono',monospace;
          font-size:10px;
          letter-spacing:.14em;
          text-transform:uppercase;
          color:rgba(242,240,234,.7);
          background:#0C0B0A;
          padding:6px 10px;
        ">episode still</span>
      </a>
    `;

    const guests = episode.guests || [];

    const guestMarkup = guests.length
      ? guests.map(guest => `
          <div style="
            display:flex;
            align-items:center;
            gap:14px;
          ">
            ${guestAvatar(guest)}

            <div>
              <div style="
                font-size:15px;
                font-weight:600;
              ">
                ${escapeHTML(guest.name)}
              </div>

              <div style="
                font-family:'IBM Plex Mono',monospace;
                font-size:11px;
                color:rgba(242,240,234,.5);
                margin-top:3px;
              ">
                ${escapeHTML(guest.headline)}
              </div>
            </div>
          </div>
        `).join("")
      : `
        <div style="
          font-family:'IBM Plex Mono',monospace;
          font-size:11px;
          color:rgba(242,240,234,.5);
        ">
          Guest details coming soon
        </div>
      `;

    const meta = [
      episode.format,
      guests.length
        ? `${guests.length} guest${guests.length === 1 ? "" : "s"}`
        : "",
      episode.durationMinutes
        ? `${episode.durationMinutes} min`
        : ""
    ].filter(Boolean).join(" · ");

    content.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        gap:10px;
        margin-bottom:18px;
      ">
        <span style="
          width:7px;
          height:7px;
          border-radius:999px;
          background:#F2F0EA;
          display:inline-block;
        "></span>

        <span style="
          font-family:'IBM Plex Mono',monospace;
          font-size:11px;
          letter-spacing:.16em;
          text-transform:uppercase;
          color:rgba(242,240,234,.65);
        ">
          № ${escapeHTML(episode.episodeNumber || "")}
          ${meta ? " · " + escapeHTML(meta) : ""}
        </span>
      </div>

      <h3 style="
        font-size:clamp(26px,2.8vw,38px);
        font-weight:700;
        letter-spacing:-.03em;
        line-height:1.12;
        margin:0 0 20px;
      ">
        ${escapeHTML(episode.name)}
      </h3>

      <p style="
        font-size:17px;
        line-height:1.6;
        color:rgba(242,240,234,.68);
        margin:0 0 28px;
        max-width:46ch;
      ">
        ${escapeHTML(episode.description)}
      </p>

      <div style="
        display:flex;
        flex-direction:column;
        gap:14px;
        padding:22px 0;
        border-top:1px solid rgba(242,240,234,.18);
        border-bottom:1px solid rgba(242,240,234,.18);
        margin-bottom:28px;
      ">
        ${guestMarkup}
      </div>

      ${
        watchUrl !== "#"
          ? `
            <a
              href="${escapeHTML(watchUrl)}"
              target="_blank"
              rel="noopener noreferrer"
              style="
                display:inline-flex;
                align-items:center;
                gap:12px;
                padding:17px 30px;
                background:#F2F0EA;
                color:#0C0B0A;
                font-size:13px;
                font-weight:700;
                letter-spacing:.1em;
                text-transform:uppercase;
                border-radius:999px;
                text-decoration:none;
              "
            >
              Watch the episode
              <span style="
                font-family:'IBM Plex Mono',monospace;
                font-size:15px;
              ">→</span>
            </a>
          `
          : ""
      }
    `;
  }

  function renderUpcoming(episodes) {
    const root = $("#upcoming-list");

    if (!root) return;

    if (!episodes.length) {
      root.innerHTML = `
        <div class="td-empty">
          No upcoming episodes yet. Add one in Contentful.
        </div>
      `;
      return;
    }

    root.innerHTML = episodes.map(episode => {
      const image = episode.stillImage
        ? `
          <img
            src="${escapeHTML(episode.stillImage)}"
            alt="${escapeHTML(episode.name)}"
            loading="lazy"
          >
        `
        : `
          <div style="
            flex:0 0 176px;
            width:176px;
            aspect-ratio:16/10;
            border:1px solid rgba(242,240,234,.22);
            background:repeating-linear-gradient(
              135deg,
              rgba(242,240,234,.16) 0 2px,
              transparent 2px 11px
            );
            display:flex;
            align-items:center;
            justify-content:center;
          ">
            <span style="
              font-family:'IBM Plex Mono',monospace;
              font-size:9px;
              letter-spacing:.14em;
              text-transform:uppercase;
              color:rgba(242,240,234,.55);
            ">episode still</span>
          </div>
        `;

      const guestCount = episode.guests?.length || 0;

      return `
        <a
          href="${escapeHTML(episode.watchUrl || "#")}"
          ${episode.watchUrl && episode.watchUrl !== "#"
            ? 'target="_blank" rel="noopener noreferrer"'
            : ""
          }
          class="td-card td-episode-card"
          data-reveal="1"
          style="
            display:flex;
            align-items:center;
            gap:30px;
            padding:24px 28px;
            background:#0C0B0A;
            color:#F2F0EA;
            text-decoration:none;
            opacity:0;
            transform:translateY(22px);
          "
        >
          ${image}

          <div style="min-width:108px">
            <div style="
              font-family:'IBM Plex Mono',monospace;
              font-size:11px;
              letter-spacing:.16em;
              text-transform:uppercase;
              color:rgba(242,240,234,.55);
              margin-bottom:8px;
            ">Next up</div>

            <div style="
              font-family:Archivo,sans-serif;
              font-weight:800;
              font-size:32px;
              line-height:1;
            ">
              № ${escapeHTML(episode.episodeNumber)}
            </div>
          </div>

          <div style="flex:1;min-width:0">
            <div style="
              font-family:'IBM Plex Mono',monospace;
              font-size:11px;
              letter-spacing:.14em;
              text-transform:uppercase;
              color:rgba(242,240,234,.55);
              margin-bottom:10px;
            ">
              ${escapeHTML(episode.format)}
              · ${guestCount} guest${guestCount === 1 ? "" : "s"}
            </div>

            <div style="
              font-size:clamp(20px,2vw,27px);
              font-weight:700;
              letter-spacing:-.025em;
              line-height:1.2;
            ">
              ${escapeHTML(episode.name)}
            </div>

            <div style="
              font-family:'IBM Plex Mono',monospace;
              font-size:11px;
              letter-spacing:.08em;
              color:rgba(242,240,234,.55);
              margin-top:12px;
            ">
              ${escapeHTML(episode.description || "Details coming soon.")}
            </div>
          </div>
        </a>
      `;
    }).join("");
  }

  function renderArchive(episodes) {
    const root = $("#archive-list");

    if (!root) return;

    if (!episodes.length) {
      root.innerHTML = `
        <div class="td-empty">
          No archived episodes yet.
        </div>
      `;
      return;
    }

    root.innerHTML = episodes.map(episode => `
      <a
        href="${escapeHTML(episode.watchUrl || "#")}"
        ${episode.watchUrl && episode.watchUrl !== "#"
          ? 'target="_blank" rel="noopener noreferrer"'
          : ""
        }
        class="td-sess"
        data-reveal="1"
        style="
          display:grid;
          grid-template-columns:92px 1fr 230px 52px;
          gap:24px;
          align-items:center;
          padding:32px 10px;
          border-bottom:1px solid rgba(242,240,234,.18);
          text-decoration:none;
          opacity:0;
          transform:translateY(18px);
        "
      >
        <span style="
          font-family:'IBM Plex Mono',monospace;
          font-size:12px;
          color:rgba(242,240,234,.5);
          letter-spacing:.1em;
        ">
          № ${escapeHTML(episode.episodeNumber)}
        </span>

        <span style="
          font-size:clamp(19px,2vw,26px);
          font-weight:700;
          letter-spacing:-.025em;
        ">
          ${escapeHTML(episode.name)}
        </span>

        <span
          class="td-sessmeta"
          style="
            font-family:'IBM Plex Mono',monospace;
            font-size:12px;
            color:rgba(242,240,234,.5);
          "
        >
          ${escapeHTML(episode.format)}
          · ${episode.guests?.length || 0} guests
          ${episode.durationMinutes
            ? ` · ${escapeHTML(episode.durationMinutes)} min`
            : ""
          }
        </span>

        <span style="
          font-family:'IBM Plex Mono',monospace;
          font-size:18px;
          text-align:right;
        ">→</span>
      </a>
    `).join("");
  }

  function renderGuests(episodes) {
    const root = $("#guest-grid");

    if (!root) return;

    const guestMap = new Map();

    episodes.forEach(episode => {
      (episode.guests || []).forEach(guest => {
        if (
          guest.name &&
          !guestMap.has(guest.id || guest.name)
        ) {
          guestMap.set(
            guest.id || guest.name,
            guest
          );
        }
      });
    });

    const guests = [...guestMap.values()];

    if (!guests.length) {
      root.innerHTML = `
        <div class="td-empty" style="grid-column:1/-1">
          Guests will appear here when episodes have guest entries.
        </div>
      `;
      return;
    }

    root.innerHTML = guests.slice(0, 8).map(guest => `
      <div
        data-reveal="1"
        style="
          opacity:0;
          transform:translateY(26px);
        "
      >
        <div style="
          aspect-ratio:3/4;
          background:#171513;
          border:1px solid rgba(242,240,234,.2);
          display:flex;
          align-items:center;
          justify-content:center;
          margin-bottom:18px;
          overflow:hidden;
        ">
          ${
            guest.headshot
              ? `
                <img
                  src="${escapeHTML(guest.headshot)}"
                  alt="${escapeHTML(guest.name)}"
                  style="
                    width:100%;
                    height:100%;
                    object-fit:cover;
                  "
                  loading="lazy"
                >
              `
              : `
                <span style="
                  font-family:'IBM Plex Mono',monospace;
                  font-size:10px;
                  letter-spacing:.14em;
                  text-transform:uppercase;
                  color:rgba(242,240,234,.6);
                ">headshot</span>
              `
          }
        </div>

        <div style="
          font-size:18px;
          font-weight:700;
          letter-spacing:-.015em;
          margin-bottom:5px;
        ">
          ${escapeHTML(guest.name)}
        </div>

        <div style="
          font-family:'IBM Plex Mono',monospace;
          font-size:12px;
          color:rgba(242,240,234,.55);
          line-height:1.5;
        ">
          ${escapeHTML(guest.headline)}
        </div>

        ${renderSocialLinks(guest)}
      </div>
    `).join("");
  }

  function reveal() {
    const elements =
      document.querySelectorAll(
        '[data-reveal="1"]'
      );

    if (!("IntersectionObserver" in window)) {
      elements.forEach(element => {
        element.style.opacity = "1";
        element.style.transform = "translateY(0)";
      });
      return;
    }

    elements.forEach((element, index) => {
      element.style.transition =
        "opacity 800ms cubic-bezier(.2,.8,.2,1), " +
        "transform 800ms cubic-bezier(.2,.8,.2,1)";

      const observer =
        new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            setTimeout(() => {
              element.style.opacity = "1";
              element.style.transform =
                "translateY(0)";
            }, Math.min(index, 8) * 60);

            observer.unobserve(element);
          });
        }, {
          rootMargin: "0px 0px -12% 0px",
          threshold: 0.08
        });

      observer.observe(element);
    });
  }

  function initInteractions() {
    const hero = $("#top");

    if (!hero) return;

    const inner =
      hero.querySelector('[data-parallax="1"]');

    function onScroll() {
      if (!inner) return;

      const heroHeight = hero.offsetHeight;
      const viewportHeight = window.innerHeight;

      if (heroHeight <= viewportHeight * 1.15) {
        const span = Math.max(
          240,
          heroHeight - 120
        );

        const progress = Math.min(
          1,
          Math.max(
            0,
            window.scrollY / span
          )
        );

        inner.style.transform =
          `translateY(${progress * 110}px)`;

        inner.style.opacity =
          String(1 - progress);
      }
    }

    window.addEventListener(
      "scroll",
      onScroll,
      { passive: true }
    );

    onScroll();

    const form =
      $("#application-form");

    if (form) {
      form.addEventListener(
        "submit",
        async event => {
          event.preventDefault();

          const button =
            form.querySelector(
              'button[type="submit"]'
            );

          const inputs =
            form.querySelectorAll(
              "input, textarea"
            );

          const nameInput =
            form.querySelector('[name="name"]') ||
            inputs[0];

          const emailInput =
            form.querySelector('[name="email"]') ||
            inputs[1];

          const questionInput =
            form.querySelector('[name="question"]') ||
            form.querySelector("textarea") ||
            inputs[2];

          const name =
            nameInput?.value.trim() || "";

          const email =
            emailInput?.value.trim() || "";

          const question =
            questionInput?.value.trim() || "";

          if (!name || !email || !question) {
            alert("Please fill in all fields.");
            return;
          }

          const originalText =
            button
              ? button.textContent
              : "Submit";

          if (button) {
            button.disabled = true;
            button.textContent =
              "Submitting...";
          }

          try {
            await fetch(
              "https://hooks.zapier.com/hooks/catch/28194042/4t8prw4/",
              {
                method: "POST",
                mode: "no-cors",
                body: new URLSearchParams({
                  name,
                  email,
                  question
                })
              }
            );

            if (button) {
              button.textContent =
                "Received — we'll be in touch";
            }

            form.reset();

          } catch (error) {
            console.error(
              "Zapier submission error:",
              error
            );

            if (button) {
              button.disabled = false;
              button.textContent =
                originalText;
            }

            alert(
              "Something went wrong. Please try again."
            );
          }
        }
      );
    }

  }

  function showError(error) {
    console.error(
      "Thinkers & Doers content error:",
      error
    );

    const existing =
      $(".td-error");

    if (existing) return;

    document.body.insertAdjacentHTML(
      "afterbegin",
      `
        <div class="td-error">
          Could not load episode content.
          Check Contentful settings or content.json.
        </div>
      `
    );
  }

  async function main() {
    try {
      let data = null;

      /*
       * TEST MODE:
       * Contentful disabled → use content.json.
       *
       * CONTENTFUL MODE:
       * Contentful enabled → use Contentful.
       * If Contentful fails, fall back to content.json.
       */
      if (CONFIG.enabled) {
        try {
          data = await loadContentful();
        } catch (contentfulError) {
          console.warn(
            "Contentful failed. Falling back to content.json.",
            contentfulError
          );
        }
      }

      if (!data) {
        data = await loadFallback();
      }

      const episodes =
        Array.isArray(data.episodes)
          ? data.episodes
          : [];

      const upcomingEpisodes =
        episodes
          .filter(isUpcoming)
          .sort(sortByNumberAscending);

      const publicEpisodes =
        episodes
          .filter(isPublic)
          .sort(sortByNumberDescending);

      /*
       * Newest public episode = Latest.
       * Remaining public episodes = Archive.
       */
      const latestEpisode =
        publicEpisodes[0] || null;

      const archiveEpisodes =
        publicEpisodes.slice(1);

      if (latestEpisode) {
        renderLatest(latestEpisode);
      } else {
        const content =
          $("#latest-content");

        if (content) {
          content.innerHTML = `
            <div class="td-empty">
              No published episode yet.
            </div>
          `;
        }
      }

      renderUpcoming(upcomingEpisodes);
      renderArchive(archiveEpisodes);

      /*
       * Guests are collected from all published/upcoming episodes.
       */
      renderGuests([
        ...publicEpisodes,
        ...upcomingEpisodes
      ]);

      reveal();
      initInteractions();

    } catch (error) {
      showError(error);
    }
  }

  document.addEventListener(
    "DOMContentLoaded",
    main
  );
})();
