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
    raise RuntimeError("SERPER_API_KEY is not set in environment variables.")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set in environment variables.")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set in environment variables.")
if not SCRAPER_API_KEY:
    raise RuntimeError("SCRAPER_API_KEY is not set in environment variables.")

genai.configure(api_key=GEMINI_API_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)

app = FastAPI(title="InstaLead AI", version="5.0.0")

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


class LeadResult(BaseModel):
    username: str
    business_name: str
    bio: str
    whatsapp_found: bool
    whatsapp_number: str
    email: str
    followers: str
    pitch: str


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
    patterns = ["whatsapp", "whats app", "whatsap", "wa.me", "chat us", "chat me", "+234", "08", "07", "09"]
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
            number = re.sub(r"[\s\-]", "", match.group(1))
            return number
    return ""


def extract_email(text: str) -> str:
    match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    if match:
        return match.group(0)
    return ""


def derive_business_name(username: str, title: str) -> str:
    if title:
        cleaned = re.sub(r"\(.*?\)", "", title)
        cleaned = re.sub(r"\|.*", "", cleaned)
        cleaned = re.sub(r"•.*", "", cleaned)
        cleaned = cleaned.strip()
        if len(cleaned) > 3:
            return cleaned[:60]
    name = username.replace("_", " ").replace(".", " ")
    return name.title()


def clean_bio(snippet: str) -> str:
    snippet = re.sub(r"\d+ (Followers|Following|Posts).*?-", "", snippet)
    snippet = re.sub(r"http\S+", "", snippet)
    snippet = snippet.strip()
    return snippet[:120]


def parse_profile_html(html: str, snippet_bio: str) -> dict:
    result = {
        "bio": snippet_bio,
        "whatsapp_number": "",
        "email": "",
        "followers": "",
    }

    try:
        soup = BeautifulSoup(html, "html.parser")
        full_text = soup.get_text(separator=" ", strip=True)

        # Extract bio from meta description
        meta_desc = soup.find("meta", {"name": "description"})
        if meta_desc and meta_desc.get("content"):
            content = meta_desc["content"]
            result["bio"] = content[:200]

        # Extract follower count
        followers_match = re.search(r"([\d,\.]+[KMk]?)\s*Followers", full_text, re.IGNORECASE)
        if followers_match:
            result["followers"] = followers_match.group(1)

        # Extract WhatsApp number
        whatsapp_number = extract_whatsapp_number(full_text)
        if whatsapp_number:
            result["whatsapp_number"] = whatsapp_number

        # Extract email
        email = extract_email(full_text)
        if email:
            result["email"] = email

        # Try JSON-LD structured data
        scripts = soup.find_all("script", {"type": "application/ld+json"})
        for script in scripts:
            try:
                data = json.loads(script.string or "")
                if isinstance(data, dict):
                    if data.get("description"):
                        result["bio"] = data["description"][:200]
                    if data.get("interactionStatistic"):
                        for stat in data["interactionStatistic"]:
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
    url = f"https://www.instagram.com/{username}/"
    try:
        response = await client.get(url, headers=INSTAGRAM_HEADERS, timeout=10.0)
        if response.status_code == 200:
            return response.text
    except Exception:
        pass
    return ""


async def fetch_instagram_profile(username: str, client: httpx.AsyncClient) -> dict:
    empty = {"bio": "", "whatsapp_number": "", "email": "", "followers": ""}

    # Try ScraperAPI first
    html = await fetch_profile_with_scraperapi(username, client)

    # Fall back to direct fetch if ScraperAPI fails
    if not html:
        html = await fetch_profile_direct(username, client)

    if not html:
        return empty

    return parse_profile_html(html, "")


def build_pitch_prompt(business_name: str, username: str, bio: str, niche: str, city: str, followers: str, whatsapp_number: str) -> str:
    extra_context = ""
    if followers:
        extra_context += f"\n- Followers: {followers}"
    if whatsapp_number:
        extra_context += f"\n- WhatsApp: {whatsapp_number}"

    return f"""Write a short Instagram DM pitch for a Nigerian web designer reaching out to a small business owner.

Business details:
- Business name: {business_name}
- Instagram: @{username}
- Bio: {bio}
- Niche: {niche}
- City: {city}{extra_context}

Requirements:
- Write in the voice of a friendly, competent Nigerian tech freelancer
- Acknowledge they currently take orders manually via WhatsApp or DMs
- Explain that a professional website will save them hours every week
- Keep it warm and conversational, not salesy or corporate
- Between 60 and 90 words
- End with a soft call-to-action offering a free mockup
- Return ONLY the pitch text, nothing else"""


