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

load_dotenv()

SERPER_API_KEY = os.getenv("SERPER_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
SCRAPER_API_KEY = os.getenv("SCRAPER_API_KEY")

if not SERPER_API_KEY:
    raise RuntimeError("SERPER_API_KEY is not set.")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set.")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set.")
if not SCRAPER_API_KEY:
    raise RuntimeError("SCRAPER_API_KEY is not set.")

genai.configure(api_key=GEMINI_API_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)

COUNTRY_CODES = {
    "Nigeria": "ng", "Ghana": "gh", "Kenya": "ke", "South Africa": "za",
    "United States": "us", "United Kingdom": "gb", "Canada": "ca",
    "Australia": "au", "India": "in", "UAE": "ae",
}

app = FastAPI(title="InstaLead AI", version="8.0.0")

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
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
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


class BusinessResult(BaseModel):
    name: str
    phone: str
    address: str
    rating: str
    reviews: str
    category: str
    website: str
    website_status: str
    pitch: str
    score: int


def extract_email(text: str) -> str:
    match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    return match.group(0) if match else ""


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


def detect_whatsapp(text: str) -> bool:
    text_lower = text.lower()
    patterns = ["whatsapp", "whats app", "whatsap", "wa.me", "chat us", "chat me", "+234", "08", "07", "09"]
    return any(p in text_lower for p in patterns)


def score_lead(whatsapp_number, email, followers, bio, username, whatsapp_found):
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
        wn = extract_whatsapp_number(full_text)
        if wn:
            result["whatsapp_number"] = wn
        em = extract_email(full_text)
        if em:
            result["email"] = em
    except Exception:
        pass
    return result


async def fetch_instagram_profile(username: str, client: httpx.AsyncClient) -> dict:
    empty = {"bio": "", "whatsapp_number": "", "email": "", "followers": ""}
    url = f"https://www.instagram.com/{username}/"
    scraper_url = f"https://api.scraperapi.com/?api_key={SCRAPER_API_KEY}&url={url}&render=false"
    html = ""
    try:
        response = await client.get(scraper_url, timeout=15.0)
        if response.status_code == 200:
            html = response.text
    except Exception:
        pass
    if not html:
        try:
            response = await client.get(url, headers=INSTAGRAM_HEADERS, timeout=10.0)
            if response.status_code == 200:
                html = response.text
        except Exception:
            pass
    if not html:
        return empty
    return parse_profile_html(html, "")


def classify_website_status(website: str, html: str, status_code: int, reachable: bool) -> str:
    if not website:
        return "NO_WEBSITE"
    if not reachable or status_code >= 400:
        return "BROKEN"
    outdated_signals = 0
    if website.startswith("http://"):
        outdated_signals += 1
    if html:
        html_lower = html.lower()
        if 'name="viewport"' not in html_lower and "name='viewport'" not in html_lower:
            outdated_signals += 1
        if len(html) < 2000:
            outdated_signals += 1
        if "wix.com" in html_lower or "weebly" in html_lower or "flash" in html_lower:
            outdated_signals += 1
        if "<table" in html_lower and "display:grid" not in html_lower and "display: grid" not in html_lower and "flex" not in html_lower:
            outdated_signals += 1
    if outdated_signals >= 2:
        return "OUTDATED"
    return "HEALTHY"


async def check_website_status(website: str, client: httpx.AsyncClient) -> str:
    if not website:
        return "NO_WEBSITE"
    url = website
    if not url.startswith("http"):
        url = "https://" + url
    try:
        response = await client.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)"},
            timeout=8.0,
            follow_redirects=True,
        )
        return classify_website_status(website, response.text, response.status_code, True)
    except Exception:
        return classify_website_status(website, "", 0, False)


