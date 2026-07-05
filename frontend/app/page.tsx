"use client";

import { useState, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const COUNTRIES: Record<string, string[]> = {
  "Nigeria": ["Lagos", "Abuja", "Rivers", "Kano", "Oyo", "Enugu", "Delta", "Anambra", "Kaduna", "Imo", "Osun", "Ogun", "Kwara", "Edo", "Cross River", "Akwa Ibom", "Bauchi", "Borno", "Plateau", "Sokoto"],
  "Ghana": ["Greater Accra", "Ashanti", "Western", "Eastern", "Central", "Northern", "Upper East", "Upper West", "Volta", "Brong-Ahafo"],
  "Kenya": ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Malindi", "Kitale", "Garissa", "Kakamega"],
  "South Africa": ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Limpopo", "Mpumalanga", "North West", "Free State", "Northern Cape"],
  "United States": ["New York", "California", "Texas", "Florida", "Illinois", "Pennsylvania", "Ohio", "Georgia", "North Carolina", "Michigan"],
  "United Kingdom": ["England", "Scotland", "Wales", "Northern Ireland", "London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Liverpool"],
  "Canada": ["Ontario", "Quebec", "British Columbia", "Alberta", "Manitoba", "Saskatchewan", "Nova Scotia", "New Brunswick", "Newfoundland", "Prince Edward Island"],
  "Australia": ["New South Wales", "Victoria", "Queensland", "Western Australia", "South Australia", "Tasmania", "ACT", "Northern Territory"],
  "India": ["Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "Uttar Pradesh", "West Bengal", "Rajasthan", "Gujarat", "Andhra Pradesh", "Telangana"],
  "UAE": ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Umm Al Quwain"],
};

const NICHE_SUGGESTIONS = [
  "fashion boutique", "restaurant", "hair salon", "makeup artist",
  "hotel", "clothing brand", "real estate", "electronics",
  "gym", "event planner", "law firm", "dental clinic",
];

type HuntMode = "instagram" | "business";

interface Lead {
  username: string;
  business_name: string;
  bio: string;
  whatsapp_found: boolean;
  whatsapp_number: string;
  email: string;
  followers: string;
  pitch: string;
  score?: number;
}

interface Business {
  name: string;
  phone: string;
  address: string;
  rating: string;
  reviews: string;
  category: string;
  website: string;
  website_status: string;
  pitch: string;
  score: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  NO_WEBSITE: { label: "No Website", color: "text-red-400 bg-red-500/10 border-red-500/25", emoji: "🔥" },
  BROKEN: { label: "Broken Site", color: "text-orange-400 bg-orange-500/10 border-orange-500/25", emoji: "⚠️" },
  OUTDATED: { label: "Outdated", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/25", emoji: "🕰️" },
  HEALTHY: { label: "Has Website", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", emoji: "✓" },
};

function exportLeadsCSV(leads: Lead[], niche: string, location: string) {
  const headers = ["Username", "Instagram URL", "Business Name", "Bio", "WhatsApp", "WhatsApp Number", "Email", "Followers", "Score", "Pitch"];
  const rows = leads.map((l) => [
    `@${l.username}`, `https://instagram.com/${l.username}`, l.business_name,
    `"${l.bio.replace(/"/g, "'")}"`, l.whatsapp_found ? "Yes" : "No",
    l.whatsapp_number || "", l.email || "", l.followers || "", l.score || 0,
    `"${l.pitch.replace(/"/g, "'")}"`,
  ]);
  downloadCSV([headers, ...rows], `instalead-ig-${niche}-${location}`);
}

function exportBusinessCSV(businesses: Business[], niche: string, location: string) {
  const headers = ["Name", "Phone", "Address", "Rating", "Reviews", "Category", "Website", "Website Status", "Score", "Pitch"];
  const rows = businesses.map((b) => [
    `"${b.name.replace(/"/g, "'")}"`, b.phone || "", `"${b.address.replace(/"/g, "'")}"`,
    b.rating || "", b.reviews || "", b.category || "", b.website || "",
    b.website_status, b.score, `"${b.pitch.replace(/"/g, "'")}"`,
  ]);
  downloadCSV([headers, ...rows], `instalead-gmb-${niche}-${location}`);
}

function downloadCSV(data: (string | number)[][], filename: string) {
  const csv = data.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
    : score >= 40 ? "text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/20"
    : "text-white/40 bg-white/5 border-white/10";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono border ${color}`}>
      {score}pts
    </span>
  );
}

function CopyButton({ pitch }: { pitch: string }) {
  const [state, setState] = useState<"idle" | "copied">("idle");
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pitch);
    } catch {
      const t = document.createElement("textarea");
      t.value = pitch;
      t.style.position = "fixed";
      t.style.opacity = "0";
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
    }
    setState("copied");
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <button onClick={handleCopy}
      className={`relative px-3 py-1.5 text-xs font-mono font-medium rounded border transition-all duration-200 whitespace-nowrap overflow-hidden ${
        state === "copied" ? "border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/10" : "border-white/15 text-white/60 hover:border-[#D4AF37]/60 hover:text-[#D4AF37]"
      }`}>
      <span className={`flex items-center gap-1.5 transition-all duration-200 ${state === "copied" ? "opacity-0 translate-y-2" : "opacity-100"}`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        Copy Pitch
      </span>
      <span className={`absolute inset-0 flex items-center justify-center gap-1.5 transition-all duration-200 ${state === "copied" ? "opacity-100" : "opacity-0 -translate-y-2"}`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Copied!
      </span>
    </button>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  const [pitchOpen, setPitchOpen] = useState(false);
  const instagramUrl = `https://instagram.com/${lead.username}`;
  const whatsappUrl = lead.whatsapp_number ? `https://wa.me/${lead.whatsapp_number.replace(/[^0-9]/g, "")}` : null;

  return (
    <div className="bg-[#121214] border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/10 transition-all duration-200">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <a href={instagramUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm font-mono text-white/80 hover:text-[#D4AF37] transition-colors truncate">
              @{lead.username}
            </a>
            {lead.whatsapp_found ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">WhatsApp</span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono text-white/25 border border-white/10 flex-shrink-0">DM only</span>
            )}
            {lead.score !== undefined && <ScoreBadge score={lead.score} />}
          </div>
          <p className="text-white/70 truncate" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "15px" }}>{lead.business_name}</p>
        </div>
        {lead.followers && (
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] font-mono text-white/25">followers</p>
            <p className="text-sm font-mono text-[#D4AF37]">{lead.followers}</p>
          </div>
        )}
      </div>
      <div className="px-4 pb-3">
        <p className="text-xs text-white/40 leading-relaxed">{lead.bio || "No bio available"}</p>
      </div>
      {(lead.whatsapp_number || lead.email) && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {lead.whatsapp_number && (
            <span className="text-[10px] font-mono text-emerald-400/70 bg-emerald-500/5 border border-emerald-500/15 rounded px-2 py-1">📱 {lead.whatsapp_number}</span>
          )}
          {lead.email && (
            <span className="text-[10px] font-mono text-blue-400/70 bg-blue-500/5 border border-blue-500/15 rounded px-2 py-1">✉️ {lead.email}</span>
          )}
        </div>
      )}
      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        <CopyButton pitch={lead.pitch} />
        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-mono font-medium rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all duration-200">
            WhatsApp
          </a>
        )}
        <button onClick={() => setPitchOpen(!pitchOpen)}
          className="px-3 py-1.5 text-xs font-mono text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 rounded transition-all duration-200 flex items-center gap-1.5">
          {pitchOpen ? "Hide Pitch" : "View Pitch"}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform duration-200 ${pitchOpen ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
      {pitchOpen && (
        <div className="px-4 py-4 bg-[#D4AF37]/[0.03] border-t border-[#D4AF37]/10">
          <p className="text-[10px] font-mono text-[#D4AF37]/60 uppercase tracking-widest mb-2">Generated DM Pitch</p>
          <p className="text-white/65 leading-relaxed" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "15px" }}>{lead.pitch}</p>
        </div>
      )}
    </div>
  );
}

