import { useState, useEffect, useRef } from "react";

// PriceScout super-MVP
// Wishlist + on-demand AI price check (Claude + web search), no scraping.
// Persists via window.storage. Verdict stamp is the hero of each card.

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
`;

const C = {
  bg: "#101418",
  surface: "#1A2026",
  surfaceUp: "#212930",
  line: "#2A333C",
  text: "#E8ECEF",
  muted: "#8A96A0",
  buy: "#3FB27F",
  wait: "#E0A458",
  alert: "#E4685C",
};

const STORE_KEY = "pricescout-list-v1";

function verdictColor(v) {
  if (!v) return C.muted;
  const s = v.toLowerCase();
  if (s.includes("buy")) return C.buy;
  if (s.includes("wait")) return C.wait;
  return C.muted;
}

function money(n) {
  if (n == null || isNaN(n)) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

async function loadList() {
  try {
    const r = await window.storage.get(STORE_KEY);
    return r ? JSON.parse(r.value) : [];
  } catch {
    return [];
  }
}

async function saveList(list) {
  try {
    await window.storage.set(STORE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error("save failed", e);
  }
}

async function checkPrice(productName) {
  const prompt = `You are a price research agent. Find the current best price in the USA for this product, new (not used or refurbished), from reputable major retailers (Amazon, Best Buy, Walmart, Target, B&H, Costco, the manufacturer's own store, etc).

Product: "${productName}"

Search the web for current prices. Then respond with ONLY a JSON object, no markdown fences, no other text:
{
  "product": "canonical product name",
  "price": 449.99,
  "retailer": "Best Buy",
  "url": "https://...",
  "list_price": 499.99,
  "verdict": "Buy now" or "Wait",
  "reason": "one plain sentence on timing: product cycle, upcoming sales, price trend"
}
If you cannot find a reliable price, set price to null and explain in reason. price and list_price are numbers, not strings.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No result returned");
  return JSON.parse(clean.slice(start, end + 1));
}

