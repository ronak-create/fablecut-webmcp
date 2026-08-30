/* FableCut landing - progressive enhancement only. The page is fully
   readable with JS disabled; this adds nav state, reveals, copy buttons
   and a live latest-release badge. */
(function () {
  "use strict";

  /* Nav: solid border once scrolled, mobile menu toggle */
  var nav = document.getElementById("nav");
  var toggle = document.getElementById("navToggle");
  var links = document.querySelector(".nav-links");

  /* Toggle the nav border via a 1px sentinel + IntersectionObserver
     instead of a scroll handler. */
  if ("IntersectionObserver" in window) {
    var sentinel = document.createElement("div");
    sentinel.style.cssText = "position:absolute;top:0;left:0;height:1px;width:1px;pointer-events:none;";
    document.body.prepend(sentinel);
    new IntersectionObserver(function (entries) {
      nav.classList.toggle("scrolled", !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(sentinel);
  }

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* Scroll reveal via IntersectionObserver (no scroll handler) */
  var reveals = document.querySelectorAll(".reveal");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* Copy buttons */
  document.querySelectorAll(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var el = document.getElementById(btn.getAttribute("data-target"));
      if (!el) return;
      var done = function () {
        var prev = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("done");
        setTimeout(function () { btn.textContent = prev; btn.classList.remove("done"); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(el.innerText).then(done).catch(function () {});
      }
    });
  });

  /* Live latest-release badge from the public GitHub API */
  var tagEl = document.getElementById("relTag");
  var metaEl = document.getElementById("relMeta");
  var linkEl = document.getElementById("relLink");
  if (tagEl && metaEl) {
    fetch("https://api.github.com/repos/ronak-create/FableCut/releases/latest", {
      headers: { Accept: "application/vnd.github+json" }
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (rel) {
        var tag = rel.tag_name || "";
        var name = rel.name && rel.name !== tag ? rel.name : "";
        tagEl.textContent = tag ? "Latest release " + tag : "Latest release";
        var when = rel.published_at
          ? new Date(rel.published_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
          : "";
        metaEl.textContent = [name, when ? "Published " + when : ""].filter(Boolean).join(" . ")
          || "See the changelog for what shipped.";
        if (linkEl && rel.html_url) linkEl.href = rel.html_url;
      })
      .catch(function () {
        tagEl.textContent = "Latest release";
        metaEl.textContent = "See the releases page for the newest version.";
      });
  }

  /* Live GitHub star count from the public API. Fills every [data-gh-stars]
     target (nav pill + hero badge) and counts up for a "live" feel. */
  var starEls = document.querySelectorAll("[data-gh-stars]");
  if (starEls.length) {
    var fmt = function (v) {
      return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(v);
    };
    var countUp = function (el, target) {
      if (reduce || target <= 0) { el.textContent = fmt(target); return; }
      var start = performance.now(), dur = 1100;
      (function frame(now) {
        var p = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(frame);
      })(start);
    };
    fetch("https://api.github.com/repos/ronak-create/FableCut", {
      headers: { Accept: "application/vnd.github+json" }
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (repo) {
        var n = typeof repo.stargazers_count === "number" ? repo.stargazers_count : 0;
        starEls.forEach(function (el) {
          el.setAttribute("title", n.toLocaleString() + " stars on GitHub");
          countUp(el, n);
        });
      })
      .catch(function () {
        starEls.forEach(function (el) { el.textContent = el.getAttribute("data-fallback") || "★"; });
      });
  }

  /* ── FontKit: load any Google Font on demand ──
     The same "any font by name" idea the editor uses. Core page type is
     self-hosted; this pulls extra faces for the type-cut showcase. */
  var FontKit = {
    _seen: {},
    load: function (family) {
      if (this._seen[family]) return this._seen[family];
      var href = "https://fonts.googleapis.com/css2?family=" +
        encodeURIComponent(family).replace(/%20/g, "+") + "&display=swap";
      var link = document.createElement("link");
      link.rel = "stylesheet"; link.href = href;
      var p = new Promise(function (res) {
        link.onload = res; link.onerror = res; setTimeout(res, 2500);
      }).then(function () {
        return (document.fonts && document.fonts.load)
          ? document.fonts.load('1em "' + family + '"').catch(function () {})
          : null;
      });
      document.head.appendChild(link);
      this._seen[family] = p;
      return p;
    }
  };

  /* ── Speed font-change cut on the caption demo ──
     Rhythmically swaps typefaces (self-hosted + one loaded live), then
     settles - a nod to the editor's kinetic captions. */
  var capCut = document.getElementById("capCut");
  if (capCut) {
    var faces = ['"Bebas Neue"', '"Abril Fatface"', '"Oswald"', '"Playfair Display"', '"Archivo Black"', '"Anton"'];
    FontKit.load("Space Grotesk").then(function () { faces.splice(3, 0, '"Space Grotesk"'); });
    var runCut = function () {
      if (reduce) { capCut.style.fontFamily = '"Anton"'; return; }
      var i = 0, steps = 15;
      capCut.classList.add("cutting");
      (function tick() {
        capCut.style.fontFamily = faces[i % faces.length];
        i++;
        if (i < steps) setTimeout(tick, 80 + i * 7);
        else { capCut.style.fontFamily = '"Anton"'; capCut.classList.remove("cutting"); }
      })();
    };
    if ("IntersectionObserver" in window) {
      var cutObs = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { runCut(); cutObs.unobserve(e.target); } });
      }, { threshold: 0.6 });
      cutObs.observe(capCut);
    } else { runCut(); }
  }

  /* ── Pointer-driven effects (spotlight, hero tilt, card spotlight) ──
     All coalesced into one rAF and skipped entirely under reduced motion
     or on touch/coarse pointers. */
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  if (!reduce && !coarse) {
    var root = document.documentElement;
    var spot = document.getElementById("fxSpot");
    var shot = document.querySelector(".hero-shot");
    var win = shot ? shot.querySelector(".window") : null;
    var cells = document.querySelectorAll(".cell");
    var px = 0, py = 0, queued = false;

    var apply = function () {
      queued = false;
      if (spot) { spot.style.setProperty("--mx", px + "px"); spot.style.setProperty("--my", py + "px"); }
      if (win) {
        var r = shot.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) {
          var cx = (px - (r.left + r.width / 2)) / r.width;
          var cy = (py - (r.top + r.height / 2)) / r.height;
          win.style.setProperty("--ty", (cx * 5).toFixed(2) + "deg");
          win.style.setProperty("--tx", (-cy * 4).toFixed(2) + "deg");
        }
      }
    };
    window.addEventListener("pointermove", function (e) {
      px = e.clientX; py = e.clientY;
      if (!queued) { queued = true; requestAnimationFrame(apply); }
    }, { passive: true });

    /* per-card spotlight border follows the cursor within each cell */
    cells.forEach(function (cell) {
      cell.addEventListener("pointermove", function (e) {
        var r = cell.getBoundingClientRect();
        cell.style.setProperty("--cx", (e.clientX - r.left) + "px");
        cell.style.setProperty("--cy", (e.clientY - r.top) + "px");
      });
    });

    /* magnetic pull on the primary CTAs */
    document.querySelectorAll(".btn-primary").forEach(function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var mx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var my = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.transform = "translate(" + (mx * 6).toFixed(1) + "px," + (my * 6).toFixed(1) + "px)";
      });
      btn.addEventListener("pointerleave", function () { btn.style.transform = ""; });
    });
  }

  /* ── Live "agent working" ticker ────────────────────────────────────────
     Vanilla equivalent of the ElapsedSeconds / LiveTokens / WibblingSpinner
     React idea: a rolled verb that stays put, a braille spinner, an elapsed
     seconds counter, and a token counter that streams up fast — the feel of
     an agent editing the timeline live. */
  (function () {
    var el = document.querySelector(".agent-ticker");
    if (!el) return;
    var spinEl = el.querySelector(".spin");
    var elapsedEl = el.querySelector(".elapsed");
    var tokensEl = el.querySelector(".tokens");
    var verbEl = el.querySelector(".verb");

    // roll a verb once on load, then leave it put
    var verbs = ["cutting", "grading", "keyframing", "compositing", "editing timeline"];
    if (verbEl) verbEl.textContent = verbs[(Math.random() * verbs.length) | 0];

    var reduceT = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"; // ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
    var fi = 0, secs = 0, tokens = 0;

    // elapsed seconds (like ElapsedSeconds)
    setInterval(function () { secs++; if (elapsedEl) elapsedEl.textContent = secs + "s"; }, 1000);
    // streaming tokens (like LiveTokens: +4..21 every 80ms)
    setInterval(function () {
      tokens += ((Math.random() * 18) | 0) + 4;
      if (tokensEl) tokensEl.textContent = tokens.toLocaleString();
    }, 80);
    // spinner glyph (skipped under reduced motion)
    if (!reduceT && spinEl) {
      setInterval(function () { fi = (fi + 1) % frames.length; spinEl.textContent = frames.charAt(fi); }, 90);
    }
  })();

  /* ── ASCII hero background ──────────────────────────────────────────────
     A colorful, animated ASCII field painted behind the hero copy. This is
     the vanilla-canvas equivalent of the requested <AsciiHero> React
     component (no build step, no deps): a plasma value-field picks glyphs
     from a density ramp; the cursor acts as a spotlight that brightens the
     characters around it. Config mirrors the component's props. */
  (function () {
    var canvas = document.getElementById("heroAscii");
    if (!canvas || !canvas.getContext) return;
    var hero = canvas.parentElement;
    var ctx = canvas.getContext("2d");

    var CFG = {
      baseOpacity: 0.18,       // resting glyph opacity
      spotlightOpacity: 0.9,   // glyph opacity under the cursor
      spotlightRadius: 10,     // spotlight radius, in glyph cells
      colorful: true,          // hue varies across the field; else brand purple
      cell: 15                 // glyph cell size in CSS px
    };
    var RAMP = " .,:;i1tfLCG08@";           // low → high density
    var reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    var coarseP = window.matchMedia("(pointer: coarse)").matches;

    var W = 0, H = 0, cols = 0, rows = 0;
    var mx = -1e4, my = -1e4;               // cursor in cell units (off-canvas)

    function resize() {
      var r = hero.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = CFG.cell + "px ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace";
      ctx.textBaseline = "top";
      cols = Math.ceil(W / CFG.cell);
      rows = Math.ceil(H / CFG.cell);
    }

    function frame(t) {
      var time = t * 0.001;
      ctx.clearRect(0, 0, W, H);
      var rad = CFG.spotlightRadius, rad2 = rad * rad;
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          // animated plasma field → 0..1
          var v = 0.5 + 0.5 * Math.sin(x * 0.18 + time * 0.9)
                            * Math.cos(y * 0.22 - time * 0.7)
                        + 0.25 * Math.sin((x + y) * 0.12 + time * 0.5);
          v = v < 0 ? 0 : v > 1 ? 1 : v;
          var ch = RAMP.charAt((v * (RAMP.length - 1)) | 0);
          if (ch === " ") continue;

          // spotlight: brighten glyphs within spotlightRadius cells of cursor
          var dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
          var alpha = CFG.baseOpacity;
          if (d2 < rad2) {
            var falloff = 1 - Math.sqrt(d2) / rad;   // 1 at center → 0 at edge
            alpha += (CFG.spotlightOpacity - CFG.baseOpacity) * falloff * falloff;
          }

          if (CFG.colorful) {
            var hue = (x * 4 + y * 3 + time * 24) % 360;
            ctx.fillStyle = "hsla(" + hue.toFixed(0) + ",70%,66%," + alpha.toFixed(3) + ")";
          } else {
            ctx.fillStyle = "rgba(123,108,255," + alpha.toFixed(3) + ")";
          }
          ctx.fillText(ch, x * CFG.cell, y * CFG.cell);
        }
      }
    }

    var running = false;
    function loop(t) { frame(t); if (running) requestAnimationFrame(loop); }
    function start() {
      if (running) return;
      if (reduceMq.matches) { resize(); frame(0); return; }  // one static frame
      running = true; requestAnimationFrame(loop);
    }
    function stop() { running = false; }

    // cursor spotlight (skip on touch/coarse pointers)
    if (!coarseP) {
      window.addEventListener("pointermove", function (e) {
        var r = canvas.getBoundingClientRect();
        mx = (e.clientX - r.left) / CFG.cell;
        my = (e.clientY - r.top) / CFG.cell;
      }, { passive: true });
      window.addEventListener("pointerout", function (e) {
        if (!e.relatedTarget) { mx = my = -1e4; }
      });
    }

    resize();
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(hero);
    else window.addEventListener("resize", resize);

    // pause the rAF when the hero scrolls out of view (and on reduced-motion change)
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) start(); else stop();
      }, { threshold: 0 }).observe(hero);
    } else { start(); }
    if (reduceMq.addEventListener) reduceMq.addEventListener("change", function () { stop(); frame(0); start(); });
  })();
})();
