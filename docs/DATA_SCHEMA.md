# FieldEval Data Contract & Schema Reference

This document provides a field-by-field reference for all data types in FieldEval, defined strictly in [`src/lib/schema.ts`](file:///d:/projects/greenforest/src/lib/schema.ts).

---

## 1. Task Definition (`TaskDef`)

Represents a benchmark challenge card in the 6-scene fieldwork deck.

| Field | Type | Validation / Constraints | Description |
|---|---|---|---|
| `id` | `string` | Unique slug (e.g., `'task-specimen-count'`) | Stable identifier referenced by client requests. |
| `sceneNumber` | `number` | Integer `1` to `6` | Order in the 6-scene daily field deck. |
| `title` | `string` | Human-readable title | Short label displayed on the scene tag. |
| `question` | `string` | Sentence under 120 chars | Primary evaluation question presented to user and model. |
| `inputType` | `enum` | `'stepper' \| 'choice' \| 'digits'` | UI thumb control rendered for user ground-truth input. |
| `options` | `string[]?` | Required if `inputType === 'choice'` | List of discrete choice buttons. |
| `promptVersion` | `'p1'` | Literal `'p1'` | Server-side prompt template versioning tag. |
| `promptTemplate`| `string` | Non-empty string | Secret prompt sent to vision model requesting JSON schema. |
| `shots` | `tuple` | Exactly 2 `ShotInstruction` items | Setup conditions for Shot A and Shot B. |

### `ShotInstruction`

| Field | Type | Description |
|---|---|---|
| `shotIndex` | `'A' \| 'B'` | Position in the two-shot pair for the scene. |
| `instruction` | `string` | Physical fieldwork positioning (e.g., `"Low 45-degree angle"`). |
| `lighting` | `string` | Ambient lighting condition (e.g., `"Side grazing light"`). |

---

## 2. Model Result (`ModelResult`)

Output returned by a `VisionProvider` from the `/api/infer` route.

| Field | Type | Validation / Constraints | Description |
|---|---|---|---|
| `status` | `enum` | `'ok' \| 'invalid_output' \| 'timeout' \| 'rate_limited' \| 'error'` | Execution status of the inference attempt. |
| `answer` | `string?` | String or `null` | Parsed answer value (e.g., `'7394'`, `'5'`, `'0'`). |
| `rationale` | `string?` | Max 200 characters or `null` | Vision model's concise one-line explanation. |
| `selfConfidence`| `number?` | Float between `0.0` and `1.0` | Self-reported model confidence score. |
| `latencyMs` | `number` | Non-negative integer | Server-measured roundtrip latency in milliseconds. |
| `rawOutput` | `string?` | Optional string | Unparsed raw text output for debugging. |
| `errorMessage` | `string?` | Optional string | Error details if status is not `'ok'`. |

---

## 3. Observation (`Observation`)

Stored in local IndexedDB (`observations` store) on the mobile phone.

| Field | Type | Validation / Constraints | Description |
|---|---|---|---|
| `id` | `string` | UUID v4 | Primary key for the observation record. |
| `sessionId` | `string` | UUID v4 | Associates observation with active fieldwork session. |
| `taskId` | `string` | Matches a `TaskDef.id` | Reference to the evaluated task. |
| `shotIndex` | `enum` | `'A' \| 'B'` | Shot condition tested in this observation. |
| `blobKey` | `string` | Key in IDB `blobs` store | Reference to local raw image buffer. |
| `userAnswer` | `string` | Normalized answer string | Ground truth locked by researcher. |
| `originalUserAnswer`| `string?` | Original answer string | Retained if researcher changes answer after reveal. |
| `userUnsure` | `boolean` | Boolean | True if researcher selected the "Unsure" tag. |
| `lockedAt` | `string?` | ISO 8601 Datetime | Timestamp when researcher tapped "Lock my answer". |
| `revisedAfterReveal`| `boolean` | Boolean (default: `false`)| True if answer was modified after reveal (excluded from score). |
| `modelResult` | `object` | Conforms to `ModelResultSchema` | Full inference record from the model. |
| `outcome` | `enum` | `'correct' \| 'incorrect' \| 'excluded_unsure' \| 'excluded_revised' \| 'excluded_invalid'` | Standardized evaluation scoring category. |
| `matched` | `boolean` | Boolean | True if ground truth matches model prediction. |
| `excluded` | `boolean` | Boolean | True if observation is excluded from accuracy denominator. |
| `capturedAt` | `string` | ISO 8601 Datetime | Timestamp when photo was captured by user. |
| `completedAt`| `string` | ISO 8601 Datetime | Timestamp when scoring and reveal concluded. |

---

## 4. Export Record (`ExportRecord`)

Flat line item emitted into `fieldeval-session.jsonl` benchmark artifacts (`schema_version: fieldeval.v1`). Validated against `ExportRecordSchema.strict()`. Contains NO raw image bytes, NO GPS coordinates, and NO device or user-agent data.

| Field | Type | Sample Value | Description |
|---|---|---|---|
| `schema_version` | `'fieldeval.v1'` | `"fieldeval.v1"` | Version of export data format. |
| `session_id` | `string` (UUID) | `"a1b2c3d4-..."` | Fieldwork session identifier. |
| `observation_id` | `string` (UUID) | `"e5f6a7b8-..."` | Observation record identifier. |
| `task_id` | `string` | `"task-tag-number"` | Evaluated task identifier. |
| `shot_index` | `'A' \| 'B'` | `"A"` | Shot variant (`A` or `B`). |
| `question` | `string` | `"What 4-digit number..."` | Task question text (no arbitrary free text). |
| `prompt_version` | `'p1'` | `"p1"` | Prompt version executed. |
| `user_answer` | `string` | `"7394"` | Human ground truth answer. |
| `user_unsure` | `boolean` | `false` | Unsure exclusion flag. |
| `revised_after_reveal` | `boolean` | `false` | Audit flag indicating answer changed after reveal. |
| `model_status` | `string` | `"ok"` | Provider response status (`ok`, `invalid_output`, `timeout`, `rate_limited`, `error`). |
| `model_answer` | `string \| null` | `"7394"` | Parsed model answer. |
| `model_rationale` | `string \| null` | `"Card shows 7394."` | Model rationale (strictly truncated to $\le 200$ chars). |
| `model_confidence`| `number \| null` | `0.95` | Self-reported confidence float (0 to 1). |
| `latency_ms` | `number` | `4120` | Model inference duration in milliseconds. |
| `outcome` | `string` | `"correct"` | Scored outcome (`correct`, `incorrect`, `excluded_unsure`, `excluded_revised`, `excluded_invalid`). |
| `matched` | `boolean` | `true` | Ground truth match outcome. |
| `excluded` | `boolean` | `false` | Exclusion from accuracy denominator. |
| `image_sha256` | `string` | `"a1b2c3d4..."` | SHA-256 digest of normalized output image bytes. |
| `image_width` | `number` | `1024` | Width in pixels after resizing. |
| `image_height` | `number` | `768` | Height in pixels after resizing. |
| `timestamp` | `string` (ISO 8601) | `"2026-10-10T20:40:00Z"` | Record completion timestamp. |