def generate_pitch_with_gemini(business_name: str, username: str, bio: str, niche: str, city: str, followers: str, whatsapp_number: str) -> str:
    prompt = build_pitch_prompt(business_name, username, bio, niche, city, followers, whatsapp_number)
    gemini_model = genai.GenerativeModel(
        model_name="gemini-2.0-flash",
        generation_config=genai.GenerationConfig(temperature=0.8, max_output_tokens=200),
    )
    response = gemini_model.generate_content(prompt)
    return response.text.strip()


def generate_pitch_with_groq(business_name: str, username: str, bio: str, niche: str, city: str, followers: str, whatsapp_number: str) -> str:
    prompt = build_pitch_prompt(business_name, username, bio, niche, city, followers, whatsapp_number)
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.8,
        max_tokens=200,
    )
    return response.choices[0].message.content.strip()


def generate_pitch(business_name: str, username: str, bio: str, niche: str, city: str, followers: str, whatsapp_number: str) -> str:
    try:
        return generate_pitch_with_gemini(business_name, username, bio, niche, city, followers, whatsapp_number)
    except Exception as gemini_error:
        gemini_msg = str(gemini_error).lower()
        if any(code in gemini_msg for code in ["429", "404", "quota", "rate", "limit", "not found"]):
            try:
                return generate_pitch_with_groq(business_name, username, bio, niche, city, followers, whatsapp_number)
            except Exception:
                pass
        else:
            try:
                return generate_pitch_with_groq(business_name, username, bio, niche, city, followers, whatsapp_number)
            except Exception:
                pass
    return (
        f"Hi {business_name}! Love what you're doing on Instagram. "
        f"I noticed you're managing orders manually via DMs/WhatsApp — "
        f"I can build you a clean website that automates your orders and saves you hours every week. "
        f"No more copy-pasting customer details. "
        f"Want me to show you a free mockup of what it could look like?"
    )


async def run_serper_query(query: str, client: httpx.AsyncClient) -> list[dict]:
    try:
        response = await client.post(
            "https://google.serper.dev/search",
            json={"q": query, "num": 10},
            headers={"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"},
            timeout=15.0,
        )
        response.raise_for_status()
        return response.json().get("organic", [])
    except Exception:
        return []


@app.get("/")
async def health_check():
    return {"status": "InstaLead AI is running", "version": "5.0.0"}


@app.post("/api/hunt", response_model=list[LeadResult])
async def hunt_leads(req: HuntRequest):
    if not req.niche.strip():
        raise HTTPException(status_code=422, detail="Niche cannot be empty.")
    if not req.city.strip():
        raise HTTPException(status_code=422, detail="City cannot be empty.")

    niche = req.niche.strip()
    city = req.city.strip()

    # 3 parallel Serper queries with different search variations
    queries = [
        f'site:instagram.com "DM to order" "{city}" {niche}',
        f'site:instagram.com "WhatsApp to order" "{city}" {niche}',
        f'site:instagram.com "send a DM" "{city}" {niche}',
    ]

    async with httpx.AsyncClient(timeout=20.0) as client:
        # Run all 3 Serper queries in parallel
        serper_tasks = [run_serper_query(q, client) for q in queries]
        serper_results = await asyncio.gather(*serper_tasks)

        # Merge and deduplicate by username
        seen_usernames = set()
        unique_results = []
        for result_batch in serper_results:
            for result in result_batch:
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

        # Fetch Instagram profiles in parallel (max 30)
        unique_results = unique_results[:30]
        profile_tasks = []
        for result in unique_results:
            username = extract_instagram_username(result.get("link", ""))
            profile_tasks.append(fetch_instagram_profile(username, client))

        profile_data = await asyncio.gather(*profile_tasks)

        # Build final leads
        leads = []
        for result, profile in zip(unique_results, profile_data):
            url = result.get("link", "")
            title = result.get("title", "")
            snippet = result.get("snippet", "")

            username = extract_instagram_username(url)
            business_name = derive_business_name(username, title)

            # Use profile bio if available, else fall back to snippet
            bio = profile.get("bio") or clean_bio(snippet)
            bio = bio[:200]

            whatsapp_number = profile.get("whatsapp_number") or extract_whatsapp_number(snippet)
            email = profile.get("email") or extract_email(snippet)
            followers = profile.get("followers", "")
            whatsapp_found = bool(whatsapp_number) or detect_whatsapp(snippet + " " + title)

            pitch = generate_pitch(business_name, username, bio, niche, city, followers, whatsapp_number)

            leads.append(LeadResult(
                username=username,
                business_name=business_name,
                bio=bio,
                whatsapp_found=whatsapp_found,
                whatsapp_number=whatsapp_number,
                email=email,
                followers=followers,
                pitch=pitch,
            ))

        return leads
