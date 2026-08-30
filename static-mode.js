/* ═══════════════════════════════════════════════════════════════════════════
   FableCut · static demo mode                      [new work — WebMCP Challenge]

   Lets the editor run on plain static hosting, with no Node server behind it.

   FableCut normally talks to a small local server for the project file, the
   asset library and export. A hosted demo cannot use that: a single server
   holds a single project.json, so two judges opening the URL at the same time
   would be dragging each other's clips around.

   So instead of isolating sessions on a server, this removes the server. The
   API surface app.js expects is served from static files and localStorage,
   which means every visitor gets their own private copy of the demo timeline,
   there is no shared state to collide over, no cold start, and nothing to run.

   Loaded BEFORE app.js. Only present in the built demo (see build-demo.js);
   `node server.js` is untouched and still the real thing.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
(function () {
  const LOG = "[FableCut/static]";
  const KEY = "fablecut-demo-project";
  const DEMO = "demo-project.json";

  /* ?reset drops any saved edits and reloads the pristine demo. */
  if (/[?&]reset\b/.test(location.search)) {
    try { localStorage.removeItem(KEY); } catch (e) { }
    history.replaceState(null, "", location.pathname);
  }

  const json = (body, status) => new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

  /* Captured before the override below, so the shim can still reach the network
     for the demo project and the library manifests. */
  const realFetch = window.fetch.bind(window);

  async function loadProject() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) { console.warn(LOG, "saved project unreadable, falling back to the demo", e); }
    const res = await realFetch(DEMO, { cache: "no-store" });
    if (!res.ok) throw new Error(DEMO + " -> HTTP " + res.status);
    return res.json();
  }

  const ROUTES = {
    async project(method, url, init) {
      if (method === "GET") return json(await loadProject());
      if (method === "PUT") {
        let data;
        try { data = JSON.parse(init && init.body); }
        catch (e) { return json({ error: "invalid JSON" }, 400); }
        try { localStorage.setItem(KEY, JSON.stringify(data)); }
        catch (e) {
          /* Quota is the only realistic failure and it is not worth losing the
             session over — the edit stays live in memory either way. */
          console.warn(LOG, "could not persist to localStorage:", e && e.name);
          return json({ ok: true, revision: data.revision, persisted: false });
        }
        return json({ ok: true, revision: data.revision, persisted: true });
      }
      return json({ error: "method not allowed" }, 405);
    },

    async library(method, url) {
      const dir = url.searchParams.get("dir");
      if (!["sfx", "elements", "svg", "fonts"].includes(dir))
        return json({ error: "unknown library dir" }, 400);
      const res = await realFetch("demo/library-" + dir + ".json", { cache: "force-cache" });
      return res.ok ? json(await res.json()) : json([]);
    },

    async media() { return json([]); },

    async upload() {
      return json({ error: "This hosted demo is read-only for file imports. " +
        "Clone the repo and run `node server.js` to import your own media." }, 501);
    },
  };

  window.fetch = function (input, init) {
    const raw = typeof input === "string" ? input : (input && input.url) || "";
    let url;
    try { url = new URL(raw, location.href); } catch (e) { return realFetch(input, init); }
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
      return realFetch(input, init);

    const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    const seg = url.pathname.slice("/api/".length).split("/")[0];

    /* Always hand back a Promise. fetch() is specified to return one, and
       callers rely on it: app.js does fetch("/api/export/ffmpeg").then(...)
       during startup. Returning a bare Response here throws "then is not a
       function" inside connectServer's try block, which silently flips
       state.connected back to false and disables saving entirely. */
    if (seg === "export")                                          // no ffmpeg here
      return Promise.resolve(json({ available: false }));
    const route = ROUTES[seg];
    if (!route)
      return Promise.resolve(json({ error: "not available in the static demo" }, 501));

    return Promise.resolve(route(method, url, init)).catch((e) => {
      console.error(LOG, url.pathname, e);
      return json({ error: String(e) }, 500);
    });
  };

  /* app.js opens an EventSource for live reload. There is no server to push
     from, and letting it 404 sets off a reconnect loop that spams the console
     for the whole session. Hand it a source that simply stays quiet. */
  const RealES = window.EventSource;
  window.EventSource = function (u) {
    if (String(u).indexOf("/api/") === 0) {
      const stub = new EventTarget();
      stub.close = function () { };
      stub.readyState = 1;
      stub.url = String(u);
      return stub;
    }
    return new RealES(u);
  };
  window.EventSource.prototype = RealES.prototype;

  window.FableCutDemo = {
    static: true,
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) { } location.reload(); },
  };
  console.log(LOG, "static demo mode active - project state lives in localStorage");
})();