function BusinessCard({ biz }: { biz: Business }) {
  const [pitchOpen, setPitchOpen] = useState(false);
  const statusCfg = STATUS_CONFIG[biz.website_status] || STATUS_CONFIG.HEALTHY;
  const phoneUrl = biz.phone ? `tel:${biz.phone.replace(/[^0-9+]/g, "")}` : null;

  return (
    <div className="bg-[#121214] border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/10 transition-all duration-200">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-mono text-white/80 truncate">{biz.name}</p>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border flex-shrink-0 ${statusCfg.color}`}>
              {statusCfg.emoji} {statusCfg.label}
            </span>
            <ScoreBadge score={biz.score} />
          </div>
          <p className="text-white/50 text-xs font-mono truncate">{biz.category}</p>
        </div>
        {biz.rating && (
          <div className="flex-shrink-0 text-right">
            <p className="text-sm font-mono text-[#D4AF37]">★ {biz.rating}</p>
            {biz.reviews && <p className="text-[10px] font-mono text-white/25">{biz.reviews} reviews</p>}
          </div>
        )}
      </div>

      <div className="px-4 pb-3 space-y-1.5">
        {biz.address && (
          <p className="text-xs text-white/40 leading-relaxed flex items-start gap-1.5">
            <span className="flex-shrink-0">📍</span>
            <span>{biz.address}</span>
          </p>
        )}
        {biz.website && (
          <p className="text-xs leading-relaxed flex items-start gap-1.5">
            <span className="flex-shrink-0">🔗</span>
            <a href={biz.website.startsWith("http") ? biz.website : `https://${biz.website}`}
              target="_blank" rel="noopener noreferrer"
              className="text-blue-400/70 hover:text-blue-400 truncate transition-colors">
              {biz.website}
            </a>
          </p>
        )}
      </div>

      {biz.phone && (
        <div className="px-4 pb-3">
          <span className="text-[10px] font-mono text-emerald-400/70 bg-emerald-500/5 border border-emerald-500/15 rounded px-2 py-1">
            📞 {biz.phone}
          </span>
        </div>
      )}

      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        <CopyButton pitch={biz.pitch} />
        {phoneUrl && (
          <a href={phoneUrl}
            className="px-3 py-1.5 text-xs font-mono font-medium rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all duration-200">
            📞 Call
          </a>
        )}
        <button onClick={() => setPitchOpen(!pitchOpen)}
          className="px-3 py-1.5 text-xs font-mono text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 rounded transition-all duration-200 flex items-center gap-1.5">
          {pitchOpen ? "Hide Pitch" : "View Pitch"}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`transition-transform duration-200 ${pitchOpen ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {pitchOpen && (
        <div className="px-4 py-4 bg-[#D4AF37]/[0.03] border-t border-[#D4AF37]/10">
          <p className="text-[10px] font-mono text-[#D4AF37]/60 uppercase tracking-widest mb-2">Generated Outreach Pitch</p>
          <p className="text-white/65 leading-relaxed" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "15px" }}>{biz.pitch}</p>
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-[#121214] border border-white/[0.06] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-3 w-28 bg-white/[0.06] rounded animate-pulse" />
        <div className="h-4 w-16 bg-white/[0.04] rounded-full animate-pulse" />
      </div>
      <div className="h-3 w-40 bg-white/[0.05] rounded animate-pulse" />
      <div className="space-y-1.5">
        <div className="h-2.5 w-full bg-white/[0.04] rounded animate-pulse" />
        <div className="h-2.5 w-4/5 bg-white/[0.03] rounded animate-pulse" />
      </div>
      <div className="flex gap-2">
        <div className="h-7 w-24 bg-white/[0.05] rounded animate-pulse" />
        <div className="h-7 w-20 bg-white/[0.04] rounded animate-pulse" />
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<HuntMode>("instagram");
  const [niche, setNiche] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [stateRegion, setStateRegion] = useState("");
  const [city, setCity] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleHunt = async () => {
    if (!niche.trim()) return;
    const location = city.trim() || stateRegion || country;
    setLoading(true);
    setError(null);
    setLeads([]);
    setBusinesses([]);
    setHasSearched(true);
    setSidebarOpen(false);

    const endpoint = mode === "instagram" ? "/api/hunt" : "/api/business-hunt";

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: niche.trim(), city: location, country, state: stateRegion || "" }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown server error" }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
      const data = await response.json();
      if (mode === "instagram") {
        setLeads(data as Lead[]);
      } else {
        setBusinesses(data as Business[]);
      }
      setTimeout(() => { resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const resultCount = mode === "instagram" ? leads.length : businesses.length;
  const hotLeadCount = mode === "business" ? businesses.filter((b) => b.website_status === "NO_WEBSITE" || b.website_status === "BROKEN").length : 0;

  return (
    <div className="min-h-screen bg-[#0B0B0C] flex flex-col">
      {/* Mobile top bar */}
      <div className="lg:hidden h-14 border-b border-white/[0.06] flex items-center justify-between px-4 flex-shrink-0 bg-[#0E0E10]">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <p className="text-white font-medium" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "16px" }}>InstaLead AI</p>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white/60 hover:text-white transition-colors p-2">
          {sidebarOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className={`fixed lg:relative inset-y-0 left-0 z-50 w-[300px] flex-shrink-0 border-r border-white/[0.06] bg-[#0E0E10] flex flex-col transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} top-14 lg:top-0`}>
          <div className="hidden lg:block px-7 pt-8 pb-6 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium leading-none" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "18px" }}>InstaLead AI</p>
                <p className="text-white/30 text-[10px] font-mono mt-0.5">LEAD HUNTER v8.0</p>
              </div>
            </div>
          </div>

          {/* MODE TABS */}
          <div className="px-6 pt-5 pb-2">
            <div className="flex bg-[#0B0B0C] rounded-lg p-1 border border-white/[0.06]">
              <button
                onClick={() => { setMode("instagram"); setHasSearched(false); setLeads([]); setBusinesses([]); setError(null); }}
                className={`flex-1 py-2 text-[11px] font-mono rounded-md transition-all duration-200 ${
                  mode === "instagram" ? "bg-[#D4AF37] text-[#0B0B0C] font-medium" : "text-white/40 hover:text-white/60"
                }`}>
                📸 Instagram
              </button>
              <button
                onClick={() => { setMode("business"); setHasSearched(false); setLeads([]); setBusinesses([]); setError(null); }}
                className={`flex-1 py-2 text-[11px] font-mono rounded-md transition-all duration-200 ${
                  mode === "business" ? "bg-[#D4AF37] text-[#0B0B0C] font-medium" : "text-white/40 hover:text-white/60"
                }`}>
                🏢 Google Biz
              </button>
            </div>
            <p className="text-[10px] font-mono text-white/20 mt-2 leading-relaxed">
              {mode === "instagram"
                ? "Find Instagram businesses taking orders via DM/WhatsApp"
                : "Find local businesses with no website, broken sites, or redesign potential"}
            </p>
          </div>

          <div className="flex-1 px-6 py-4 space-y-5 overflow-y-auto">
            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Business Niche</label>
              <input type="text" value={niche} onChange={(e) => setNiche(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleHunt()} placeholder="e.g. restaurant"
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 placeholder-white/20 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {NICHE_SUGGESTIONS.slice(0, 6).map((s) => (
                  <button key={s} onClick={() => setNiche(s)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-all duration-150 ${niche === s ? "border-[#D4AF37]/50 text-[#D4AF37]" : "border-white/10 text-white/35 hover:border-white/25"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Country</label>
              <select value={country} onChange={(e) => { setCountry(e.target.value); setStateRegion(""); setCity(""); }}
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200 appearance-none">
                {Object.keys(COUNTRIES).map((c) => <option key={c} value={c} className="bg-[#121214]">{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">State / Region</label>
              <select value={stateRegion} onChange={(e) => { setStateRegion(e.target.value); setCity(""); }}
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200 appearance-none">
                <option value="">All states...</option>
                {(COUNTRIES[country] || []).map((s) => <option key={s} value={s} className="bg-[#121214]">{s}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">City (optional)</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleHunt()} placeholder="e.g. Lekki, Ikeja..."
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 placeholder-white/20 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200" />
            </div>

            <div className="pt-1 space-y-2">
              <button onClick={handleHunt} disabled={loading || !niche.trim()}
                className={`w-full py-3 px-4 rounded text-sm font-mono font-medium tracking-wider uppercase transition-all duration-200 ${
                  loading || !niche.trim() ? "bg-white/5 text-white/25 border border-white/10 cursor-not-allowed" : "bg-[#D4AF37] text-[#0B0B0C] hover:bg-[#e0bc3f] active:scale-[0.98] shadow-[0_0_30px_rgba(212,175,55,0.2)]"
                }`}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Hunting...
                  </span>
                ) : mode === "instagram" ? "⚡ Hunt Instagram" : "⚡ Hunt Businesses"}
              </button>

              {resultCount > 0 && !loading && (
                <button
                  onClick={() => mode === "instagram"
                    ? exportLeadsCSV(leads, niche, city || stateRegion || country)
                    : exportBusinessCSV(businesses, niche, city || stateRegion || country)}
                  className="w-full py-2.5 px-4 rounded text-xs font-mono font-medium border border-[#D4AF37]/30 text-[#D4AF37]/70 hover:border-[#D4AF37]/60 hover:text-[#D4AF37] transition-all duration-200 flex items-center justify-center gap-2">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export CSV ({resultCount})
                </button>
              )}

              {loading && (
                <p className="text-center text-[10px] font-mono text-white/25 leading-relaxed">
                  {mode === "instagram" ? "Searching + scraping profiles" : "Finding businesses + checking websites"}<br />15–25 seconds...
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          {hasSearched && !loading && resultCount > 0 && (
            <div className="px-6 py-4 border-t border-white/[0.06]">
              {mode === "instagram" ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#121214] rounded px-2 py-2">
                    <p className="text-[9px] font-mono text-white/30 mb-0.5">Leads</p>
                    <p className="text-base font-medium text-[#D4AF37]" style={{ fontFamily: "var(--font-cormorant), serif" }}>{leads.length}</p>
                  </div>
                  <div className="bg-[#121214] rounded px-2 py-2">
                    <p className="text-[9px] font-mono text-white/30 mb-0.5">WhatsApp</p>
                    <p className="text-base font-medium text-emerald-400" style={{ fontFamily: "var(--font-cormorant), serif" }}>{leads.filter((l) => l.whatsapp_found).length}</p>
                  </div>
                  <div className="bg-[#121214] rounded px-2 py-2">
                    <p className="text-[9px] font-mono text-white/30 mb-0.5">Emails</p>
                    <p className="text-base font-medium text-blue-400" style={{ fontFamily: "var(--font-cormorant), serif" }}>{leads.filter((l) => l.email).length}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-[#121214] rounded px-2 py-2">
                    <p className="text-[9px] font-mono text-white/30 mb-0.5">Found</p>
                    <p className="text-base font-medium text-[#D4AF37]" style={{ fontFamily: "var(--font-cormorant), serif" }}>{businesses.length}</p>
                  </div>
                  <div className="bg-[#121214] rounded px-2 py-2">
                    <p className="text-[9px] font-mono text-white/30 mb-0.5">Hot 🔥</p>
                    <p className="text-base font-medium text-red-400" style={{ fontFamily: "var(--font-cormorant), serif" }}>{hotLeadCount}</p>
                  </div>
                  <div className="bg-[#121214] rounded px-2 py-2">
                    <p className="text-[9px] font-mono text-white/30 mb-0.5">Phones</p>
                    <p className="text-base font-medium text-emerald-400" style={{ fontFamily: "var(--font-cormorant), serif" }}>{businesses.filter((b) => b.phone).length}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="px-6 pb-5">
            <p className="text-[10px] font-mono text-white/20 leading-relaxed">
              {mode === "instagram"
                ? "Searches public Instagram profiles indexed by Google."
                : "Searches Google Business listings + checks website health."}
            </p>
          </div>
        </aside>

        {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden top-14" onClick={() => setSidebarOpen(false)} />}

        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="hidden lg:flex h-14 border-b border-white/[0.06] items-center justify-between px-8 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_6px_rgba(212,175,55,0.8)]" />
              <span className="text-[11px] font-mono text-white/35 uppercase tracking-widest">
                {mode === "instagram" ? "Instagram Leads" : "Business Leads"}
              </span>
              {hasSearched && !loading && (
                <span className="text-[11px] font-mono text-white/20">— {niche} · {city || stateRegion || country}</span>
              )}
            </div>
            {resultCount > 0 && <span className="text-[10px] font-mono text-white/25">{resultCount} result{resultCount !== 1 ? "s" : ""}</span>}
          </div>

          <div ref={resultsRef} className="flex-1 overflow-y-auto p-4 lg:p-6">
            {!hasSearched && !loading && (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
                <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/8 border border-[#D4AF37]/15 flex items-center justify-center mb-5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="1.5" opacity="0.7">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <h2 className="text-white/70 mb-2" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "22px", fontWeight: 300 }}>
                  {mode === "instagram" ? "Instagram leads will appear here" : "Business leads will appear here"}
                </h2>
                <p className="text-white/25 text-xs font-mono max-w-xs leading-relaxed mb-8">
                  {mode === "instagram"
                    ? "Find Instagram businesses taking orders manually via DM or WhatsApp."
                    : "Find local businesses with no website, broken sites, or redesign potential."}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg w-full">
                  {(mode === "instagram" ? [
                    { icon: "📸", label: "Instagram", desc: "DM-based businesses" },
                    { icon: "🤖", label: "AI Pitches", desc: "Gemini + Groq" },
                    { icon: "⭐", label: "Lead Scoring", desc: "Ranked by quality" },
                  ] : [
                    { icon: "🔥", label: "No Website", desc: "Hottest leads first" },
                    { icon: "⚠️", label: "Broken Sites", desc: "Detected automatically" },
                    { icon: "📞", label: "Direct Phones", desc: "Call them instantly" },
                  ]).map((item) => (
                    <div key={item.label} className="bg-[#121214] border border-white/[0.06] rounded-lg p-4 text-left">
                      <div className="text-xl mb-2">{item.icon}</div>
                      <p className="text-[11px] font-mono text-white/50 mb-1">{item.label}</p>
                      <p className="text-[10px] text-white/25 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && !loading && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 max-w-2xl mb-4">
                <p className="text-sm text-red-300/70 font-mono leading-relaxed">{error}</p>
              </div>
            )}

            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
                <div className="col-span-full flex items-center justify-center gap-2 py-2">
                  <div className="w-1 h-1 rounded-full bg-[#D4AF37]/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1 h-1 rounded-full bg-[#D4AF37]/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1 h-1 rounded-full bg-[#D4AF37]/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="text-[10px] font-mono text-white/25 ml-1">
                    {mode === "instagram" ? "Scraping profiles + generating pitches..." : "Checking websites + generating pitches..."}
                  </span>
                </div>
              </div>
            )}

            {!loading && mode === "instagram" && leads.length > 0 && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {leads.map((lead, i) => <LeadCard key={`${lead.username}-${i}`} lead={lead} />)}
                </div>
                <p className="text-[10px] font-mono text-white/20 text-center mt-6">{leads.length} leads — {niche}</p>
              </div>
            )}

            {!loading && mode === "business" && businesses.length > 0 && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {businesses.map((biz, i) => <BusinessCard key={`${biz.name}-${i}`} biz={biz} />)}
                </div>
                <p className="text-[10px] font-mono text-white/20 text-center mt-6">{businesses.length} businesses — {niche}</p>
              </div>
            )}

            {!loading && hasSearched && resultCount === 0 && !error && (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-center px-4">
                <p className="text-white/50 mb-2" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "20px" }}>No results found</p>
                <p className="text-white/25 text-xs font-mono max-w-xs leading-relaxed">Try a broader niche or different location.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