def score_business(website_status: str, phone: str, reviews: str) -> int:
    score = 0
    if website_status == "NO_WEBSITE":
        score += 40
    elif website_status == "BROKEN":
        score += 35
    elif website_status == "OUTDATED":
        score += 25
    elif website_status == "HEALTHY":
        score += 10
    if phone:
        score += 20
    if reviews:
        try:
            count = int(re.sub(r"[^0-9]", "", reviews))
            if count >= 50:
                score += 15
            elif count >= 10:
                score += 10
            else:
                score += 5
        except Exception:
            score += 5
    return min(score, 100)


def build_business_pitch_prompt(name, category, address, website_status, country):
    status_context = {
        "NO_WEBSITE": "This business has NO website at all. Pitch building them a professional website from scratch.",
        "BROKEN": "This business has a broken or unreachable website. Pitch fixing/rebuilding their website.",
        "OUTDATED": "This business has an outdated, non-mobile-friendly website. Pitch a modern redesign.",
        "HEALTHY": "This business has a working website but could benefit from a redesign. Pitch a modern refresh to boost conversions.",
    }
    context = status_context.get(website_status, status_context["NO_WEBSITE"])
    return f"""Write a short, warm outreach pitch for a web designer reaching out to a local business.

Business details:
- Name: {name}
- Category: {category}
- Location: {address}, {country}
- Situation: {context}

Requirements:
- Write in the voice of a friendly, competent local web designer
- Reference their specific situation (no website / broken / outdated / redesign)
- Explain the business benefit: more customers finding them online, looking professional, taking orders 24/7
- Keep it warm and conversational, not salesy or corporate
- Between 60 and 90 words
- End with a soft call-to-action offering a free mockup or quick chat
- Return ONLY the pitch text, nothing else"""


def generate_business_pitch_gemini(name, category, address, website_status, country):
    prompt = build_business_pitch_prompt(name, category, address, website_status, country)
    model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config=genai.GenerationConfig(temperature=0.8, max_output_tokens=200),
    )
    return model.generate_content(prompt).text.strip()


def generate_business_pitch_groq(name, category, address, website_status, country):
    prompt = build_business_pitch_prompt(name, category, address, website_status, country)
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=200,
    )
    return response.choices[0].message.content.strip()


def generate_business_pitch(name, category, address, website_status, country):
    try:
        return generate_business_pitch_gemini(name, category, address, website_status, country)
    except Exception as e:
        msg = str(e).lower()
        if any(c in msg for c in ["429", "404", "quota", "rate", "limit", "not found"]):
            try:
                return generate_business_pitch_groq(name, category, address, website_status, country)
            except Exception:
                pass
        else:
            try:
                return generate_business_pitch_groq(name, category, address, website_status, country)
            except Exception:
                pass
    fallback = {
        "NO_WEBSITE": f"Hi {name}! I noticed you don't have a website yet. In today's market, customers search online before they visit — a clean website helps them find you, see what you offer, and reach out. I'd love to build you one that brings in more customers. Want me to show you a free mockup of what it could look like?",
        "BROKEN": f"Hi {name}! I tried visiting your website but it seems to be down or broken. That means potential customers searching for you are hitting a dead end. I can rebuild it into a fast, professional site that works perfectly. Want me to show you a free mockup?",
        "OUTDATED": f"Hi {name}! I came across your website — it works, but it looks a bit dated and isn't mobile-friendly. Most people browse on their phones now, so a modern redesign could bring you a lot more customers. Want me to show you a free mockup of a refreshed design?",
        "HEALTHY": f"Hi {name}! Your website looks good, but I believe a modern redesign could help you convert even more visitors into customers. I specialize in clean, high-converting designs. Want me to show you a free mockup of what an upgrade could look like?",
    }
    return fallback.get(website_status, fallback["NO_WEBSITE"])


async def run_serper_places(query: str, gl: str, client: httpx.AsyncClient) -> list:
    try:
        response = await client.post(
            "https://google.serper.dev/places",
            json={"q": query, "gl": gl},
            headers={"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"},
            timeout=15.0,
        )
        response.raise_for_status()
        return response.json().get("places", [])
    except Exception:
        return []


