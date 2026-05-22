import os
import json
import httpx
import google.generativeai as genai
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

SERPER_API_KEY = os.getenv("SERPER_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not SERPER_API_KEY:
    raise RuntimeError("SERPER_API_KEY is not set in environment variables.")
if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY is not set in environment variables.")

genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI(title="InstaLead AI", version="1.0.0")

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


GEMINI_SYSTEM_INSTRUCTION = """
You are an expert lead generation analyst and Nigerian digital marketing copywriter.

Your ONLY job is to analyze Instagram business snippet data and return a structured JSON array.

You must return ONLY valid JSON — no markdown, no explanation text, no code fences, no preamble.

Each item in the array must match this exact schema:
[
  {
    "username": "string — the Instagram handle extracted from the URL or snippet, without the @ symbol",
    "business_name": "string — the inferred business name from the snippet or username, formatted properly",
    "bio": "string — a cleaned, readable version of the bio or snippet content, max 120 characters",
    "whatsapp_found": true or false — boolean, true if the snippet mentions WhatsApp, WA, or a phone number",
    "pitch": "string — a short, punchy Instagram DM pitch written specifically for a Nigerian small business owner who currently takes orders manually via WhatsApp or DMs. The pitch must: (1) acknowledge their current manual hustle by name, (2) clearly explain that a professional website or automated order page will save them hours every week, (3) feel warm and conversational — not salesy or corporate, (4) be between 60 and 90 words, (5) end with a soft call-to-action asking if they want to see a free mockup. Write in the voice of a friendly, competent Nigerian tech freelancer."
  }
]

If a field cannot be determined from the snippet, use a sensible fallback:
- username: extract from the URL path if present, else use "unknown"
- business_name: derive from username by replacing underscores/dots with spaces and title-casing it
- bio: use whatever snippet text is available, trimmed to 120 chars
- whatsapp_found: default to false if unclear
- pitch: always generate a tailored pitch even with limited info

Return ONLY the JSON array. Nothing else.
""".strip()


def build_gemini_prompt(organic_results: list[dict]) -> str:
    formatted_snippets = []
    for i, result in enumerate(organic_results):
        link = result.get("link", "")
        title = result.get("title", "")
        snippet = result.get("snippet", "")
        formatted_snippets.append(
            f"Result {i + 1}:\n  URL: {link}\n  Title: {title}\n  Snippet: {snippet}"
        )

    joined = "\n\n".join(formatted_snippets)
    return (
        f"Here are {len(organic_results)} Instagram business search results scraped from Google.\n\n"
        f"{joined}\n\n"
        f"Analyze each result and return the JSON array as instructed."
    )


@app.get("/")
async def health_check():
    return {"status": "InstaLead AI is running", "version": "1.0.0"}


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

    gemini_prompt = build_gemini_prompt(organic_results)

    try:
        gemini_model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=GEMINI_SYSTEM_INSTRUCTION,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.7,
                max_output_tokens=4096,
            ),
        )

        gemini_response = gemini_model.generate_content(gemini_prompt)
        raw_text = gemini_response.text.strip()

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini API error: {str(e)}",
        )

    try:
        if raw_text.startswith("```"):
            lines = raw_text.splitlines()
            raw_text = "\n".join(
                line for line in lines if not line.startswith("```")
            ).strip()

        parsed_leads = json.loads(raw_text)

        if not isinstance(parsed_leads, list):
            raise ValueError("Gemini returned JSON but it was not an array.")

        validated_leads = []
        for item in parsed_leads:
            validated_leads.append(
                LeadResult(
                    username=str(item.get("username", "unknown")),
                    business_name=str(item.get("business_name", "Unknown Business")),
                    bio=str(item.get("bio", ""))[:120],
                    whatsapp_found=bool(item.get("whatsapp_found", False)),
                    pitch=str(item.get("pitch", "")),
                )
            )

        return validated_leads

    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse Gemini response as valid JSON: {str(e)}. Raw output: {raw_text[:500]}",
        )
