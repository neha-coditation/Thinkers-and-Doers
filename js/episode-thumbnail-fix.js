(() => {
  "use strict";

  /*
   * Thinkers & Doers — Episode Thumbnail Fix
   *
   * Contentful field IDs:
   *   episodeVideo     -> uploaded MP4 Asset
   *   episodeThumbnail -> uploaded image Asset
   *
   * This patch runs after the existing app.js and only replaces
   * the Latest Episode media area. The existing popup in app.js
   * handles .td-video-trigger clicks.
   */

  const cfg = window.CONTENTFUL_CONFIG || {};

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));

  const toHttps = url => {
    if (!url) return "";
    return url.startsWith("//") ? "https:" + url : url;
  };

  async function getLatestEpisode() {
    if (!cfg.enabled || !cfg.spaceId || !cfg.deliveryToken) {
      return null;
    }

    const endpoint =
      `https://cdn.contentful.com/spaces/${encodeURIComponent(cfg.spaceId)}` +
      `/environments/${encodeURIComponent(cfg.environment || "master")}/entries`;

    const params = new URLSearchParams({
      access_token: cfg.deliveryToken,
      content_type: cfg.contentType || "episode",
      include: "3",
      limit: "1000"
    });

    const response = await fetch(`${endpoint}?${params.toString()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Contentful thumbnail request failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    const assets = new Map(
      (data.includes?.Asset || []).map(asset => [asset.sys.id, asset])
    );

    const resolveAsset = link => {
      const id = link?.sys?.id;
      const asset = id ? assets.get(id) : null;
      return toHttps(asset?.fields?.file?.url || "");
    };

    const episodes = (data.items || [])
      .filter(item => {
        const status = item.fields?.status;
        const value = Array.isArray(status) ? status[0] : status;
        return value === "public";
      })
      .map(item => {
        const fields = item.fields || {};
        return {
          id: item.sys.id,
          number: Number(fields.episodeNumber || 0),
          video: resolveAsset(fields.episodeVideo),
          thumbnail: resolveAsset(fields.episodeThumbnail),
          name: fields.name || ""
        };
      })
      .sort((a, b) => b.number - a.number);

    return episodes[0] || null;
  }

  function renderThumbnail(episode) {
    const root = document.querySelector("#latest-media");
    if (!root || !episode) return;

    if (!episode.video) {
      console.warn("Latest episode has no published episodeVideo Asset.", episode);
      return;
    }

    const image = episode.thumbnail
      ? `<img src="${escapeHtml(episode.thumbnail)}"
              alt="${escapeHtml(episode.name)}"
              style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;"
              loading="eager">`
      : "";

    root.innerHTML = `
      <button
        type="button"
        class="td-video-trigger td-latest-video"
        data-video-url="${escapeHtml(episode.video)}"
        aria-label="Play ${escapeHtml(episode.name)}"
        style="
          position:relative;
          display:block;
          width:100%;
          height:100%;
          min-height:360px;
          padding:0;
          margin:0;
          border:0;
          background:#0C0B0A;
          overflow:hidden;
          cursor:pointer;
        "
      >
        ${image}

        <span
          aria-hidden="true"
          style="
            position:absolute;
            left:50%;
            top:50%;
            transform:translate(-50%,-50%);
            width:92px;
            height:92px;
            border:1px solid rgba(242,240,234,.75);
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            color:#F2F0EA;
            background:rgba(12,11,10,.28);
            backdrop-filter:blur(3px);
            font-size:28px;
            line-height:1;
            padding-left:5px;
            box-sizing:border-box;
          "
        >▶</span>

        <span style="
          position:absolute;
          left:28px;
          bottom:24px;
          z-index:2;
          font-family:'IBM Plex Mono',monospace;
          font-size:10px;
          letter-spacing:.14em;
          text-transform:uppercase;
          color:rgba(242,240,234,.75);
          background:#0C0B0A;
          padding:7px 10px;
        ">play episode</span>
      </button>
    `;

    console.info("Latest episode thumbnail connected:", episode.thumbnail);
    console.info("Latest episode video connected:", episode.video);
  }

  async function init() {
    try {
      const latest = await getLatestEpisode();
      if (latest) renderThumbnail(latest);
    } catch (error) {
      console.error("Episode thumbnail fix:", error);
    }
  }

  // app.js is already loaded on the page. Run after it has rendered.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 100));
  } else {
    setTimeout(init, 100);
  }
})();