async def run_serper_query(query: str, gl: str, client: httpx.AsyncClient) -> list:
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
    return {"status": "InstaLead AI is running", "version": "8.0.0"}


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

        seen = set()
        unique_results = []
        for batch in serper_results:
            for result in batch:
                url = result.get("link", "")
                if "instagram.com" not in url:
                    continue
                username = extract_instagram_username(url)
                if username == "unknown" or username in seen:
                    continue
                seen.add(username)
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

            pitch_prompt = f"""Write a short Instagram DM pitch for a web designer reaching out to a small business owner named {business_name} (@{username}) in the {niche} niche in {location}, {country}. They take orders manually via WhatsApp/DMs. Explain a website will save them hours weekly. Warm, conversational, 60-90 words, end offering a free mockup. Return ONLY the pitch."""
            try:
                model = genai.GenerativeModel(model_name="gemini-2.0-flash", generation_config=genai.GenerationConfig(temperature=0.8, max_output_tokens=200))
                pitch = model.generate_content(pitch_prompt).text.strip()
            except Exception:
                try:
                    resp = groq_client.chat.completions.create(model="llama-3.3-70b-versatile", messages=[{"role": "user", "content": pitch_prompt}], temperature=0.8, max_tokens=200)
                    pitch = resp.choices[0].message.content.strip()
                except Exception:
                    pitch = f"Hi {business_name}! Love what you're doing on Instagram. I noticed you take orders manually via DMs/WhatsApp — a website can automate that and save you hours every week. Want me to show you a free mockup?"

            leads.append(LeadResult(
                username=username, business_name=business_name, bio=bio,
                whatsapp_found=whatsapp_found, whatsapp_number=whatsapp_number,
                email=email, followers=followers, pitch=pitch, score=lead_score,
            ))

        leads.sort(key=lambda x: x.score, reverse=True)
        return leads


@app.post("/api/business-hunt", response_model=list[BusinessResult])
async def hunt_businesses(req: HuntRequest):
    if not req.niche.strip():
        raise HTTPException(status_code=422, detail="Niche cannot be empty.")

    niche = req.niche.strip()
    city = req.city.strip()
    country = req.country.strip()
    state = req.state.strip()
    gl = COUNTRY_CODES.get(country, "us")
    location = city or state or country

    queries = [
        f"{niche} in {location}",
        f"{niche} near {location}",
        f"best {niche} {location}",
    ]

    async with httpx.AsyncClient(timeout=20.0) as client:
        places_results = await asyncio.gather(*[run_serper_places(q, gl, client) for q in queries])

        seen = set()
        unique_places = []
        for batch in places_results:
            for place in batch:
                name = place.get("title", "")
                if not name or name in seen:
                    continue
                seen.add(name)
                unique_places.append(place)

        if not unique_places:
            return []

        unique_places = unique_places[:20]

        website_statuses = await asyncio.gather(*[
            check_website_status(place.get("website", ""), client)
            for place in unique_places
        ])

        businesses = []
        for place, website_status in zip(unique_places, website_statuses):
            name = place.get("title", "")
            phone = place.get("phoneNumber", "") or place.get("phone", "")
            address = place.get("address", "")
            rating = str(place.get("rating", "")) if place.get("rating") else ""
            reviews = str(place.get("ratingCount", "")) if place.get("ratingCount") else ""
            category = place.get("category", "") or place.get("type", "")
            website = place.get("website", "")

            biz_score = score_business(website_status, phone, reviews)
            pitch = generate_business_pitch(name, category, address, website_status, country)

            businesses.append(BusinessResult(
                name=name, phone=phone, address=address, rating=rating,
                reviews=reviews, category=category, website=website,
                website_status=website_status, pitch=pitch, score=biz_score,
            ))

        businesses.sort(key=lambda x: x.score, reverse=True)
        return businesses
