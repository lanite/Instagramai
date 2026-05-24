import os
import re
import json
import asyncio
import httpx
import google.generativeai as genai
from groq import Groq
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SERPER_API_KEY = os.getenv("SERPER_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
SCRAPER_API_KEY = os.getenv("SCRAPER_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SERPER_API_KEY:
    raise RuntimeError("SERPER_API_KEY is not set.")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set.")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set.")
if not SCRAPER_API_KEY:
    raise RuntimeError("SCRAPER_API_KEY is not set.")
if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is not set.")
if not SUPABASE_SERVICE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_KEY is not set.")

genai.configure(api_key=GEMINI_API_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

COUNTRY_CODES = {
    "Nigeria": "ng", "Ghana": "gh", "Kenya": "ke", "South Africa": "za",
    "United States": "us", "United Kingdom": "gb", "Canada": "ca",
    "Australia": "au", "India": "in", "UAE": "ae",
}

app = FastAPI(title="InstaLead AI", version="7.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://*.vercel.app",
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

INSTAGRAM_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Cache-Control": "max-age=0",
}


class HuntRequest(BaseModel):
    niche: str
    city: str
    country: str = "Nigeria"
    state: str = ""


class LeadResult(BaseModel):
    username: str
    business_name: str
    bio: str
    whatsapp_found: bool
    whatsapp_number: str
    email: str
    followers: str
    pitch: str
    score: int


def score_lead(
    whatsapp_number: str,
    email: str,
    followers: str,
    bio: str,
    username: str,
    whatsapp_found: bool,
) -> int:
    score = 0
    if whatsapp_number:
        score += 30
    elif whatsapp_found:
        score += 15
    if email:
        score += 20
    if followers:
        try:
            raw = followers.upper().replace(",", "").replace("K", "000").replace("M", "000000")
            count = int(re.sub(r"[^0-9]", "", raw))
            if count >= 10000:
                score += 20
            elif count >= 1000:
                score += 12
            else:
                score += 5
        except Exception:
            score += 5
    if len(bio) > 60:
        score += 15
    elif len(bio) > 20:
        score += 8
    if len(username) >= 4 and not re.search(r"\d{4,}", username):
        score += 15
    return min(score, 100)


def extract_instagram_username(url: str) -> str:
    url = url.rstrip("/")
    skip_paths = ["/p/", "/reel/", "/reels/", "/stories/", "/explore/", "/tv/"]
    if any(path in url for path in skip_paths):
        return "unknown"
    try:
        path = url.split("instagram.com/")[-1]
        username = path.split("/")[0].split("?")[0]
        username = re.sub(r"[^a-zA-Z0-9._]", "", username)
        if len(username) > 2:
            return username
    except Exception:
        pass
    return "unknown"


def detect_whatsapp(text: str) -> bool:
    text_lower = text.lower()
    patterns = [
        "whatsapp", "whats app", "whatsap", "wa.me",
        "chat us", "chat me", "+234", "08", "07", "09",
    ]
    return any(p in text_lower for p in patterns)


def extract_whatsapp_number(text: str) -> str:
    patterns = [
        r"wa\.me/(\d+)",
        r"whatsapp[:\s]+(\+?[\d\s\-]{10,15})",
        r"(\+234[\d\s\-]{9,12})",
        r"\b(0[789][01]\d{8})\b",
        r"\b(234[789][01]\d{8})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return re.sub(r"[\s\-]", "", match.group(1))
    return ""


def extract_email(text: str) -> str:
    match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    return match.group(0) if match else ""


def derive_business_name(username: str, title: str) -> str:
    if title:
        cleaned = re.sub(r"\(.*?\)", "", title)
        cleaned = re.sub(r"\|.*", "", cleaned)
        cleaned = re.sub(r"•.*", "", cleaned)
        cleaned = cleaned.strip()
        if len(cleaned) > 3:
            return cleaned[:60]
    return username.replace("_", " ").replace(".", " ").title()


def clean_bio(snippet: str) -> str:
    snippet = re.sub(r"\d+ (Followers|Following|Posts).*?-", "", snippet)
    snippet = re.sub(r"http\S+", "", snippet)
    return snippet.strip()[:120]


def parse_profile_html(html: str, snippet_bio: str) -> dict:
    result = {"bio": snippet_bio, "whatsapp_number": "", "email": "", "followers": ""}
    try:
        soup = BeautifulSoup(html, "html.parser")
        full_text = soup.get_text(separator=" ", strip=True)

        meta_desc = soup.find("meta", {"name": "description"})
        if meta_desc and meta_desc.get("content"):
            result["bio"] = meta_desc["content"][:200]

        followers_match = re.search(r"([\d,\.]+[KMk]?)\s*Followers", full_text, re.IGNORECASE)
        if followers_match:
            result["followers"] = followers_match.group(1)

        whatsapp_number = extract_whatsapp_number(full_text)
        if whatsapp_number:
            result["whatsapp_number"] = whatsapp_number

        email = extract_email(full_text)
        if email:
            result["email"] = email

        for script in soup.find_all("script", {"type": "application/ld+json"}):
            try:
                data = json.loads(script.string or "")
                if isinstance(data, dict):
                    if data.get("description"):
                        result["bio"] = data["description"][:200]
                    for stat in data.get("interactionStatistic", []):
                        if stat.get("interactionType", "").endswith("FollowAction"):
                            result["followers"] = str(stat.get("userInteractionCount", ""))
            except Exception:
                continue
    except Exception:
        pass
    return result


async def fetch_profile_with_scraperapi(username: str, client: httpx.AsyncClient) -> str:
    url = f"https://www.instagram.com/{username}/"
    scraper_url = f"https://api.scraperapi.com/?api_key={SCRAPER_API_KEY}&url={url}&render=false"
    try:
        response = await client.get(scraper_url, timeout=15.0)
        if response.status_code == 200:
            return response.text
    except Exception:
        pass
    return ""


async def fetch_profile_direct(username: str, client: httpx.AsyncClient) -> str:
    try:
        response = await client.get(
            f"https://www.instagram.com/{username}/",
            headers=INSTAGRAM_HEADERS,
            timeout=10.0,
        )
        if response.status_code == 200:
            return response.text
    except Exception:
        pass
    return ""


async def fetch_instagram_profile(username: str, client: httpx.AsyncClient) -> dict:
    empty = {"bio": "", "whatsapp_number": "", "email": "", "followers": ""}
    html = await fetch_profile_with_scraperapi(username, client)
    if not html:
        html = await fetch_profile_direct(username, client)
    if not html:
        return empty
    return parse_profile_html(html, "")


def build_pitch_prompt(
    business_name: str, username: str, bio: str,
    niche: str, city: str, country: str,
    followers: str, whatsapp_number: str,
) -> str:
    extra = ""
    if followers:
        extra += f"\n- Followers: {followers}"
    if whatsapp_number:
        extra += f"\n- WhatsApp: {whatsapp_number}"
    return f"""Write a short Instagram DM pitch for a web designer reaching out to a small business owner.

Business details:
- Business name: {business_name}
- Instagram: @{username}
- Bio: {bio}
- Niche: {niche}
- Location: {city}, {country}{extra}

Requirements:
- Write in the voice of a friendly, competent local tech freelancer
- Acknowledge they currently take orders manually via WhatsApp or DMs
- Explain that a professional website will save them hours every week
- Keep it warm and conversational, not salesy or corporate
- Between 60 and 90 words
- End with a soft call-to-action offering a free mockup
- Return ONLY the pitch text, nothing else"""


def generate_pitch_with_gemini(business_name, username, bio, niche, city, country, followers, whatsapp_number):
    prompt = build_pitch_prompt(business_name, username, bio, niche, city, country, followers, whatsapp_number)
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config=genai.GenerationConfig(temperature=0.8, max_output_tokens=200),
    )
    return model.generate_content(prompt).text.strip()


def generate_pitch_with_groq(business_name, username, bio, niche, city, country, followers, whatsapp_number):
    prompt = build_pitch_prompt(business_name, username, bio, niche, city, country, followers, whatsapp_number)
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=200,
    )
    return response.choices[0].message.content.strip()


def generate_pitch(business_name, username, bio, niche, city, country, followers, whatsapp_number):
    try:
        return generate_pitch_with_gemini(business_name, username, bio, niche, city, country, followers, whatsapp_number)
    except Exception as e:
        msg = str(e).lower()
        if any(c in msg for c in ["429", "404", "quota", "rate", "limit", "not found"]):
            try:
                return generate_pitch_with_groq(business_name, username, bio, niche, city, country, followers, whatsapp_number)
            except Exception:
                pass
        else:
            try:
                return generate_pitch_with_groq(business_name, username, bio, niche, city, country, followers, whatsapp_number)
            except Exception:
                pass
    return (
        f"Hi {business_name}! Love what you're doing on Instagram. "
        f"I noticed you're managing orders manually via DMs/WhatsApp — "
        f"a professional website can automate your orders and save you hours every week. "
        f"Want me to show you a free mockup of what it could look like?"
    )


async def run_serper_query(query: str, gl: str, client: httpx.AsyncClient) -> list[dict]:
    try:
        response = await client.post(
            "https://google.serper.dev/search",
            json={"q": query, "num": 10, "gl": gl},
            headers={"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"},
            timeout=15.0,
        )
        response.raise_for_status()
        return response.json().get("organic", [])
    except Exception:
        return []


@app.get("/")
async def health_check():
    return {"status": "InstaLead AI is running", "version": "7.0.0"}


@app.post("/api/hunt", response_model=list[LeadResult])
async def hunt_leads(req: HuntRequest):
    if not req.niche.strip():
        raise HTTPException(status_code=422, detail="Niche cannot be empty.")

    niche = req.niche.strip()
    city = req.city.strip()
    country = req.country.strip()
    state = req.state.strip()
    gl = COUNTRY_CODES.get(country, "us")

    location = city or state or country

    queries = [
        f'site:instagram.com "DM to order" "{location}" {niche}',
        f'site:instagram.com "WhatsApp to order" "{location}" {niche}',
        f'site:instagram.com "send a DM" "{location}" {niche}',
        f'site:instagram.com "DM us" "{location}" {niche}',
        f'site:instagram.com "order via WhatsApp" "{location}" {niche}',
        f'site:instagram.com "call or WhatsApp" "{location}" {niche}',
    ]

    async with httpx.AsyncClient(timeout=20.0) as client:
        serper_results = await asyncio.gather(*[run_serper_query(q, gl, client) for q in queries])

        seen_usernames: set = set()
        unique_results = []
        for batch in serper_results:
            for result in batch:
                url = result.get("link", "")
                if "instagram.com" not in url:
                    continue
                username = extract_instagram_username(url)
                if username == "unknown" or username in seen_usernames:
                    continue
                seen_usernames.add(username)
                unique_results.append(result)

        if not unique_results:
            return []

        unique_results = unique_results[:50]

        profile_data = await asyncio.gather(*[
            fetch_instagram_profile(extract_instagram_username(r.get("link", "")), client)
            for r in unique_results
        ])

        leads = []
        for result, profile in zip(unique_results, profile_data):
            url = result.get("link", "")
            title = result.get("title", "")
            snippet = result.get("snippet", "")

            username = extract_instagram_username(url)
            business_name = derive_business_name(username, title)
            bio = (profile.get("bio") or clean_bio(snippet))[:200]
            whatsapp_number = profile.get("whatsapp_number") or extract_whatsapp_number(snippet)
            email = profile.get("email") or extract_email(snippet)
            followers = profile.get("followers", "")
            whatsapp_found = bool(whatsapp_number) or detect_whatsapp(snippet + " " + title)

            lead_score = score_lead(whatsapp_number, email, followers, bio, username, whatsapp_found)
            pitch = generate_pitch(business_name, username, bio, niche, city or location, country, followers, whatsapp_number)

            leads.append(LeadResult(
                username=username,
                business_name=business_name,
                bio=bio,
                whatsapp_found=whatsapp_found,
                whatsapp_number=whatsapp_number,
                email=email,
                followers=followers,
                pitch=pitch,
                score=lead_score,
            ))

        leads.sort(key=lambda x: x.score, reverse=True)
        return leads
