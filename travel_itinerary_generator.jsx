import { useState, useRef, useEffect } from "react";

const INTEREST_OPTIONS = [
  { id: "culture", label: "Culture & History", icon: "🏛️" },
  { id: "food", label: "Food & Dining", icon: "🍽️" },
  { id: "nature", label: "Nature & Outdoors", icon: "🌿" },
  { id: "nightlife", label: "Nightlife & Bars", icon: "🌙" },
  { id: "shopping", label: "Shopping", icon: "🛍️" },
  { id: "adventure", label: "Adventure & Sports", icon: "⛰️" },
  { id: "relaxation", label: "Relaxation & Wellness", icon: "🧘" },
  { id: "art", label: "Art & Museums", icon: "🎨" },
];

const BUDGET_OPTIONS = ["Budget", "Mid-Range", "Luxury"];
const PACE_OPTIONS = ["Relaxed", "Moderate", "Packed"];

const SYSTEM_PROMPT = `You are an expert travel planner. Generate a detailed day-by-day itinerary based on the user's preferences.

RESPOND ONLY WITH VALID JSON. No markdown, no backticks, no preamble.

JSON Schema:
{
  "trip_title": "string - catchy trip title",
  "summary": "string - 1-2 sentence trip overview",
  "days": [
    {
      "day_number": 1,
      "theme": "string - day theme like 'Historic Heart' or 'Coastal Vibes'",
      "activities": [
        {
          "time": "string - e.g. '9:00 AM'",
          "name": "string - place or activity name (must be a REAL place)",
          "category": "string - one of: meal, attraction, activity, transport, accommodation",
          "description": "string - 2-3 sentences about what to do here",
          "duration_minutes": number,
          "estimated_cost_usd": number,
          "tip": "string - insider tip or advice",
          "booking_type": "string - one of: hotel, restaurant, activity, flight, none"
        }
      ]
    }
  ],
  "total_estimated_cost_usd": number,
  "packing_suggestions": ["string array - 5-8 items specific to this trip"]
}

Rules:
- Only suggest REAL, currently operating places
- Include realistic travel times between locations
- Balance the day according to the requested pace
- Include 2-3 meals per day
- Keep costs realistic for the budget level
- Make the itinerary flow geographically (minimize backtracking)`;

function buildUserPrompt({ destination, startDate, endDate, travelers, budget, pace, interests }) {
  const days = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1);
  const interestLabels = interests.map(i => INTEREST_OPTIONS.find(o => o.id === i)?.label).filter(Boolean);
  return `Plan a ${days}-day trip to ${destination}.
Dates: ${startDate} to ${endDate}
Travelers: ${travelers}
Budget: ${budget}
Pace: ${pace}
Interests: ${interestLabels.join(", ")}

Generate a complete itinerary following the JSON schema exactly.`;
}

const categoryColors = {
  meal: { bg: "#FFF3E0", border: "#FF9800", icon: "🍽️" },
  attraction: { bg: "#E8F5E9", border: "#4CAF50", icon: "🏛️" },
  activity: { bg: "#E3F2FD", border: "#2196F3", icon: "⚡" },
  transport: { bg: "#F3E5F5", border: "#9C27B0", icon: "🚗" },
  accommodation: { bg: "#FFF8E1", border: "#FFC107", icon: "🏨" },
};

