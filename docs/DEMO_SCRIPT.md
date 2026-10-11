# FieldEval Demo Script (60–90 Seconds)

A tight, shot-by-shot walkthrough showcasing FieldEval's outdoor vision model evaluation workflow on mobile.

---

### Timing Overview
- **Total Duration**: 75 seconds (1m 15s)
- **Format**: Screen recording captured on a mobile device (or simulated mobile viewport) outdoors or with real specimen shots.

---

### Shot List & Voiceover

| Time | Scene / Screen | Visual Action | Narration / Voiceover |
| :---: | :--- | :--- | :--- |
| **0:00 – 0:10** | **Home Screen (`/`)** | • Show the typography: *"Call it before you look."*<br>• Scroll past the 6-scene specimen deck (Specimen Count, Surveyor Tag Digits, Negative Control, Dominant Substrate, Flagging Color, Canopy Density).<br>• Point out the *Offline-First Guarantee* badge. | *"Standard vision benchmarks evaluate models on clean laboratory images. FieldEval is an outdoor PWA that tests open-weight vision models—specifically Gemma 4 31B—against real-world conditions like harsh sunlight, wet foliage, and steep perspectives."* |
| **0:10 – 0:25** | **Field Scene 1: Human Ground Truth (`/field`)** | • Tap **"Start the walk"**.<br>• Camera opens; take or select a photo of a leaf specimen.<br>• Select count **"4"**.<br>• Tap **"Lock my answer"** (locks at timestamp). | *"Here's the core rule: human ground truth must be locked first. I photograph the specimen, enter my count of four leaves, and lock it before the model gets called. The model answers completely blind."* |
| **0:25 – 0:40** | **Model Inference & Reveal Motion** | • Tap **"Call Gemma 4"**.<br>• Spinner displays latency counter.<br>• Model returns count `"4"` with rationale.<br>• **Flagging tape animation** slaps diagonally across the card in neon **Flag Lime** with label *"MATCHED"*.<br>• Tap **"Next scene"**. | *"Now we call Gemma 4. In seconds, the response returns: four leaves, ninety-four percent confidence. The diagonal flagging tape slaps across the photo: neon lime for matched, pink for missed. All stored safely in IndexedDB on the phone."* |
| **0:40 – 0:55** | **Scene 2: Pair Flip & Negative Control** | • Quick cut through Scene 2 (Surveyor tag OCR under glare) or Scene 3 (Negative presence control).<br>• Show paired shots (flat lay vs 45° angle) to test invariance. | *"FieldEval tests paired variants to detect flip rate—measuring whether a simple change in angle or direct glare causes the model to hallucinate or change its answer."* |
| **0:55 – 1:10** | **Results Screen (`/results`)** | • Land on Walk Complete screen.<br>• Pan across **The Wall of 6 scene tiles** (lime matched, pink missed, hatched excluded).<br>• Highlight statistical metrics: Task-by-task $k$ of $n$, Wilson 95% Confidence Interval, and Flip Rate. | *"At the end of the walk, we reach The Wall: a complete breakdown of matched, missed, and excluded shots. FieldEval strictly adheres to eval.v1 scoring rules: no inflated percentages under small samples, exact Wilson ninety-five confidence intervals, and paired flip rates."* |
| **1:10 – 1:20** | **Export & Author Seed Data** | • Tap **"Export results file (.jsonl)"**.<br>• Native system share sheet opens (or file download).<br>• Show **"Sample data from the author's field session"** button for judges. | *"Judges can tap 'Sample data from the author's field session' to inspect pre-loaded real field benchmarks, or export clean, zero-PII JSONL artifacts directly to their files."* |

---

### Production Tips for Recording
1. **Camera Framing**: Record in vertical portrait mode ($9:16$) on iPhone Safari or Android Chrome with address bar visible or installed as standalone PWA.
2. **Audio**: Clean voiceover with zero background hiss.
3. **Pacing**: Avoid lingering on loading spinners; keep transitions crisp.
