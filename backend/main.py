import os
import re
import json
import httpx
from groq import Groq
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

SERPER_API_KEY = os.getenv("SERPER_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not SERPER_API_KEY:
    raise RuntimeError("SERPER_API_KEY is not set in environment variables.")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set in environment variables.")

groq_client = Groq(api_key=GROQ_API_KEY)

app = FastAPI(title="InstaLead AI", version="2.0.0")

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


class HuntRequest(BaseModel):
    niche: str
    city: str


class LeadResult(BaseModel):
    username: str
    business_name: str
    bio: str
    whatsapp_found: bool
    pitch: str


def extract_instagram_username(url: str) -> str:
    url = url.rstrip("/")
    parts = url.split("/")
    for part in reversed(parts):
        if part and part not in ["instagram.com", "www.instagram.com", "p", "reel", "stories"]:
            cleaned = re.sub(r"[^a-zA-Z0-9._]", "", part)
            if cleaned:
                return cleaned
    return "unknown"


def detect_whatsapp(text: str) -> bool:
    text_lower = text.lower()
    patterns = [
        "whatsapp", "whats app", "whatsap", "wa.me",
        "chat us", "chat me", "+234", "08", "07", "09",
    ]
    return any(p in text_lower for p in patterns)


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


def generate_pitch_with_groq(business_name: str, username: str, bio: str, niche: str, city: str) -> str:
    prompt = f"""Write a short Instagram DM pitch for a Nigerian web designer reaching out to a small business owner.

Business details:
- Business name: {business_name}
- Instagram: @{username}
- Bio: {bio}
- Niche: {niche}
- City: {city}

Requirements:
- Write in the voice of a friendly, competent Nigerian tech freelancer
- Acknowledge they currently take orders manually via WhatsApp or DMs
- Explain that a professional website will save them hours every week
- Keep it warm and conversational, not salesy or corporate
- Between 60 and 90 words
- End with a soft call-to-action offering a free mockup
- Return ONLY the pitch text, nothing else"""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
            max_tokens=200,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return (
            f"Hi {business_name}! I love what you're doing on Instagram. "
            f"I noticed you're managing orders manually via DMs/WhatsApp — "
            f"I can build you a clean website that automates your orders and saves you hours every week. "
            f"No more copy-pasting customer details. Want me to show you a free mockup of what it could look like?"
        )


def parse_organic_results(results: list[dict], niche: str, city: str) -> list[LeadResult]:
    leads = []
    for result in results:
        url = result.get("link", "")
        title = result.get("title", "")
        snippet = result.get("snippet", "")

        if "instagram.com" not in url:
            continue

        username = extract_instagram_username(url)
        if username == "unknown":
            continue

        business_name = derive_business_name(username, title)
        bio = clean_bio(snippet)
        whatsapp_found = detect_whatsapp(snippet + " " + title)
        pitch = generate_pitch_with_groq(business_name, username, bio, niche, city)

        leads.append(LeadResult(
            username=username,
            business_name=business_name,
            bio=bio,
            whatsapp_found=whatsapp_found,
            pitch=pitch,
        ))

    return leads


@app.get("/")
async def health_check():
    return {"status": "InstaLead AI is running", "version": "2.0.0"}


@app.post("/api/hunt", response_model=list[LeadResult])
async def hunt_leads(req: HuntRequest):
    if not req.niche.strip():
        raise HTTPException(status_code=422, detail="Niche cannot be empty.")
    if not req.city.strip():
        raise HTTPException(status_code=422, detail="City cannot be empty.")

    serper_query = f'site:instagram.com "DM to order" "{req.city}" {req.niche}'
    serper_payload = {"q": serper_query, "num": 10}
    serper_headers = {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            serper_response = await client.post(
                "https://google.serper.dev/search",
                json=serper_payload,
                headers=serper_headers,
            )
            serper_response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Serper API returned an error: {e.response.status_code} — {e.response.text}",
            )
        except httpx.RequestError as e:
            raise HTTPException(
                status_code=503,
                detail=f"Could not reach Serper API: {str(e)}",
            )

    serper_data = serper_response.json()
    organic_results = serper_data.get("organic", [])

    if not organic_results:
        return []

    leads = parse_organic_results(organic_results, req.niche.strip(), req.city.strip())
    return leads
