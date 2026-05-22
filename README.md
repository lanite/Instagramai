# InstaLead AI — Deployment Guide

## Prerequisites
- A GitHub account
- A Render account (render.com) — free
- A Vercel account (vercel.com) — free
- A Serper.dev API key (2,500 free searches)
- A Google AI Studio Gemini API key (free tier)

## Step 1 — Deploy Backend to Render
1. Go to render.com — New → Web Service
2. Connect this GitHub repo
3. Set Root Directory: backend
4. Build Command: pip install -r requirements.txt
5. Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
6. Add environment variables:
   - SERPER_API_KEY = your key
   - GEMINI_API_KEY = your key
   - FRONTEND_URL = your Vercel URL (add after Step 2)
7. Click Create Web Service
8. Copy your Render URL when done

## Step 2 — Deploy Frontend to Vercel
1. Go to vercel.com — Add New → Project
2. Import this GitHub repo
3. Set Root Directory: frontend
4. Add environment variable:
   - NEXT_PUBLIC_API_URL = your Render URL from Step 1
5. Click Deploy
6. Copy your Vercel URL when done

## Step 3 — Update CORS
1. Go back to Render → Environment
2. Set FRONTEND_URL = your Vercel URL
3. Render will auto-redeploy

## Free Tier Limits
- Render: sleeps after 15 min inactivity, first request takes 30s to wake
- Vercel: 100GB bandwidth, unlimited deploys
- Serper: 2,500 searches/month
- Gemini: 15 requests/minute, 1M tokens/day
