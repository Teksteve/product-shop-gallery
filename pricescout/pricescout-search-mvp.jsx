import { useState, useEffect } from "react";

// PriceScout MVP v2 — search-first, styled to match The Product Shop gallery.
// Search box → popular searches + your history beneath → results with a watch
// (alert) toggle beside each. Live prices come from a Claude agent web search.

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');`;

const C = {
  paper: "#F7F7F4",
  card: "#FFFFFF",
  ink: "#14171A",
  muted: "#6B7480",
  line: "#E2E2DC",
  accent: "#2A56E8",
  buy: "#1F8A5D",
  wait: "#B07C22",
};

const POPULAR = [
  "Nintendo Switch 2",
  "MacBook Pro 14 M5",
  "Sony WH-1000XM6",
  "LG C5 65\" OLED",
  "Samsung 990 Pro 2TB",
];

const HIST_KEY = "ps-history-v1";
const WATCH_KEY = "ps-watchlist-v1";

async function loadKey(key) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : [];
  } catch {
    return [];
  }
}
async function saveKey(key, val) {
  try {
    await window.storage.set(key, JSON.stringify(val));
  } catch (e) {
    console.error(e);
  }
}

function money(n) {
  if (n == null || isNaN(n)) return "—";
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 });
}

async function searchPrices(query) {
  const prompt = `You are a price research agent. The user is shopping for: "${query}"

Search the web for current USA prices for this product, new condition, from reputable major retailers (Amazon, Best Buy, Walmart, Target, B&H, Costco, manufacturer stores). Find up to 4 distinct offers from different retailers.

Respond with ONLY a JSON object, no markdown fences, no other text:
{
  "product": "canonical product name",
  "verdict": "Buy now" or "Wait",
  "reason": "one plain sentence on timing: product cycle, upcoming sales, price trend",
  "offers": [
    { "retailer": "Best Buy", "price": 449.99, "url": "https://..." }
  ]
}
Sort offers lowest price first. Prices are numbers, not strings. If no reliable prices found, offers is [] and reason explains why.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("{");
  const e = clean.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("no result");
  return JSON.parse(clean.slice(s, e + 1));
}

// Bell icon, outline vs filled
function Bell({ on }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={on ? C.accent : "none"} stroke={on ? C.accent : C.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export default function PriceScout() {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]);
  const [watch, setWatch] = useState([]);
  const [state, setState] = useState("idle"); // idle | searching | done | error
  const [result, setResult] = useState(null);
  const [lastQuery, setLastQuery] = useState("");

  useEffect(() => {
    loadKey(HIST_KEY).then(setHistory);
    loadKey(WATCH_KEY).then(setWatch);
  }, []);

  const runSearch = async (qRaw) => {
    const q = (qRaw || "").trim();
    if (!q || state === "searching") return;
    setQuery(q);
    setState("searching");
    setResult(null);
    setLastQuery(q);
    const nextHist = [q, ...history.filter((h) => h.toLowerCase() !== q.toLowerCase())].slice(0, 8);
    setHistory(nextHist);
    saveKey(HIST_KEY, nextHist);
    try {
      const r = await searchPrices(q);
      setResult(r);
      setState("done");
    } catch {
      setState("error");
    }
  };

  const isWatched = (retailer) =>
    watch.some((w) => w.product === (result && result.product) && w.retailer === retailer);

  const toggleWatch = (offer) => {
    if (!result) return;
    const key = { product: result.product, retailer: offer.retailer };
    let next;
    if (isWatched(offer.retailer)) {
      next = watch.filter((w) => !(w.product === key.product && w.retailer === key.retailer));
    } else {
      next = [{ ...key, price: offer.price, url: offer.url, added: Date.now() }, ...watch];
    }
    setWatch(next);
    saveKey(WATCH_KEY, next);
  };

  const clearHistory = () => {
    setHistory([]);
    saveKey(HIST_KEY, []);
  };

  const chip = {
    background: C.card, border: `1px solid ${C.line}`, borderRadius: 999,
    padding: "7px 14px", fontSize: 13, color: C.ink, cursor: "pointer",
    fontFamily: "'Inter', sans-serif",
  };

  const monoLabel = {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.08em",
    textTransform: "uppercase", color: C.muted,
  };

  return (
    <div style={{ minHeight: "100vh", background: C.paper, color: C.ink, fontFamily: "'Inter', sans-serif" }}>
      <style>{FONTS}</style>
      <style>{`
        input::placeholder { color: ${C.muted}; opacity: 0.75; }
        button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @media (prefers-reduced-motion: reduce){ *{animation:none!important;transition:none!important} }
      `}</style>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "36px 16px 64px" }}>
        <div style={monoLabel}>The Product Shop · Proto-001</div>
        <h1 style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontSize: 34, letterSpacing: "-0.03em", margin: "8px 0 20px" }}>
          PriceScout
        </h1>

        {/* Search box */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch(query)}
            placeholder="Search any electronics product"
            style={{
              flex: 1, minWidth: 0, background: C.card, color: C.ink,
              border: `1px solid ${C.ink}`, borderRadius: 8, padding: "13px 14px",
              fontSize: 16, fontFamily: "'Inter', sans-serif",
            }}
          />
          <button
            onClick={() => runSearch(query)}
            disabled={!query.trim() || state === "searching"}
            style={{
              background: query.trim() && state !== "searching" ? C.ink : C.line,
              color: query.trim() && state !== "searching" ? C.paper : C.muted,
              border: "none", borderRadius: 8, padding: "0 20px", fontSize: 15,
              fontWeight: 600, cursor: query.trim() && state !== "searching" ? "pointer" : "default",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {state === "searching" ? "…" : "Search"}
          </button>
        </div>

        {/* Popular + history under the box */}
        {state === "idle" && (
          <div style={{ marginTop: 22 }}>
            <div style={monoLabel}>Popular searches</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {POPULAR.map((p) => (
                <button key={p} style={chip} onClick={() => runSearch(p)}>{p}</button>
              ))}
            </div>

            {history.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={monoLabel}>Your searches</div>
                  <button onClick={clearHistory} style={{ background: "none", border: "none", color: C.muted, fontSize: 12, cursor: "pointer" }}>
                    Clear
                  </button>
                </div>
                <div style={{ marginTop: 6 }}>
                  {history.map((h) => (
                    <button
                      key={h}
                      onClick={() => runSearch(h)}
                      style={{
                        display: "block", width: "100%", textAlign: "left", background: "none",
                        border: "none", borderBottom: `1px solid ${C.line}`, padding: "11px 2px",
                        fontSize: 15, color: C.ink, cursor: "pointer", fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {watch.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={monoLabel}>Watching · {watch.length}</div>
                {watch.map((w) => (
                  <div key={w.product + w.retailer} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.line}`, padding: "11px 2px" }}>
                    <div style={{ fontSize: 14 }}>
                      {w.product} <span style={{ color: C.muted }}>· {w.retailer}</span>
                    </div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600 }}>{money(w.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Searching */}
        {state === "searching" && (
          <div style={{ marginTop: 28, color: C.muted, fontSize: 14, animation: "pulse 1.2s infinite" }}>
            Agent is checking prices for “{lastQuery}”…
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div style={{ marginTop: 28, fontSize: 14, color: "#B3392E" }}>
            Price check failed. <button onClick={() => runSearch(lastQuery)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 14, padding: 0, textDecoration: "underline" }}>Try again</button>
          </div>
        )}

        {/* Results */}
        {state === "done" && result && (
          <div style={{ marginTop: 24 }}>
            <button onClick={() => { setState("idle"); setResult(null); setQuery(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>
              ← New search
            </button>

            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16 }}>
              <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 600, fontSize: 18 }}>{result.product}</div>

              {result.reason && (
                <div style={{ marginTop: 10, borderLeft: `3px solid ${(result.verdict || "").toLowerCase().includes("buy") ? C.buy : C.wait}`, paddingLeft: 10 }}>
                  <div style={{ color: (result.verdict || "").toLowerCase().includes("buy") ? C.buy : C.wait, fontFamily: "'Archivo', sans-serif", fontWeight: 600, fontSize: 14 }}>
                    {result.verdict || "No call"}
                  </div>
                  <div style={{ color: C.muted, fontSize: 13, marginTop: 2, lineHeight: 1.45 }}>{result.reason}</div>
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                {(result.offers || []).length === 0 && (
                  <div style={{ color: C.muted, fontSize: 14 }}>No reliable offers found.</div>
                )}
                {(result.offers || []).map((o, i) => (
                  <div key={o.retailer + i} style={{ display: "flex", alignItems: "center", gap: 12, borderTop: i === 0 ? "none" : `1px solid ${C.line}`, padding: "12px 0" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {o.url
                        ? <a href={o.url} target="_blank" rel="noreferrer" style={{ color: C.ink, fontSize: 15, textDecoration: "none", fontWeight: 500 }}>{o.retailer}</a>
                        : <span style={{ fontSize: 15, fontWeight: 500 }}>{o.retailer}</span>}
                      {i === 0 && <span style={{ ...monoLabel, color: C.accent, marginLeft: 8 }}>Best price</span>}
                    </div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 17 }}>{money(o.price)}</span>
                    <button
                      onClick={() => toggleWatch(o)}
                      aria-label={isWatched(o.retailer) ? "Stop watching" : "Watch for price drops"}
                      title={isWatched(o.retailer) ? "Watching — tap to remove" : "Watch this price"}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}
                    >
                      <Bell on={isWatched(o.retailer)} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ color: C.muted, fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              Watching saves the item to your list. Push alerts arrive in the full build.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
