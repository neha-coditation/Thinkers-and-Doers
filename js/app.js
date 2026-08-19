(() => {
  "use strict";

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
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[char]));

  function getStatus(episode) {
    return Array.isArray(episode?.status)
      ? (episode.status[0] || "")
      : (episode?.status || "");
  }

  function getImageUrl(image) {
    if (!image) return "";
    if (typeof image === "string") {
      return image.startsWith("//") ? "https:" + image : image;
    }
    const url = image.url || "";
    return url.startsWith("//") ? "https:" + url : url;
  }

  function getSocialProvider(link) {
    if (!link) return "";
    return Array.isArray(link.provider)
      ? (link.provider[0] || "")
      : (link.provider || "");
  }

  function normalizeGuest(guest) {
    return {
      id: guest?.id || "",
      name: guest?.name || "",
      headline: guest?.headline || "",
      bio: guest?.bio || "",
      headshot: getImageUrl(guest?.headshot || guest?.image || ""),
      socialLinks: Array.isArray(guest?.socialLinks)
        ? guest.socialLinks.map(link => ({
            provider: getSocialProvider(link),
            url: link?.url || "#"
          }))
        : []
    };
  }

  function normalizeEpisode(episode) {
    return {
      id: episode?.id || "",
      name: episode?.name || episode?.title || "",
      description: episode?.description || "",
      episodeDate: episode?.episodeDate || null,
      status: Array.isArray(episode?.status)
        ? episode.status
        : [episode?.status || ""],
      episodeNumber: Number(episode?.episodeNumber ?? episode?.number ?? 0),
      format: episode?.format || "Conversation",
      durationMinutes: episode?.durationMinutes ?? episode?.duration ?? null,
      watchUrl: episode?.watchUrl || "#",
      stillImage: getImageUrl(episode?.stillImage || episode?.image || ""),
      guests: Array.isArray(episode?.guests)
        ? episode.guests.map(normalizeGuest)
        : []
    };
  }

  async function loadFallback() {
    const response = await fetch(CONTENT_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${CONTENT_URL} (${response.status})`);
    return {
      episodes: (await response.json()).episodes.map(normalizeEpisode)
    };
  }

  async function loadContentful() {
    if (!CONFIG.enabled || !CONFIG.spaceId || !CONFIG.deliveryToken) return null;

    const endpoint =
      `https://cdn.contentful.com/spaces/${encodeURIComponent(CONFIG.spaceId)}` +
      `/environments/${encodeURIComponent(CONFIG.environment || "master")}/entries`;

    const params = new URLSearchParams({
      access_token: CONFIG.deliveryToken,
      content_type: CONFIG.contentType || "episode",
      include: "3",
      limit: "1000"
    });

    const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Contentful returned HTTP ${response.status}`);

    const data = await response.json();
    const entries = new Map((data.includes?.Entry || []).map(e => [e.sys.id, e]));
    const assets = new Map((data.includes?.Asset || []).map(a => [a.sys.id, a]));

    const assetUrl = link => {
      const asset = assets.get(link?.sys?.id);
      const url = asset?.fields?.file?.url || "";
      return url ? (url.startsWith("//") ? "https:" + url : url) : "";
    };

    const guests = links => (Array.isArray(links) ? links : [])
      .map(link => {
        const guest = entries.get(link?.sys?.id);
        if (!guest) return null;
        const f = guest.fields || {};
        return normalizeGuest({
          id: guest.sys.id,
          name: f.name,
          headline: f.headline,
          bio: f.bio,
          headshot: assetUrl(f.headshot),
          socialLinks: (f.socialLinks || []).map(link => {
            const s = entries.get(link?.sys?.id);
            return s ? {
              provider: s.fields?.provider || "",
              url: s.fields?.url || "#"
            } : null;
          }).filter(Boolean)
        });
      }).filter(Boolean);

    return {
      episodes: (data.items || []).map(item => {
        const f = item.fields || {};
        return normalizeEpisode({
          id: item.sys.id,
          name: f.name,
          description: f.description,
          episodeDate: f.episodeDate,
          status: f.status,
          episodeNumber: f.episodeNumber,
          format: f.format,
          durationMinutes: f.durationMinutes,
          watchUrl: f.watchUrl,
          stillImage: assetUrl(f.stillImage),
          guests: guests(f.guests)
        });
      })
    };
  }

  const isPublic = e => getStatus(e) === "public";
  const isUpcoming = e => getStatus(e) === "upcoming";
  const byNumberDesc = (a,b) => Number(b.episodeNumber || 0) - Number(a.episodeNumber || 0);
  const byNumberAsc = (a,b) => Number(a.episodeNumber || 0) - Number(b.episodeNumber || 0);

  function renderLatest(e) {
    const media = $("#latest-media"), content = $("#latest-content");
    if (!media || !content) return;

    media.innerHTML = `
      <a href="${escapeHTML(e.watchUrl)}" ${e.watchUrl !== "#" ? 'target="_blank" rel="noopener noreferrer"' : ""}
         style="display:block;height:100%;position:relative">
        ${e.stillImage ? `<img src="${escapeHTML(e.stillImage)}" alt="${escapeHTML(e.name)}">` : ""}
        <span class="td-play">▶</span>
        <span style="position:absolute;left:18px;bottom:18px;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(242,240,234,.7);background:#0C0B0A;padding:6px 10px;">episode still</span>
      </a>`;

    const guests = e.guests || [];
    const meta = [e.format, guests.length ? `${guests.length} guest${guests.length === 1 ? "" : "s"}` : "", e.durationMinutes ? `${e.durationMinutes} min` : ""].filter(Boolean).join(" · ");

    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px">
        <span style="width:7px;height:7px;border-radius:999px;background:#F2F0EA;display:inline-block"></span>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(242,240,234,.65)">№ ${escapeHTML(e.episodeNumber)}${meta ? " · " + escapeHTML(meta) : ""}</span>
      </div>
      <h3 style="font-size:clamp(26px,2.8vw,38px);font-weight:700;letter-spacing:-.03em;line-height:1.12;margin:0 0 20px">${escapeHTML(e.name)}</h3>
      <p style="font-size:17px;line-height:1.6;color:rgba(242,240,234,.68);margin:0 0 28px;max-width:46ch">${escapeHTML(e.description)}</p>
      <div style="display:flex;flex-direction:column;gap:14px;padding:22px 0;border-top:1px solid rgba(242,240,234,.18);border-bottom:1px solid rgba(242,240,234,.18);margin-bottom:28px">
        ${guests.length ? guests.map(g => `
          <div style="display:flex;align-items:center;gap:14px">
            ${g.headshot ? `<img class="td-guest-avatar" src="${escapeHTML(g.headshot)}" alt="${escapeHTML(g.name)}">` : `<span class="td-guest-avatar"></span>`}
            <div><div style="font-size:15px;font-weight:600">${escapeHTML(g.name)}</div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:rgba(242,240,234,.5);margin-top:3px">${escapeHTML(g.headline)}</div></div>
          </div>`).join("") : `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:rgba(242,240,234,.5)">Guest details coming soon</div>`}
      </div>
      ${e.watchUrl !== "#" ? `<a href="${escapeHTML(e.watchUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:12px;padding:17px 30px;background:#F2F0EA;color:#0C0B0A;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;border-radius:999px;text-decoration:none">Watch the episode →</a>` : ""}
    `;
  }

  function renderUpcoming(items) {
    const root = $("#upcoming-list");
    if (!root) return;
    if (!items.length) {
      root.innerHTML = `<div class="td-empty">No upcoming episodes yet. Add one in Contentful.</div>`;
      return;
    }

    root.innerHTML = items.map(e => `
      <a href="${escapeHTML(e.watchUrl)}" ${e.watchUrl !== "#" ? 'target="_blank" rel="noopener noreferrer"' : ""}
         class="td-card td-episode-card" data-reveal="1"
         style="display:flex;align-items:center;gap:30px;padding:24px 28px;background:#0C0B0A;color:#F2F0EA;text-decoration:none;opacity:0;transform:translateY(22px)">
        ${e.stillImage
          ? `<img src="${escapeHTML(e.stillImage)}" alt="${escapeHTML(e.name)}" loading="lazy">`
          : `<div style="flex:0 0 176px;width:176px;aspect-ratio:16/10;border:1px solid rgba(242,240,234,.22);display:flex;align-items:center;justify-content:center"><span style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:rgba(242,240,234,.55)">episode still</span></div>`}
        <div style="min-width:108px"><div style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(242,240,234,.55);margin-bottom:8px">Next up</div><div style="font-weight:800;font-size:32px">№ ${escapeHTML(e.episodeNumber)}</div></div>
        <div style="flex:1;min-width:0">
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:rgba(242,240,234,.55);margin-bottom:10px">${escapeHTML(e.format)} · ${e.guests?.length || 0} guests</div>
          <div style="font-size:clamp(20px,2vw,27px);font-weight:700;line-height:1.2">${escapeHTML(e.name)}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:rgba(242,240,234,.55);margin-top:12px">${escapeHTML(e.description || "Details coming soon.")}</div>
        </div>
      </a>`).join("");
  }

  function renderArchive(items) {
    const root = $("#archive-list");
    if (!root) return;
    if (!items.length) {
      root.innerHTML = `<div class="td-empty">No archived episodes yet.</div>`;
      return;
    }

    root.innerHTML = items.map(e => `
      <a href="${escapeHTML(e.watchUrl)}" ${e.watchUrl !== "#" ? 'target="_blank" rel="noopener noreferrer"' : ""}
         class="td-sess" data-reveal="1"
         style="display:grid;grid-template-columns:92px 1fr 230px 52px;gap:24px;align-items:center;padding:32px 10px;border-bottom:1px solid rgba(242,240,234,.18);text-decoration:none;opacity:0;transform:translateY(18px)">
        <span style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:rgba(242,240,234,.5)">№ ${escapeHTML(e.episodeNumber)}</span>
        <span style="font-size:clamp(19px,2vw,26px);font-weight:700">${escapeHTML(e.name)}</span>
        <span class="td-sessmeta" style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:rgba(242,240,234,.5)">${escapeHTML(e.format)} · ${e.guests?.length || 0} guests${e.durationMinutes ? ` · ${escapeHTML(e.durationMinutes)} min` : ""}</span>
        <span style="font-family:'IBM Plex Mono',monospace;font-size:18px;text-align:right">→</span>
      </a>`).join("");
  }

  function renderGuests(episodes) {
    const root = $("#guest-grid");
    if (!root) return;

    const map = new Map();
    episodes.forEach(e => (e.guests || []).forEach(g => {
      const key = g.id || g.name;
      if (g.name && !map.has(key)) map.set(key, g);
    }));

    const guests = [...map.values()];
    if (!guests.length) {
      root.innerHTML = `<div class="td-empty" style="grid-column:1/-1">Guests will appear here when episodes have guest entries.</div>`;
      return;
    }

    root.innerHTML = guests.slice(0,8).map(g => `
      <div data-reveal="1" style="opacity:0;transform:translateY(26px)">
        <div style="aspect-ratio:3/4;background:#171513;border:1px solid rgba(242,240,234,.2);display:flex;align-items:center;justify-content:center;margin-bottom:18px;overflow:hidden">
          ${g.headshot ? `<img src="${escapeHTML(g.headshot)}" alt="${escapeHTML(g.name)}" style="width:100%;height:100%;object-fit:cover" loading="lazy">` : `<span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:rgba(242,240,234,.6)">headshot</span>`}
        </div>
        <div style="font-size:18px;font-weight:700;margin-bottom:5px">${escapeHTML(g.name)}</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:rgba(242,240,234,.55);line-height:1.5">${escapeHTML(g.headline)}</div>
      </div>`).join("");
  }

  function reveal() {
    document.querySelectorAll('[data-reveal="1"]').forEach((el, i) => {
      el.style.transition = "opacity 800ms cubic-bezier(.2,.8,.2,1), transform 800ms cubic-bezier(.2,.8,.2,1)";
      if (!("IntersectionObserver" in window)) {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
        return;
      }
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          setTimeout(() => {
            entry.target.style.opacity = "1";
            entry.target.style.transform = "translateY(0)";
          }, Math.min(i,8) * 60);
          observer.unobserve(entry.target);
        });
      }, {rootMargin:"0px 0px -12% 0px", threshold:.08});
      observer.observe(el);
    });
  }

  function initInteractions() {
    const hero = $("#top");
    const inner = hero?.querySelector('[data-parallax="1"]');

    function onScroll() {
      if (!hero || !inner) return;
      const heroHeight = hero.offsetHeight, viewportHeight = window.innerHeight;
      if (heroHeight <= viewportHeight * 1.15) {
        const span = Math.max(240, heroHeight - 120);
        const progress = Math.min(1, Math.max(0, window.scrollY / span));
        inner.style.transform = `translateY(${progress * 110}px)`;
        inner.style.opacity = String(1 - progress);
      }
    }

    window.addEventListener("scroll", onScroll, {passive:true});
    onScroll();

    const form = $("#application-form");
    form?.addEventListener("submit", event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (button) button.textContent = "Received — we'll be in touch";
      form.reset();
    });
  }

  function showError(error) {
    console.error("Thinkers & Doers content error:", error);
    if ($(".td-error")) return;
    document.body.insertAdjacentHTML("afterbegin",
      `<div class="td-error">Could not load episode content. Check Contentful settings or content.json.</div>`);
  }

  async function main() {
    try {
      let data = null;

      if (CONFIG.enabled) {
        try {
          data = await loadContentful();
        } catch (error) {
          console.warn("Contentful failed; using content.json.", error);
        }
      }

      if (!data) data = await loadFallback();

      const episodes = Array.isArray(data.episodes) ? data.episodes : [];
      const upcoming = episodes.filter(isUpcoming).sort(byNumberAsc);
      const published = episodes.filter(isPublic).sort(byNumberDesc);
      const latest = published[0] || null;
      const archive = published.slice(1);

      if (latest) renderLatest(latest);
      else if ($("#latest-content")) $("#latest-content").innerHTML = `<div class="td-empty">No published episode yet.</div>`;

      renderUpcoming(upcoming);
      renderArchive(archive);
      renderGuests([...published, ...upcoming]);
      reveal();
      initInteractions();
    } catch (error) {
      showError(error);
    }
  }

  document.addEventListener("DOMContentLoaded", main);
})();