export default function TravelItineraryGenerator() {
  const [step, setStep] = useState("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [itinerary, setItinerary] = useState(null);
  const [activeDay, setActiveDay] = useState(0);
  const [animateIn, setAnimateIn] = useState(false);

  const [form, setForm] = useState({
    destination: "",
    startDate: "",
    endDate: "",
    travelers: 2,
    budget: "Mid-Range",
    pace: "Moderate",
    interests: ["culture", "food"],
  });

  const resultRef = useRef(null);

  useEffect(() => {
    if (step === "result") {
      setTimeout(() => setAnimateIn(true), 100);
    } else {
      setAnimateIn(false);
    }
  }, [step]);

  const toggleInterest = (id) => {
    setForm(prev => ({
      ...prev,
      interests: prev.interests.includes(id)
        ? prev.interests.filter(i => i !== id)
        : [...prev.interests, id],
    }));
  };

  const generateItinerary = async () => {
    if (!form.destination || !form.startDate || !form.endDate) {
      setError("Please fill in destination and dates.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserPrompt(form) }],
        }),
      });
      const data = await response.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setItinerary(parsed);
      setActiveDay(0);
      setStep("result");
    } catch (err) {
      console.error(err);
      setError("Failed to generate itinerary. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0F1923 0%, #1A2F44 40%, #0D2137 100%)",
      fontFamily: "'Outfit', 'DM Sans', system-ui, sans-serif",
      color: "#E8ECF1",
      position: "relative",
      overflow: "hidden",
    },
    noiseOverlay: {
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
      pointerEvents: "none", zIndex: 0,
    },
    content: { position: "relative", zIndex: 1, maxWidth: 900, margin: "0 auto", padding: "40px 24px" },
    header: { textAlign: "center", marginBottom: 48 },
    logo: {
      fontSize: 14, letterSpacing: 6, textTransform: "uppercase", color: "#5BA4D9",
      fontWeight: 600, marginBottom: 12,
    },
    title: {
      fontSize: 42, fontWeight: 700, letterSpacing: -1,
      background: "linear-gradient(135deg, #FFFFFF 0%, #7CB9E8 100%)",
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0, lineHeight: 1.2,
    },
    subtitle: { fontSize: 16, color: "#7A8FA3", marginTop: 8, fontWeight: 400 },
    card: {
      background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)",
      borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)",
      padding: 32, marginBottom: 24,
      boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
    },
    label: {
      fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
      color: "#5BA4D9", fontWeight: 600, marginBottom: 8, display: "block",
    },
    input: {
      width: "100%", padding: "14px 16px", borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
      color: "#E8ECF1", fontSize: 16, fontFamily: "inherit", outline: "none",
      transition: "border-color 0.2s, box-shadow 0.2s", boxSizing: "border-box",
    },
    inputFocus: {
      borderColor: "#5BA4D9", boxShadow: "0 0 0 3px rgba(91,164,217,0.15)",
    },
    row: { display: "flex", gap: 16, marginBottom: 20 },
    col: { flex: 1 },
    chipGrid: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 },
    chip: (active) => ({
      padding: "10px 16px", borderRadius: 12, fontSize: 14, fontWeight: 500,
      border: active ? "1px solid #5BA4D9" : "1px solid rgba(255,255,255,0.1)",
      background: active ? "rgba(91,164,217,0.15)" : "rgba(255,255,255,0.04)",
      color: active ? "#7CB9E8" : "#7A8FA3", cursor: "pointer",
      transition: "all 0.2s", userSelect: "none",
    }),
    optionBtn: (active) => ({
      padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
      border: active ? "1px solid #5BA4D9" : "1px solid rgba(255,255,255,0.1)",
      background: active ? "rgba(91,164,217,0.2)" : "transparent",
      color: active ? "#FFFFFF" : "#7A8FA3", cursor: "pointer",
      transition: "all 0.2s", flex: 1, textAlign: "center",
    }),
    generateBtn: {
      width: "100%", padding: "18px 32px", borderRadius: 16, border: "none",
      background: "linear-gradient(135deg, #2E8BC0 0%, #5BA4D9 100%)",
      color: "#FFFFFF", fontSize: 18, fontWeight: 700, cursor: "pointer",
      transition: "all 0.3s", fontFamily: "inherit", letterSpacing: 0.5,
      boxShadow: "0 4px 20px rgba(91,164,217,0.3)",
    },
    generateBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
    error: {
      background: "rgba(239,83,80,0.1)", border: "1px solid rgba(239,83,80,0.3)",
      borderRadius: 12, padding: "12px 16px", color: "#EF5350", fontSize: 14, marginBottom: 16,
    },
    // Result styles
    tripHeader: {
      textAlign: "center", marginBottom: 32,
      opacity: animateIn ? 1 : 0, transform: animateIn ? "translateY(0)" : "translateY(20px)",
      transition: "all 0.6s ease-out",
    },
    tripTitle: { fontSize: 36, fontWeight: 700, margin: 0, color: "#FFFFFF" },
    tripSummary: { fontSize: 16, color: "#7A8FA3", marginTop: 8 },
    dayTabs: {
      display: "flex", gap: 8, marginBottom: 24, overflowX: "auto", paddingBottom: 4,
      opacity: animateIn ? 1 : 0, transform: animateIn ? "translateY(0)" : "translateY(20px)",
      transition: "all 0.6s ease-out 0.1s",
    },
    dayTab: (active) => ({
      padding: "10px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600,
      background: active ? "rgba(91,164,217,0.2)" : "rgba(255,255,255,0.04)",
      border: active ? "1px solid #5BA4D9" : "1px solid rgba(255,255,255,0.08)",
      color: active ? "#FFFFFF" : "#7A8FA3", cursor: "pointer",
      transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0,
    }),
    activityCard: (category, index) => ({
      background: "rgba(255,255,255,0.03)", borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.06)", padding: 20, marginBottom: 12,
      borderLeft: `3px solid ${categoryColors[category]?.border || "#5BA4D9"}`,
      opacity: animateIn ? 1 : 0, transform: animateIn ? "translateX(0)" : "translateX(-20px)",
      transition: `all 0.4s ease-out ${0.15 + index * 0.08}s`,
    }),
    activityTime: {
      fontSize: 13, fontWeight: 700, color: "#5BA4D9", letterSpacing: 1,
      textTransform: "uppercase", marginBottom: 4,
    },
    activityName: { fontSize: 18, fontWeight: 700, color: "#FFFFFF", marginBottom: 6 },
    activityDesc: { fontSize: 14, color: "#8A9BB0", lineHeight: 1.6, marginBottom: 10 },
    activityMeta: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" },
    metaBadge: (bg) => ({
      padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
      background: bg || "rgba(255,255,255,0.06)", color: "#C8D6E0",
    }),
    tipBox: {
      marginTop: 10, padding: "10px 14px", borderRadius: 10,
      background: "rgba(91,164,217,0.08)", border: "1px solid rgba(91,164,217,0.15)",
      fontSize: 13, color: "#7CB9E8", lineHeight: 1.5,
    },
    affiliateBtn: {
      display: "inline-block", marginTop: 10, padding: "8px 16px", borderRadius: 10,
      background: "linear-gradient(135deg, #FF8A50 0%, #FF6D00 100%)",
      color: "#FFF", fontSize: 13, fontWeight: 700, textDecoration: "none",
      cursor: "pointer", border: "none", fontFamily: "inherit",
      boxShadow: "0 2px 8px rgba(255,109,0,0.3)",
    },
    costBar: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "16px 20px", borderRadius: 14,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      marginBottom: 24,
    },
    packingGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
    packingItem: {
      padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
      background: "rgba(91,164,217,0.1)", border: "1px solid rgba(91,164,217,0.15)",
      color: "#7CB9E8",
    },
    backBtn: {
      padding: "12px 24px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
      background: "transparent", color: "#7A8FA3", fontSize: 14, fontWeight: 600,
      cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
    },
    loadingContainer: { textAlign: "center", padding: "80px 20px" },
    spinner: {
      width: 48, height: 48, border: "3px solid rgba(91,164,217,0.2)",
      borderTop: "3px solid #5BA4D9", borderRadius: "50%",
      animation: "spin 1s linear infinite", margin: "0 auto 24px",
    },
  };

  const [focusedInput, setFocusedInput] = useState(null);

  const renderInput = () => (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.7); }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(91,164,217,0.3); border-radius: 4px; }
      `}</style>
      <div style={styles.container}>
        <div style={styles.noiseOverlay} />
        <div style={styles.content}>
          <div style={styles.header}>
            <div style={styles.logo}>✦ Stompr</div>
            <h1 style={styles.title}>Plan Your Perfect Trip</h1>
            <p style={styles.subtitle}>AI-powered itineraries tailored to how you travel</p>
          </div>

          <div style={styles.card}>
            <div style={{ marginBottom: 20 }}>
              <label style={styles.label}>Destination</label>
              <input
                style={{ ...styles.input, ...(focusedInput === "dest" ? styles.inputFocus : {}) }}
                placeholder="e.g. Tokyo, Japan"
                value={form.destination}
                onChange={e => setForm(p => ({ ...p, destination: e.target.value }))}
                onFocus={() => setFocusedInput("dest")}
                onBlur={() => setFocusedInput(null)}
              />
            </div>

            <div style={styles.row}>
              <div style={styles.col}>
                <label style={styles.label}>Start Date</label>
                <input
                  type="date" style={{ ...styles.input, ...(focusedInput === "start" ? styles.inputFocus : {}) }}
                  value={form.startDate}
                  onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))}
                  onFocus={() => setFocusedInput("start")}
                  onBlur={() => setFocusedInput(null)}
                />
              </div>
              <div style={styles.col}>
                <label style={styles.label}>End Date</label>
                <input
                  type="date" style={{ ...styles.input, ...(focusedInput === "end" ? styles.inputFocus : {}) }}
                  value={form.endDate}
                  onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
                  onFocus={() => setFocusedInput("end")}
                  onBlur={() => setFocusedInput(null)}
                />
              </div>
              <div style={{ width: 120, flexShrink: 0 }}>
                <label style={styles.label}>Travelers</label>
                <input
                  type="number" min={1} max={20}
                  style={{ ...styles.input, textAlign: "center", ...(focusedInput === "trav" ? styles.inputFocus : {}) }}
                  value={form.travelers}
                  onChange={e => setForm(p => ({ ...p, travelers: parseInt(e.target.value) || 1 }))}
                  onFocus={() => setFocusedInput("trav")}
                  onBlur={() => setFocusedInput(null)}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={styles.label}>Budget Level</label>
              <div style={{ display: "flex", gap: 10 }}>
                {BUDGET_OPTIONS.map(b => (
                  <div key={b} style={styles.optionBtn(form.budget === b)}
                    onClick={() => setForm(p => ({ ...p, budget: b }))}>
                    {b === "Budget" ? "💰" : b === "Mid-Range" ? "💳" : "💎"} {b}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={styles.label}>Pace</label>
              <div style={{ display: "flex", gap: 10 }}>
                {PACE_OPTIONS.map(p => (
                  <div key={p} style={styles.optionBtn(form.pace === p)}
                    onClick={() => setForm(prev => ({ ...prev, pace: p }))}>
                    {p === "Relaxed" ? "🐢" : p === "Moderate" ? "🚶" : "🏃"} {p}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={styles.label}>Interests</label>
              <div style={styles.chipGrid}>
                {INTEREST_OPTIONS.map(opt => (
                  <div key={opt.id} style={styles.chip(form.interests.includes(opt.id))}
                    onClick={() => toggleInterest(opt.id)}>
                    {opt.icon} {opt.label}
                  </div>
                ))}
              </div>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            <button
              style={{ ...styles.generateBtn, ...(loading ? styles.generateBtnDisabled : {}) }}
              onClick={generateItinerary}
              disabled={loading}
              onMouseOver={e => { if (!loading) e.target.style.transform = "translateY(-2px)"; }}
              onMouseOut={e => { e.target.style.transform = "translateY(0)"; }}
            >
              {loading ? "✨ Generating your itinerary..." : "✨ Generate Itinerary"}
            </button>
          </div>

          {loading && (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner} />
              <p style={{ color: "#5BA4D9", fontSize: 16, fontWeight: 500 }}>
                Crafting your perfect trip...
              </p>
              <p style={{ color: "#7A8FA3", fontSize: 14 }}>
                This usually takes 10–20 seconds
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderResult = () => {
    if (!itinerary) return null;
    const currentDay = itinerary.days?.[activeDay];
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
          @keyframes spin { to { transform: rotate(360deg); } }
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { height: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(91,164,217,0.3); border-radius: 4px; }
        `}</style>
        <div style={styles.container}>
          <div style={styles.noiseOverlay} />
          <div style={styles.content} ref={resultRef}>
            <div style={styles.tripHeader}>
              <div style={styles.logo}>✦ Stompr</div>
              <h1 style={styles.tripTitle}>{itinerary.trip_title}</h1>
              <p style={styles.tripSummary}>{itinerary.summary}</p>
            </div>

            <div style={styles.costBar}>
              <span style={{ fontSize: 14, color: "#7A8FA3" }}>Estimated Total Cost</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#5BA4D9" }}>
                ${itinerary.total_estimated_cost_usd?.toLocaleString() || "—"}
              </span>
            </div>

            <div style={styles.dayTabs}>
              {itinerary.days?.map((d, i) => (
                <div key={i} style={styles.dayTab(activeDay === i)}
                  onClick={() => { setActiveDay(i); setAnimateIn(false); setTimeout(() => setAnimateIn(true), 50); }}>
                  Day {d.day_number}: {d.theme}
                </div>
              ))}
            </div>

            {currentDay?.activities?.map((act, i) => {
              const cat = categoryColors[act.category] || categoryColors.activity;
              return (
                <div key={i} style={styles.activityCard(act.category, i)}>
                  <div style={styles.activityTime}>{cat.icon} {act.time}</div>
                  <div style={styles.activityName}>{act.name}</div>
                  <div style={styles.activityDesc}>{act.description}</div>
                  <div style={styles.activityMeta}>
                    <span style={styles.metaBadge()}>{act.duration_minutes} min</span>
                    <span style={styles.metaBadge("rgba(91,164,217,0.12)")}>
                      ${act.estimated_cost_usd}
                    </span>
                    <span style={styles.metaBadge()}>{act.category}</span>
                  </div>
                  {act.tip && (
                    <div style={styles.tipBox}>💡 {act.tip}</div>
                  )}
                  {act.booking_type && act.booking_type !== "none" && (
                    <button style={styles.affiliateBtn}
                      onClick={() => alert(`Affiliate link: This would open a ${act.booking_type} booking for "${act.name}"`)}>
                      Book This →
                    </button>
                  )}
                </div>
              );
            })}

            {itinerary.packing_suggestions?.length > 0 && (
              <div style={{ ...styles.card, marginTop: 24 }}>
                <label style={styles.label}>Packing Suggestions</label>
                <div style={styles.packingGrid}>
                  {itinerary.packing_suggestions.map((item, i) => (
                    <span key={i} style={styles.packingItem}>{item}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: 32 }}>
              <button style={styles.backBtn} onClick={() => { setStep("input"); setItinerary(null); }}
                onMouseOver={e => { e.target.style.borderColor = "#5BA4D9"; e.target.style.color = "#FFFFFF"; }}
                onMouseOut={e => { e.target.style.borderColor = "rgba(255,255,255,0.12)"; e.target.style.color = "#7A8FA3"; }}>
                ← Plan Another Trip
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  return step === "input" ? renderInput() : renderResult();
}
