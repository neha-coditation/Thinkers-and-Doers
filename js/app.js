(() => {
  "use strict";

  const CONFIG = window.CONTENTFUL_CONFIG || {};
  const CONTENT_URL = "content.json";

  const E = value => String(value ?? "").replace(/[&<>"']/g, x => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[x]));

  const assetUrl = asset => {
    const url = asset?.fields?.file?.url || asset?.url || "";
    if (!url) return "";
    return url.startsWith("//") ? "https:" + url : url;
  };

  const statusValue = value =>
    Array.isArray(value) ? (value[0] || "") : (value || "");

  function normalizeGuest(g, assets, entries) {
    if (!g) return null;

    const f = g.fields || g;
    const socialLinks = (f.socialLinks || []).map(link => {
      const s = entries?.[link?.sys?.id];
      if (!s) return null;
      const sf = s.fields || {};
      const provider = Array.isArray(sf.provider) ? sf.provider[0] : sf.provider;
      return { provider: provider || "", url: sf.url || "#" };
    }).filter(Boolean);

    return {
      id: g.sys?.id || g.id || "",
      name: f.name || "",
      headline: f.headline || f.role || "",
      bio: f.bio || "",
      headshot: assetUrl(
        assets?.[f.headshot?.sys?.id] || f.headshot
      ),
      socialLinks
    };
  }

  function normalizeFallback(data) {
    return {
      episodes: (data.episodes || []).map(e => ({
        id: e.id || "",
        number: Number(e.episodeNumber ?? e.number ?? 0),
        status: statusValue(e.status),
        title: e.name || e.title || "",
        format: e.format || "Conversation",
        duration: e.durationMinutes ?? e.duration ?? "",
        description: e.description || "",
        video: e.video || e.videoUrl || "",
        image: e.stillImage || e.image || "",
        guests: (e.guests || []).map(g => normalizeGuest(g, {}, {})).filter(Boolean)
      }))
    };
  }

  async function loadContentful() {
    if (!CONFIG.enabled || !CONFIG.spaceId || !CONFIG.deliveryToken) {
      return null;
    }

    const url =
      `https://cdn.contentful.com/spaces/${encodeURIComponent(CONFIG.spaceId)}` +
      `/environments/${encodeURIComponent(CONFIG.environment || "master")}` +
      `/entries?access_token=${encodeURIComponent(CONFIG.deliveryToken)}` +
      `&content_type=${encodeURIComponent(CONFIG.contentType || "episode")}` +
      `&include=3&limit=1000`;

    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Contentful returned HTTP ${response.status}`);
    }

    const data = await response.json();

    const assets = Object.fromEntries(
      (data.includes?.Asset || []).map(a => [a.sys.id, a])
    );

    const entries = Object.fromEntries(
      (data.includes?.Entry || []).map(e => [e.sys.id, e])
    );

    return {
      episodes: (data.items || []).map(item => {
        const f = item.fields || {};

        const guests = (f.guests || [])
          .map(link => entries[link?.sys?.id])
          .filter(Boolean)
          .map(g => normalizeGuest(g, assets, entries))
          .filter(Boolean);

        return {
          id: item.sys.id,
          number: Number(f.episodeNumber || 0),
          status: statusValue(f.status),
          title: f.name || "",
          format: f.format || "Conversation",
          duration: f.durationMinutes ?? "",
          description: f.description || "",

          // Direct-upload Contentful video Asset
          video: assetUrl(assets[f.video?.sys?.id]),

          // Episode still/poster image
          image: assetUrl(assets[f.stillImage?.sys?.id]),

          guests
        };
      })
    };
  }

  async function loadData() {
    if (CONFIG.enabled) {
      try {
        const data = await loadContentful();
        if (data) return data;
      } catch (error) {
        console.error("Contentful error:", error);
      }
    }

    const response = await fetch(CONTENT_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("content.json missing");
    return normalizeFallback(await response.json());
  }

  function addVideoModal() {
    if (document.getElementById("td-video-modal")) return;

    const style = document.createElement("style");
    style.textContent = `
      #td-video-modal{
        position:fixed;inset:0;z-index:99999;display:none;
        align-items:center;justify-content:center;
        padding:30px;background:rgba(0,0,0,.94);
      }
      #td-video-modal.open{display:flex}
      #td-video-modal .td-video-panel{
        position:relative;width:min(1180px,94vw);
        background:#0c0b0a;border:1px solid rgba(242,240,234,.2);
      }
      #td-video-modal video{
        display:block;width:100%;max-height:82vh;
        background:#000;object-fit:contain;
      }
      #td-video-close{
        position:absolute;right:0;top:-48px;width:38px;height:38px;
        border:1px solid rgba(242,240,234,.35);
        background:#0c0b0a;color:#f2f0ea;cursor:pointer;
        font:22px/1 Arial,sans-serif;
      }
      body.td-video-open{overflow:hidden}
      @media(max-width:700px){
        #td-video-modal{padding:12px}
        #td-video-close{top:-46px}
      }
    `;
    document.head.appendChild(style);

    const modal = document.createElement("div");
    modal.id = "td-video-modal";
    modal.innerHTML = `
      <div class="td-video-panel">
        <button id="td-video-close" type="button" aria-label="Close video">×</button>
        <video id="td-video" controls playsinline preload="metadata"></video>
      </div>
    `;
    document.body.appendChild(modal);

    const video = document.getElementById("td-video");

    function close() {
      video.pause();
      video.removeAttribute("src");
      video.load();
      modal.classList.remove("open");
      document.body.classList.remove("td-video-open");
    }

    document.getElementById("td-video-close").addEventListener("click", close);
    modal.addEventListener("click", e => {
      if (e.target === modal) close();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") close();
    });

    window.playEpisodeVideo = url => {
      if (!url) return;

      video.src = url;
      modal.classList.add("open");
      document.body.classList.add("td-video-open");

      video.play().catch(() => {
        // Browser may require the user to press Play; controls remain visible.
      });
    };
  }

  function guestMarkup(guest) {
    const image = guest.headshot
      ? `<img class="td-guest-avatar" src="${E(guest.headshot)}" alt="${E(guest.name)}">`
      : `<span class="td-guest-avatar"></span>`;

    return `
      <div style="display:flex;align-items:center;gap:14px">
        ${image}
        <span style="font-size:15px;font-weight:600">
          ${E(guest.name)}
          ${guest.headline ? `<span style="font:11px 'IBM Plex Mono';color:rgba(242,240,234,.5)"> · ${E(guest.headline)}</span>` : ""}
        </span>
      </div>
    `;
  }

  function videoTrigger(url, label) {
    if (!url) return "";

    return `
      <button
        type="button"
        class="td-video-trigger"
        data-video-url="${E(url)}"
        style="display:inline-flex;align-items:center;gap:12px;padding:17px 30px;background:#F2F0EA;color:#0C0B0A;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-radius:999px;border:0;cursor:pointer"
      >
        ${E(label)} →
      </button>
    `;
  }

  function latest(e) {
    const media = document.getElementById("latest-media");
    const content = document.getElementById("latest-content");
    if (!media || !content) return;

    // IMPORTANT: keep the exact visual composition of the target design:
    // large media area on the left, content on the right.
    media.innerHTML = `
      <button
        type="button"
        class="td-video-trigger"
        data-video-url="${E(e.video)}"
        aria-label="Play ${E(e.title)}"
        style="display:block;width:100%;height:100%;padding:0;border:0;background:transparent;position:relative;cursor:pointer"
      >
        ${
          e.image
            ? `<img src="${E(e.image)}" alt="${E(e.title)}" style="width:100%;height:100%;object-fit:cover;display:block">`
            : `<div style="width:100%;height:100%;background:repeating-linear-gradient(135deg,#0c0b0a 0 2px,#171513 2px 11px);border:1px solid rgba(242,240,234,.2)"></div>`
        }

        <span class="td-play">▶</span>

        <span style="position:absolute;left:18px;bottom:18px;font:10px 'IBM Plex Mono';letter-spacing:.14em;text-transform:uppercase;background:#0C0B0A;padding:6px 10px">
          episode still
        </span>
      </button>
    `;

    const meta = [
      `№ ${e.number}`,
      e.format,
      e.duration ? `${e.duration} MIN` : ""
    ].filter(Boolean).join(" · ");

    content.innerHTML = `
      <div style="font:11px 'IBM Plex Mono';letter-spacing:.16em;text-transform:uppercase;color:rgba(242,240,234,.65);margin-bottom:18px">
        ${E(meta)}
      </div>

      <h3 style="font-size:clamp(26px,2.8vw,38px);font-weight:700;letter-spacing:-.03em;line-height:1.12;margin:0 0 20px">
        ${E(e.title)}
      </h3>

      <p style="font-size:17px;line-height:1.6;color:rgba(242,240,234,.68);margin:0 0 28px;max-width:46ch">
        ${E(e.description)}
      </p>

      <div style="display:flex;flex-direction:column;gap:12px;padding:22px 0;border-top:1px solid rgba(242,240,234,.18);border-bottom:1px solid rgba(242,240,234,.18);margin-bottom:28px">
        ${(e.guests || []).map(guestMarkup).join("")}
      </div>

      ${videoTrigger(e.video, "Watch the episode")}
    `;

    if (!e.video) {
      const button = media.querySelector(".td-video-trigger");
      if (button) {
        button.disabled = true;
        button.style.cursor = "default";
      }
    }
  }

  function upcoming(items) {
    const root = document.getElementById("upcoming-list");
    if (!root) return;

    root.innerHTML = items.length
      ? items.map(e => `
        <div
          class="td-card td-episode-card"
          data-reveal="1"
          style="display:flex;align-items:center;gap:30px;padding:24px 28px;background:#0C0B0A;color:#F2F0EA;opacity:0;transform:translateY(22px)"
        >
          ${e.image
            ? `<img src="${E(e.image)}" alt="${E(e.title)}" loading="lazy">`
            : `<div style="flex:0 0 176px;width:176px;aspect-ratio:16/10;border:1px solid rgba(242,240,234,.22);background:repeating-linear-gradient(135deg,#0c0b0a 0 2px,#171513 2px 11px);"></div>`
          }

          <div style="min-width:108px">
            <div style="font:11px 'IBM Plex Mono';letter-spacing:.16em;text-transform:uppercase;color:rgba(242,240,234,.55);margin-bottom:8px">Next up</div>
            <div style="font-size:32px;font-weight:800">№ ${E(e.number)}</div>
          </div>

          <div style="flex:1">
            <div style="font:11px 'IBM Plex Mono';letter-spacing:.14em;text-transform:uppercase;color:rgba(242,240,234,.55);margin-bottom:10px">
              ${E(e.format)} · ${(e.guests || []).length} guest${(e.guests || []).length === 1 ? "" : "s"}
            </div>
            <div style="font-size:clamp(20px,2vw,27px);font-weight:700">${E(e.title)}</div>
            <div style="font:11px 'IBM Plex Mono';color:rgba(242,240,234,.55);margin-top:12px">${E(e.description)}</div>
          </div>
        </div>
      `).join("")
      : "<div class='td-empty'>No upcoming episodes yet.</div>";
  }

  function archive(items) {
    const root = document.getElementById("archive-list");
    if (!root) return;

    root.innerHTML = items.length
      ? items.map(e => `
        <div class="td-sess" data-reveal="1"
          style="display:grid;grid-template-columns:92px 1fr 230px 52px;gap:24px;align-items:center;padding:32px 10px;border-bottom:1px solid rgba(242,240,234,.18);opacity:0;transform:translateY(18px)">
          <span style="font:12px 'IBM Plex Mono';color:rgba(242,240,234,.5)">№ ${E(e.number)}</span>
          <span style="font-size:clamp(19px,2vw,26px);font-weight:700">${E(e.title)}</span>
          <span class="td-sessmeta" style="font:12px 'IBM Plex Mono';color:rgba(242,240,234,.5)">${E(e.format)} · ${(e.guests || []).length} guests${e.duration ? ` · ${E(e.duration)} min` : ""}</span>
          <span>
            ${e.video ? videoTrigger(e.video, "Play") : "→"}
          </span>
        </div>
      `).join("")
      : "<div class='td-empty'>No archived episodes yet.</div>";
  }

  function reveal() {
    document.querySelectorAll('[data-reveal="1"]').forEach((el, i) => {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          setTimeout(() => {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
          }, Math.min(i, 8) * 60);
          observer.unobserve(entry.target);
        });
      }, { rootMargin:"0px 0px -12% 0px", threshold:.08 });
      observer.observe(el);
    });
  }

  function initInteractions() {
    addVideoModal();

    document.addEventListener("click", event => {
      const trigger = event.target.closest(".td-video-trigger");
      if (!trigger) return;

      event.preventDefault();
      const url = trigger.getAttribute("data-video-url");
      if (url && window.playEpisodeVideo) {
        window.playEpisodeVideo(url);
      }
    });

    const form = document.getElementById("application-form");
    form?.addEventListener("submit", event => {
      event.preventDefault();
      const button = form.querySelector("button");
      if (button) button.textContent = "Received — we'll be in touch";
      form.reset();
    });
  }

  async function main() {
    try {
      const data = await loadData();
      const episodes = data.episodes || [];

      const published = episodes
        .filter(e => e.status === "public")
        .sort((a,b) => b.number - a.number);

      const upcomingItems = episodes
        .filter(e => e.status === "upcoming")
        .sort((a,b) => a.number - b.number);

      const latestEpisode = published[0];

      if (latestEpisode) {
        latest(latestEpisode);
      }

      upcoming(upcomingItems);
      archive(published.slice(1));
      reveal();
      initInteractions();

    } catch (error) {
      console.error("Thinkers & Doers error:", error);
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<div class="td-error">Could not load episode content. Check Contentful settings or content.json.</div>`
      );
    }
  }

  document.addEventListener("DOMContentLoaded", main);
})();
