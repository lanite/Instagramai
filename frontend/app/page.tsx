"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const FREE_SEARCH_LIMIT = 5;

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
  score?: number;
}

interface SearchHistory {
  id: string;
  niche: string;
  city: string;
  country: string;
  lead_count: number;
  created_at: string;
  results: Lead[];
}

function exportToCSV(leads: Lead[], niche: string, city: string, country: string) {
  const headers = ["Username", "Instagram URL", "Business Name", "Bio", "WhatsApp", "WhatsApp Number", "Email", "Followers", "Score", "Pitch"];
  const rows = leads.map(lead => [
    `@${lead.username}`,
    `https://instagram.com/${lead.username}`,
    lead.business_name,
    `"${lead.bio.replace(/"/g, "'")}"`,
    lead.whatsapp_found ? "Yes" : "No",
    lead.whatsapp_number || "",
    lead.email || "",
    lead.followers || "",
    lead.score || 0,
    `"${lead.pitch.replace(/"/g, "'")}"`,
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `instalead-${niche}-${city}-${country}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
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

function LeadCard({ lead }: { lead: Lead }) {
  const [pitchOpen, setPitchOpen] = useState(false);
  const instagramUrl = `https://instagram.com/${lead.username}`;
  const whatsappUrl = lead.whatsapp_number
    ? `https://wa.me/${lead.whatsapp_number.replace(/[^0-9]/g, "")}`
    : null;

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
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex-shrink-0">
                WhatsApp
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono text-white/25 border border-white/10 flex-shrink-0">
                DM only
              </span>
            )}
            {lead.score !== undefined && <ScoreBadge score={lead.score} />}
          </div>
          <p className="text-white/70 truncate" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "15px" }}>
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

      <div className="px-4 pb-3">
        <p className="text-xs text-white/40 leading-relaxed">{lead.bio || "No bio available"}</p>
      </div>

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

      <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
        <CopyButton pitch={lead.pitch} />
        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 text-xs font-mono font-medium rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all duration-200 flex items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [searchCount, setSearchCount] = useState(0);
  const [isPremium, setIsPremium] = useState(false);
  const [niche, setNiche] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUsage(session.user.id);
        loadHistory(session.user.id);
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUsage(session.user.id);
        loadHistory(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUsage = async (userId: string) => {
    const { data } = await supabase
      .from("usage")
      .select("search_count, is_premium")
      .eq("user_id", userId)
      .single();
    if (data) {
      setSearchCount(data.search_count);
      setIsPremium(data.is_premium);
    }
  };

  const loadHistory = async (userId: string) => {
    const { data } = await supabase
      .from("searches")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setHistory(data as SearchHistory[]);
  };

  const saveSearch = async (leads: Lead[]) => {
    if (!user) return;
    await supabase.from("searches").insert({
      user_id: user.id,
      niche,
      city: city || state,
      country,
      results: leads,
      lead_count: leads.length,
    });

    const { data: existing } = await supabase
      .from("usage")
      .select("id, search_count")
      .eq("user_id", user.id)
      .single();

    if (existing) {
      await supabase
        .from("usage")
        .update({ search_count: existing.search_count + 1 })
        .eq("user_id", user.id);
      setSearchCount(existing.search_count + 1);
    } else {
      await supabase.from("usage").insert({
        user_id: user.id,
        search_count: 1,
        is_premium: false,
      });
      setSearchCount(1);
    }

    loadHistory(user.id);
  };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSearchCount(0);
    setIsPremium(false);
    setHistory([]);
  };

  const handleHunt = async () => {
    if (!niche.trim()) return;
    if (!user) return;

    if (!isPremium && searchCount >= FREE_SEARCH_LIMIT) return;

    const location = city.trim() || state || country;
    setLoading(true);
    setError(null);
    setLeads([]);
    setHasSearched(true);
    setSidebarOpen(false);

    try {
      const response = await fetch(`${API_URL}/api/hunt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: niche.trim(),
          city: location,
          country,
          state: state || "",
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown server error" }));
        throw new Error(errorData.detail || `Server error: ${response.status}`);
      }
      const data: Lead[] = await response.json();
      setLeads(data);
      await saveSearch(data);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryResult = (item: SearchHistory) => {
    setLeads(item.results);
    setNiche(item.niche);
    setCity(item.city);
    setCountry(item.country);
    setHasSearched(true);
    setHistoryOpen(false);
    setSidebarOpen(false);
  };

  const remainingSearches = FREE_SEARCH_LIMIT - searchCount;
  const isLimitReached = !isPremium && searchCount >= FREE_SEARCH_LIMIT;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          <span className="text-white/40 font-mono text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="1.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <h1 className="text-white mb-2" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "32px", fontWeight: 300, letterSpacing: "0.02em" }}>
              InstaLead AI
            </h1>
            <p className="text-white/30 text-xs font-mono tracking-widest uppercase">Lead Hunter v6.0</p>
            <p className="text-white/40 text-sm font-mono mt-4 leading-relaxed max-w-xs mx-auto">
              Find Instagram businesses worldwide that need a website. Sign in to start hunting leads.
            </p>
          </div>

          <div className="bg-[#121214] border border-white/[0.06] rounded-2xl p-6 space-y-4">
            <div className="grid grid-cols-3 gap-3 mb-2">
              {[
                { icon: "🔍", label: "30+ leads", desc: "per search" },
                { icon: "🤖", label: "AI pitches", desc: "auto-generated" },
                { icon: "🌍", label: "Worldwide", desc: "any country" },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <div className="text-xl mb-1">{item.icon}</div>
                  <p className="text-[11px] font-mono text-white/60">{item.label}</p>
                  <p className="text-[10px] font-mono text-white/25">{item.desc}</p>
                </div>
              ))}
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full py-3 px-4 bg-white hover:bg-gray-100 text-gray-900 rounded-xl font-mono text-sm font-medium transition-all duration-200 flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            <p className="text-center text-[10px] font-mono text-white/20 leading-relaxed">
              {FREE_SEARCH_LIMIT} free searches included. No credit card required.
            </p>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="flex items-center gap-2">
          {!isPremium && (
            <span className="text-[10px] font-mono text-white/30">
              {Math.max(0, remainingSearches)} left
            </span>
          )}
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
          {/* Logo desktop */}
          <div className="hidden lg:block px-7 pt-8 pb-6 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-medium leading-none" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "18px" }}>
                    InstaLead AI
                  </p>
                  <p className="text-white/30 text-[10px] font-mono mt-0.5">LEAD HUNTER v6.0</p>
                </div>
              </div>
            </div>
          </div>

          {/* User info */}
          <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#D4AF37]/20 flex items-center justify-center flex-shrink-0 text-xs font-mono text-[#D4AF37]">
                {user.email?.[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-mono text-white/60 truncate">{user.email}</p>
                <p className="text-[10px] font-mono text-white/25">
                  {isPremium ? "✨ Premium" : `${Math.max(0, remainingSearches)}/${FREE_SEARCH_LIMIT} searches left`}
                </p>
              </div>
            </div>
            <button onClick={handleSignOut} className="text-white/25 hover:text-white/60 transition-colors flex-shrink-0 ml-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 px-6 py-5 space-y-4 overflow-y-auto">
            {/* Niche */}
            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">
                Business Niche
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleHunt()}
                placeholder="e.g. fashion boutique"
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 placeholder-white/20 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {NICHE_SUGGESTIONS.slice(0, 6).map((s) => (
                  <button key={s} onClick={() => setNiche(s)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-all duration-150 ${
                      niche === s ? "border-[#D4AF37]/50 text-[#D4AF37]" : "border-white/10 text-white/35 hover:border-white/25"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Country */}
            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">
                Country
              </label>
              <select
                value={country}
                onChange={(e) => { setCountry(e.target.value); setState(""); setCity(""); }}
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200 appearance-none"
              >
                {Object.keys(COUNTRIES).map((c) => (
                  <option key={c} value={c} className="bg-[#121214]">{c}</option>
                ))}
              </select>
            </div>

            {/* State */}
            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">
                State / Region
              </label>
              <select
                value={state}
                onChange={(e) => { setState(e.target.value); setCity(""); }}
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200 appearance-none"
              >
                <option value="">All states...</option>
                {(COUNTRIES[country] || []).map((s) => (
                  <option key={s} value={s} className="bg-[#121214]">{s}</option>
                ))}
              </select>
            </div>

            {/* City */}
            <div>
              <label className="block text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">
                City (optional)
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleHunt()}
                placeholder="e.g. Lekki, Surulere..."
                className="w-full bg-[#121214] border border-white/10 rounded px-3.5 py-2.5 text-sm text-white/80 placeholder-white/20 font-mono focus:outline-none focus:border-[#D4AF37]/50 transition-all duration-200"
              />
            </div>

            {/* Hunt button */}
            <div className="pt-1 space-y-2">
              {isLimitReached ? (
                <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-xl p-4 text-center">
                  <p className="text-[#D4AF37] text-xs font-mono mb-1">Free limit reached</p>
                  <p className="text-white/40 text-[10px] font-mono leading-relaxed mb-3">
                    You've used all {FREE_SEARCH_LIMIT} free searches. Send a WhatsApp message to unlock unlimited access.
                  </p>
                  <a
                    href="https://wa.me/2348000000000?text=Hi, I want to upgrade my InstaLead AI account. My email is: " + (user.email || "")
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 bg-[#D4AF37] text-[#0B0B0C] rounded font-mono text-xs font-medium flex items-center justify-center gap-2"
                  >
                    💬 Upgrade via WhatsApp
                  </a>
                </div>
              ) : (
                <button
                  onClick={handleHunt}
                  disabled={loading || !niche.trim()}
                  className={`w-full py-3 px-4 rounded text-sm font-mono font-medium tracking-wider uppercase transition-all duration-200 ${
                    loading || !niche.trim()
                      ? "bg-white/5 text-white/25 border border-white/10 cursor-not-allowed"
                      : "bg-[#D4AF37] text-[#0B0B0C] hover:bg-[#e0bc3f] active:scale-[0.98] shadow-[0_0_30px_rgba(212,175,55,0.2)]"
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
              )}

              {leads.length > 0 && !loading && (
                <button
                  onClick={() => exportToCSV(leads, niche, city || state, country)}
                  className="w-full py-2.5 px-4 rounded text-xs font-mono font-medium border border-[#D4AF37]/30 text-[#D4AF37]/70 hover:border-[#D4AF37]/60 hover:text-[#D4AF37] transition-all duration-200 flex items-center justify-center gap-2"
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
                  Running searches + scraping profiles<br />15–25 seconds...
                </p>
              )}
            </div>

            {/* Search history */}
            {history.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setHistoryOpen(!historyOpen)}
                  className="w-full flex items-center justify-between text-[10px] font-mono text-white/30 uppercase tracking-widest hover:text-white/50 transition-colors"
                >
                  Recent Searches
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`transition-transform ${historyOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {historyOpen && (
                  <div className="mt-2 space-y-1.5">
                    {history.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => loadHistoryResult(item)}
                        className="w-full text-left px-3 py-2 bg-[#121214] border border-white/[0.06] rounded-lg hover:border-white/15 transition-all duration-150"
                      >
                        <p className="text-xs font-mono text-white/60 truncate">{item.niche}</p>
                        <p className="text-[10px] font-mono text-white/25">{item.city} · {item.country} · {item.lead_count} leads</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          {hasSearched && !loading && leads.length > 0 && (
            <div className="px-6 py-4 border-t border-white/[0.06]">
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
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/60 z-40 lg:hidden top-14" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="hidden lg:flex h-14 border-b border-white/[0.06] items-center justify-between px-8 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shadow-[0_0_6px_rgba(212,175,55,0.8)]" />
              <span className="text-[11px] font-mono text-white/35 uppercase tracking-widest">Lead Results</span>
              {hasSearched && !loading && (
                <span className="text-[11px] font-mono text-white/20">— {niche} · {city || state} · {country}</span>
              )}
            </div>
            {leads.length > 0 && (
              <span className="text-[10px] font-mono text-white/25">{leads.length} result{leads.length !== 1 ? "s" : ""}</span>
            )}
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
                  Your leads will appear here
                </h2>
                <p className="text-white/25 text-xs font-mono max-w-xs leading-relaxed mb-8">
                  Select a country, state, and niche then tap Start Lead Hunt.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg w-full">
                  {[
                    { icon: "🌍", label: "Any Country", desc: "Nigeria, UK, US, Ghana and more" },
                    { icon: "🤖", label: "AI Pitches", desc: "Gemini + Groq fallback" },
                    { icon: "⭐", label: "Lead Scoring", desc: "Ranked by quality" },
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
                  <span className="text-[10px] font-mono text-white/25 ml-1">Scraping profiles + generating pitches...</span>
                </div>
              </div>
            )}

            {!loading && leads.length > 0 && (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {leads.map((lead, i) => (
                    <LeadCard key={`${lead.username}-${i}`} lead={lead} />
                  ))}
                </div>
                <p className="text-[10px] font-mono text-white/20 text-center mt-6">
                  {leads.length} leads — {niche} · {city || state} · {country}
                </p>
              </div>
            )}

            {!loading && hasSearched && leads.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center min-h-[300px] text-center px-4">
                <p className="text-white/50 mb-2" style={{ fontFamily: "var(--font-cormorant), serif", fontSize: "20px" }}>
                  No results found
                </p>
                <p className="text-white/25 text-xs font-mono max-w-xs leading-relaxed">
                  Try a broader niche or different location.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