export default function PriceScout() {
  const [items, setItems] = useState(null); // null = loading
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [checkingAll, setCheckingAll] = useState(false);
  const idRef = useRef(0);

  useEffect(() => {
    loadList().then((l) => setItems(l));
  }, []);

  const update = (next) => {
    setItems(next);
    saveList(next);
  };

  const addItem = () => {
    const n = name.trim();
    if (!n) return;
    const item = {
      id: Date.now() + "-" + idRef.current++,
      name: n,
      target: target ? parseFloat(target) : null,
      status: "idle",
      result: null,
      checkedAt: null,
      error: null,
    };
    update([item, ...(items || [])]);
    setName("");
    setTarget("");
    runCheck(item.id, [item, ...(items || [])]);
  };

  const runCheck = async (id, base) => {
    const list = base || items;
    const mark = (patch) =>
      setItems((cur) => {
        const next = cur.map((it) => (it.id === id ? { ...it, ...patch } : it));
        saveList(next);
        return next;
      });
    const item = list.find((it) => it.id === id);
    if (!item) return;
    mark({ status: "checking", error: null });
    try {
      const result = await checkPrice(item.name);
      mark({ status: "done", result, checkedAt: new Date().toISOString() });
    } catch (e) {
      mark({ status: "error", error: "Price check failed. Try again." });
    }
  };

  const checkAll = async () => {
    if (!items || !items.length) return;
    setCheckingAll(true);
    for (const it of items) {
      // sequential to keep it simple and readable in the UI
      // eslint-disable-next-line no-await-in-loop
      await runCheck(it.id);
    }
    setCheckingAll(false);
  };

  const remove = (id) => update(items.filter((it) => it.id !== id));

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}>
      <style>{FONTS}</style>
      <style>{`
        input::placeholder { color: ${C.muted}; opacity: 0.7; }
        button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid ${C.buy}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
      `}</style>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 16px 64px" }}>
        <header style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em" }}>
            PriceScout
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
            Add a product. The agent finds the price and calls the moment.
          </div>
        </header>

        {/* Add row */}
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="Product, e.g. Nintendo Switch 2"
            style={{
              width: "100%", boxSizing: "border-box", background: C.bg, color: C.text,
              border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 15, fontFamily: "'Inter', sans-serif",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Target price (optional)"
              inputMode="decimal"
              style={{
                flex: 1, minWidth: 0, background: C.bg, color: C.text,
                border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 15, fontFamily: "'IBM Plex Mono', monospace",
              }}
            />
            <button
              onClick={addItem}
              disabled={!name.trim()}
              style={{
                background: name.trim() ? C.text : C.surfaceUp, color: name.trim() ? C.bg : C.muted,
                border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 15, fontWeight: 600,
                cursor: name.trim() ? "pointer" : "default", fontFamily: "'Inter', sans-serif",
              }}
            >
              Track
            </button>
          </div>
        </div>

        {/* Check all */}
        {items && items.length > 1 && (
          <button
            onClick={checkAll}
            disabled={checkingAll}
            style={{
              width: "100%", background: "transparent", color: checkingAll ? C.muted : C.text,
              border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 0", fontSize: 14, fontWeight: 500,
              cursor: checkingAll ? "default" : "pointer", marginBottom: 16, fontFamily: "'Inter', sans-serif",
            }}
          >
            {checkingAll ? "Checking all…" : "Check all prices"}
          </button>
        )}

        {/* List */}
        {items === null && <div style={{ color: C.muted, fontSize: 14 }}>Loading your list…</div>}

        {items && items.length === 0 && (
          <div style={{ border: `1px dashed ${C.line}`, borderRadius: 10, padding: "28px 16px", textAlign: "center", color: C.muted, fontSize: 14 }}>
            Nothing tracked yet. Add the Switch 2 or that MacBook and see what the agent finds.
          </div>
        )}

        {items && items.map((it) => {
          const r = it.result;
          const hit = r && r.price != null && it.target != null && r.price <= it.target;
          const vc = verdictColor(r && r.verdict);
          return (
            <div key={it.id} style={{ background: C.surface, border: `1px solid ${hit ? C.buy : C.line}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}>{(r && r.product) || it.name}</div>
                <button onClick={() => remove(it.id)} aria-label="Remove" style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 2 }}>
                  Remove
                </button>
              </div>

              {hit && (
                <div style={{ color: C.buy, fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                  Target hit: at or under {money(it.target)}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 24, animation: it.status === "checking" ? "pulse 1.2s infinite" : "none" }}>
                  {it.status === "checking" ? "···" : money(r && r.price)}
                </span>
                {r && r.list_price != null && r.price != null && r.list_price > r.price && (
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color: C.muted, textDecoration: "line-through" }}>
                    {money(r.list_price)}
                  </span>
                )}
                {r && r.retailer && it.status === "done" && (
                  r.url
                    ? <a href={r.url} target="_blank" rel="noreferrer" style={{ color: C.muted, fontSize: 13, textDecoration: "underline" }}>{r.retailer}</a>
                    : <span style={{ color: C.muted, fontSize: 13 }}>{r.retailer}</span>
                )}
              </div>

              {/* Verdict stamp */}
              {it.status === "done" && r && (
                <div style={{ marginTop: 10, borderLeft: `3px solid ${vc}`, paddingLeft: 10 }}>
                  <div style={{ color: vc, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: "0.01em" }}>
                    {r.verdict || "No call"}
                  </div>
                  {r.reason && <div style={{ color: C.muted, fontSize: 13, marginTop: 2, lineHeight: 1.45 }}>{r.reason}</div>}
                </div>
              )}

              {it.status === "error" && (
                <div style={{ color: C.alert, fontSize: 13, marginTop: 8 }}>{it.error}</div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                <span style={{ color: C.muted, fontSize: 12 }}>
                  {it.target != null && `Target ${money(it.target)} · `}
                  {it.checkedAt ? "Checked " + new Date(it.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Not checked yet"}
                </span>
                <button
                  onClick={() => runCheck(it.id)}
                  disabled={it.status === "checking"}
                  style={{
                    background: C.surfaceUp, color: it.status === "checking" ? C.muted : C.text,
                    border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 12px", fontSize: 13, fontWeight: 500,
                    cursor: it.status === "checking" ? "default" : "pointer", fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {it.status === "checking" ? "Checking…" : "Check price"}
                </button>
              </div>
            </div>
          );
        })}

        <footer style={{ color: C.muted, fontSize: 12, marginTop: 24, lineHeight: 1.5 }}>
          Prices come from a live agent search when you check, not a feed. Alerts here mean a target badge on the card; push alerts need the real build.
        </footer>
      </div>
    </div>
  );
}
