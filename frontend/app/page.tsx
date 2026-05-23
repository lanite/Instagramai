"use client";

import { useState, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const NIGERIAN_CITIES = [
  "Lagos", "Abuja", "Port Harcourt", "Ibadan", "Kano", "Enugu",
  "Benin City", "Warri", "Aba", "Onitsha", "Kaduna", "Calabar",
  "Uyo", "Asaba", "Lekki", "Ikeja", "Victoria Island", "Surulere",
];

const NICHE_SUGGESTIONS = [
  "fashion boutique", "food vendor", "hair salon", "makeup artist",
  "cake & pastries", "clothing brand", "shoe vendor", "electronics",
  "skincare brand", "event planner", "furniture", "perfume vendor",
];

interface Lead {
  username: string;
  business_name: string;
  bio: string;
  whatsapp_found: boolean;
  whatsapp_number: string;
  email: string;
  followers: string;
  pitch: string;
}

function exportToCSV(leads: Lead[], niche: string, city: string) {
  const headers = ["Username", "Instagram URL", "Business Name", "Bio", "WhatsApp", "WhatsApp Number", "Email", "Followers", "Pitch"];
  const rows = leads.map(lead => [
    `@${lead.username}`,
    `https://instagram.com/${lead.username}`,
    lead.business_name,
    `"${lead.bio.replace(/"/g, "'")}"`,
    lead.whatsapp_found ? "Yes" : "No",
    lead.whatsapp_number || "",
    lead.email || "",
    lead.followers || "",
    `"${lead.pitch.replace(/"/g, "'")}"`,
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `instalead-${niche}-${city}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
    <button
      onClick={handleCopy}
      className={`relative px-3 py-1.5 text-xs font-mono font-medium rounded border transition-all duration-200 whitespace-nowrap overflow-hidden ${
        state === "copied"
          ? "border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/10"
          : "border-white/15 text-white/60 hover:border-[#D4AF37]/60 hover:text-[#D4AF37]"
      }`}
    >
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

function LeadCard({ lead, index }: { lead: Lead; index: number }) {
  const [pitchOpen, setPitchOpen] = useState(false);
  const instagramUrl = `https://instagram.com/${lead.username}`;
  const whatsappUrl = lead.whatsapp_number
    ? `https://wa.me/${lead.whatsapp_number.replace(/[^0-9]/g, "")}`
    : null;

  return (
    <div className="bg-[#121214] border border-white/[0.06] rounded-xl overflow-hidden transition-all duration-200 hover:border-white/10">
      {/* Card Header */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-white/80 hover:text-[#D4AF37] transition-colors truncate"
            >
              @{lead.username}
            </a>
            {lead.whatsapp_found ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                <svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono text-white/25 border border-white/10 flex-shrink-0">
                DM only
              </span>
            )}
          </div>
          <p className="text-white/70 text-sm truncate" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "15px" }}>
            {lead.business_name}
          </p>
        </div>
        {lead.followers && (
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] font-mono text-white/25">followers</p>
            <p className="text-sm font-mono text-[#D4AF37]">{lead.followers}</p>
          </div>
        )}
      </div>

      {/* Bio */}
      <div className="px-4 pb-3">
        <p className="text-xs text-white/40 leading-relaxed">{lead.bio || "No bio available"}</p>
      </div>

      {/* Contact row */}
      {(lead.whatsapp_number || lead.email) && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {lead.whatsapp_number && (
            <span className="text-[10px] font-mono text-emerald-400/70 bg-emerald-500/5 border border-emerald-500/15 rounded px-2 py-1">
              📱 {lead.whatsapp_number}
            </span>
          )}
          {lead.email && (
            <span className="text-[10px] font-mono text-blue-400/70 bg-blue-500/5 border border-blue-500/15 rounded px-2 py-1">
              ✉️ {lead.email}
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        <CopyButton pitch={lead.pitch} />
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-mono font-medium rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all duration-200 flex items-center gap-1.5"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            WhatsApp
          </a>
        )}
        <button
          onClick={() => setPitchOpen(!pitchOpen)}
          className="px-3 py-1.5 text-xs font-mono text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 rounded transition-all duration-200 flex items-center gap-1.5"
        >
          {pitchOpen ? "Hide Pitch" : "View Pitch"}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-200 ${pitchOpen ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Pitch drawer */}
      {pitchOpen && (
        <div className="px-4 py-4 bg-[#D4AF37]/[0.03] border-t border-[#D4AF37]/10">
          <p className="text-[10px] font-mono text-[#D4AF37]/60 uppercase tracking-widest mb-2">Generated DM Pitch</p>
          <p className="text-white/65 leading-relaxed" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "15px" }}>
            {lead.pitch}
          </p>
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
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [customCity, setCustomCity] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const effectiveCity = city === "__custom__" ? customCity : city;

  const handleHunt = async () => {
    if (!niche.trim() || !effectiveCity.trim()) return;
    setLoading(true);
    setError(null);
    setLeads([]);
    setHasSearched(true);
    setSidebarOpen(false);

    try {
      const response = await fetch(`${API_URL}/api/hunt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: niche.trim(), city: effectiveCity.trim() }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown server error" }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
      const data: Lead[] = await response.json();
      setLeads(data);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleHunt();
  };

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
          <p className="text-white font-medium" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "16px" }}>
            InstaLead AI
          </p>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white/60 hover:text-white transition-colors p-2"
        >
          {sidebarOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`
          fixed lg:relative inset-y-0 left-0 z-50
          w-[300px] flex-shrink-0 border-r border-white/[0.06] bg-[#0E0E10] flex flex-col
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          top-14 lg:top-0
        `}>
          {/* Logo — desktop only */}
          <div className="hidden lg:block px-7 pt-8 pb-6 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium leading-none" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "18px", letterSpacing: "0.02em" }}>
                  InstaLead AI
                </p>
                <p className="text-white/30 text-[10px] font-mono mt-0.5 tracking-wider">LEAD HUNTER v5.0</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="flex-1 px-6 py-7 space-y-6 overflow-y-auto">
            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2.5">
                Business Niche
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. fashion boutique"
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 placeholder-white/20 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200"
              />
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {NICHE_SUGGESTIONS.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    onClick={() => setNiche(s)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-all duration-150 ${
                      niche === s
                        ? "border-[#D4AF37]/50 text-[#D4AF37] bg-[#D4AF37]/8"
                        : "border-white/10 text-white/35 hover:border-white/25 hover:text-white/55"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2.5">
                Target City
              </label>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200 appearance-none cursor-pointer"
              >
                <option value="" disabled>Select a city...</option>
                {NIGERIAN_CITIES.map((c) => (
                  <option key={c} value={c} className="bg-[#121214]">{c}</option>
                ))}
                <option value="__custom__" className="bg-[#121214]">Other (type below)</option>
              </select>
              {city === "__custom__" && (
                <input
                  type="text"
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter city name..."
                  className="w-full mt-2 bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 placeholder-white/20 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200"
                />
              )}
            </div>

            <div className="pt-2 space-y-2">
              <button
                onClick={handleHunt}
                disabled={loading || !niche.trim() || !effectiveCity.trim()}
                className={`w-full py-3 px-4 rounded text-sm font-mono font-medium tracking-wider uppercase transition-all duration-200 ${
                  loading || !niche.trim() || !effectiveCity.trim()
                    ? "bg-white/5 text-white/25 border border-white/10 cursor-not-allowed"
                    : "bg-[#D4AF37] text-[#0B0B0C] hover:bg-[#e0bc3f] active:scale-[0.98] cursor-pointer shadow-[0_0_30px_rgba(212,175,55,0.2)]"
                }`}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    Hunting...
                  </span>
                ) : "⚡ Start Lead Hunt"}
              </button>

              {leads.length > 0 && !loading && (
                <button
                  onClick={() => exportToCSV(leads, niche, effectiveCity)}
                  className="w-full py-2.5 px-4 rounded text-xs font-mono font-medium tracking-wider uppercase border border-[#D4AF37]/30 text-[#D4AF37]/70 hover:border-[#D4AF37]/60 hover:text-[#D4AF37] transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export CSV ({leads.length} leads)
                </button>
              )}

              {loading && (
                <p className="text-center text-[10px] font-mono text-white/25 leading-relaxed">
                  Running 3 searches + scraping profiles<br />This takes 15–25 seconds...
                </p>
              )}
            </div>
          </div>

          {/* Stats */}
          {hasSearched && !loading && (
            <div className="px-6 py-5 border-t border-white/[0.06]">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#121214] rounded px-2 py-2">
                  <p className="text-[9px] font-mono text-white/30 mb-0.5">Leads</p>
                  <p className="text-base font-medium text-[#D4AF37]" style={{ fontFamily: "var(--font-cormorant), serif" }}>{leads.length}</p>
                </div>
                <div className="bg-[#121214] rounded px-2 py-2">
                  <p className="text-[9px] font-mono text-white/30 mb-0.5">WhatsApp</p>
                  <p className="text-base font-medium text-emerald-400" style={{ fontFamily: "var(--font-cormorant), serif" }}>{leads.filter(l => l.whatsapp_found).length}</p>
                </div>
                <div className="bg-[#121214] rounded px-2 py-2">
                  <p className="text-[9px] font-mono text-white/30 mb-0.5">Emails</p>
                  <p className="text-base font-medium text-blue-400" style={{ fontFamily: "var(--font-cormorant), serif" }}>{leads.filter(l => l.email).length}</p>
                </div>
              </div>
            </div>
          )}

          <div className="px-6 pb-6">
            <p className="text-[10px] font-mono text-white/20 leading-relaxed">
              Searches public Instagram profiles indexed by Google. No scraping. No Instagram API required.
            </p>
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden top-14"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Desktop top bar */}
          <div className="hidden lg:flex h-14 border-b border-white/[0.06] items-center justify-between px-8 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_6px_rgba(212,175,55,0.8)]" />
              <span className="text-[11px] font-mono text-white/35 uppercase tracking-widest">Lead Results</span>
              {hasSearched && !loading && (
                <span className="text-[11px] font-mono text-white/20">— {niche} · {effectiveCity}</span>
              )}
            </div>
            {leads.length > 0 && (
              <span className="text-[10px] font-mono text-white/25">{leads.length} result{leads.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Results */}
          <div ref={resultsRef} className="flex-1 overflow-y-auto p-4 lg:p-6">

            {/* Empty state */}
            {!hasSearched && !loading && (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
                <div className="w-14 h-14 rounded-2xl bg-[#D4AF37]/8 border border-[#D4AF37]/15 flex items-center justify-center mb-5">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="1.5" opacity="0.7">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <h2 className="text-white/70 mb-2" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "22px", fontWeight: 300 }}>
                  Your leads will appear here
                </h2>
                <p className="text-white/25 text-xs font-mono max-w-xs leading-relaxed mb-8">
                  Enter a niche and city, then tap Start Lead Hunt to find Instagram businesses that need your services.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg w-full">
                  {[
                    { icon: "🔍", label: "3x Google Search", desc: "30 results from parallel queries" },
                    { icon: "🤖", label: "AI Pitch Writing", desc: "Gemini + Groq fallback" },
                    { icon: "📋", label: "Export & Contact", desc: "CSV export + WhatsApp button" },
                  ].map((item) => (
                    <div key={item.label} className="bg-[#121214] border border-white/[0.06] rounded-lg p-4 text-left">
                      <div className="text-xl mb-2">{item.icon}</div>
                      <p className="text-[11px] font-mono text-white/50 mb-1">{item.label}</p>
                      <p className="text-[10px] text-white/25 leading-relaxed">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 max-w-2xl mb-4">
                <div className="flex items-start gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-sm text-red-300/70 font-mono leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {/* Skeleton */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
                <div className="col-span-full flex items-center justify-center gap-2 py-2">
                  <div className="w-1 h-1 rounded-full bg-[#D4AF37]/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1 h-1 rounded-full bg-[#D4AF37]/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1 h-1 rounded-full bg-[#D4AF37]/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="text-[10px] font-mono text-white/25 ml-1">Scraping profiles + generating pitches...</span>
                </div>
              </div>
            )}

            {/* Results grid */}
            {!loading && leads.length > 0 && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {leads.map((lead, i) => (
                    <LeadCard key={`${lead.username}-${i}`} lead={lead} index={i} />
                  ))}
                </div>
                <p className="text-[10px] font-mono text-white/20 text-center mt-6">
                  {leads.length} leads found for <span className="text-white/35">{niche}</span> in <span className="text-white/35">{effectiveCity}</span>
                </p>
              </div>
            )}

            {/* No results */}
            {!loading && hasSearched && leads.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-center px-4">
                <p className="text-white/50 mb-2" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "20px" }}>
                  No results found
                </p>
                <p className="text-white/25 text-xs font-mono max-w-xs leading-relaxed">
                  Try a broader niche or a larger city.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
