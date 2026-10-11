---
title: FieldEval: Testing Gemma 4 on Real Outdoor Fieldwork Photos
published: false
tags: devchallenge, hf26challenge
canonical_url: https://dev.to/challenges/hacktoberfest-week1-2026-10-05
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

When photographed flat on a table, Gemma 4 31B counts four leaves on a specimen correctly. When the phone tilts forty-five degrees and sunlight casts diagonal shadows across the stem, the count flips from four to five. On an outdoor surveyor tag, bright direct glare obscures digits that the human eye reads in half a second.

These failure modes do not appear on synthetic benchmark tables. Standard vision evaluations test models on clean, centered indoor datasets under flat lighting. FieldEval is a mobile web app that takes model testing into the field.

<!-- [TODO: If you have additional specific numbers from your outdoor walk, insert them here] -->

---

## What I Built

FieldEval is an offline-first Progressive Web App (PWA) for testing open-weight vision models on outdoor fieldwork photos. It is built for field researchers, surveyors, and gardeners who need to know if a model can handle wet leaves, high-contrast shadows, and steep camera angles before trusting it outdoors.

The app uses two core protocols:

1. **Commit-then-reveal**: You walk outside and pull a scene from the 6-scene specimen deck. You photograph the specimen, enter your answer, and tap **"Lock my answer"**. Your ground truth is committed to local storage with a timestamp before the model is called. The model answers blind. Only after the model responds does the screen slap a diagonal flagging-tape banner across the photo: **Flag Lime** for a match, **Flag Pink** for a miss.
2. **Paired shots**: You photograph each scene twice—variant A (flat lay or diffused light) and variant B (inclined angle or direct sunlight). FieldEval compares the two to compute the **flip rate**: how often changing the camera angle or lighting changes the model's answer, even when the physical specimen did not change.

---

## Demo

- **Live Web App**: [TODO: Paste your live Vercel URL here, e.g. https://fieldeval.vercel.app]
- **Video Walkthrough**: [TODO: Paste your 60-90 second demo video link here, e.g. YouTube or Loom]

### The 6-Scene Results Wall

At the end of a walk, FieldEval displays **The Wall**: a visual matrix of every scene tile showing matched, missed, and excluded shots, alongside exact Wilson 95% confidence intervals and paired flip rates.

<!-- [TODO: Add screenshot of your Results Screen showing The Wall of 6 tiles] -->
![FieldEval Results Wall Placeholder](https://raw.githubusercontent.com/CoderKavyaG/FieldEval/main/docs/screenshots/results_wall.png)

Judges can also tap **"Sample data from the author's field session"** directly on the live site to load real fieldwork observations and inspect the complete scoring breakdown without consuming API credits.

---

## Code

{% github CoderKavyaG/FieldEval %}

- **Repository**: [https://github.com/CoderKavyaG/FieldEval](https://github.com/CoderKavyaG/FieldEval)
- **License**: MIT License (Application), Apache 2.0 (Gemma 4 model weights)

---

## How I Built It

FieldEval is built around **Gemma 4 31B** (`gemma-4-31b-it`), an open-weight vision model released by Google DeepMind under the Apache 2.0 license.

### Architecture
- **Framework**: Next.js App Router (Node.js runtime) with TypeScript strict mode.
- **Client Storage**: `idb` (IndexedDB). All full-size photos, session metadata, and human answers stay on the phone. The camera uses native `<input capture="environment">`, avoiding WebRTC permission prompts.
- **Image Normalization**: Client-side canvas scales images to a 1024px maximum edge and re-encodes to JPEG at quality 0.82. This drops all EXIF metadata and GPS coordinates before transmission.
- **Server Route**: `POST /api/infer` proxies requests to the Google Gemini API using `@google/genai`. The server constructs prompts from fixed task definitions; client-supplied arbitrary prompts are rejected.
- **Observability**: `@sentry/nextjs` traces the pipeline with four discrete spans: `validate`, `provider_call`, `parse`, and `retry`. Strict privacy rules strip API keys, request bodies, task prompts, and raw image bytes.

---

## Why Does Open Innovation Matter?

Open innovation is what makes FieldEval viable:

1. **Swapping Model Sizes with One Config Change**: Because Gemma is open-weight, we can run Gemma 4 31B in cloud inference, swap to Gemma 4 9B with a single environment variable (`MODEL_ID`), or point the client to a local quantized model running via Ollama without changing the application logic or data schema.
2. **API Keys Never Touch the Phone**: The client never handles provider credentials. A single serverless route proxies inference with strict rate limiting.
3. **Photos Stay on the Device**: In field biology, location and specimen data can be sensitive. Raw photos and GPS coordinates are never uploaded to an image hosting service or cloud database.
4. **Zero Infrastructure Cost**: The entire system runs within free-tier serverless limits with no database fees.

### What 20 to 30 Photos Cannot Prove

A walk of 20 to 30 photos taken by one person on one afternoon cannot prove general model capabilities across global biodiversity or varied geographic biomes.

What it does prove is where specific visual boundaries collapse: specular highlights on wet surfaces, shadow-induced edge hallucination, and perspective foreshortening. By measuring paired invariance, FieldEval tests real field stability rather than synthetic benchmark claims.

---

## My Agent Session

<!-- Optional: Embed your DevRelay agent session transcript or link to it -->
[TODO: Add your DevRelay agent session link or embed tag {% agent_session ... %} if desired]

---

## Prize Categories

FieldEval qualifies for two partner prize categories based on technology used in the repository:

1. **Best Use of Gemma**: We use Google DeepMind's open-weight vision model **Gemma 4** (`gemma-4-31b-it`) via `@google/genai` across the entire evaluation pipeline to score real physical field specimens.
2. **Best Use of Sentry Agent Tracing**: We instrumented the inference pipeline using **`@sentry/nextjs`** with a root trace (`FieldEval Inference Pipeline`) and four spans (`validate`, `provider_call`, `parse`, `retry`), capturing latency, token counts, and status while enforcing strict zero-PII redaction.

---

<!-- Team Submissions: Please list your DEV username below -->
**Author**: [TODO: Add your DEV username here, e.g. @your_username]
