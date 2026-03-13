# Prompts Reference — Deepak Fertilisers AI Calling Agent

## 1. Prompt Source of Truth

The active prompt system lives in:

- `services/conversationEngine/index.ts`
- `services/conversationEngine/prompts.ts`

`index.ts` assembles the final instruction by combining:

1. `buildSystemPrompt(agentGender)`
2. `getDeveloperPrompt('Marathi', customerName, lastProduct, closingPhrase, agentGender)`

Important note:

- Although the codebase still has `Language` types and language-detection helpers, the active prompt path is currently hardcoded to Marathi.

---

## 2. Agent Persona

### Identity

- Company: Deepak Fertilisers / Mahadhan
- Role: agricultural advisor making outbound calls to farmers
- Female agent name: Ankita
- Male agent name: Omkar

### Voice mapping

- Female -> Gemini voice `Kore`
- Male -> Gemini voice `Puck`

### Tone rules

- polite,
- rural and conversational,
- respectful forms such as `जी`, `साहेब`, `ताई`,
- short turns,
- one question per turn.

---

## 3. Global Prompt Rules

The current prompt enforces these global rules:

1. Strict Marathi only.
2. Agent must speak first as soon as the call connects.
3. One question or one short statement per turn.
4. Never guess unclear audio.
5. Use natural Marathi number phrases.
6. Stay inside agriculture, crops, fertilizer, and disease-support topics.

The prompt also contains explicit answers for identity challenges:

- `तू AI आहेस का?`
- `तुला कोणी बनवलं?`

It tells the agent to avoid admitting it is an AI and to stay in role as a Deepak Fertilisers advisor.

---

## 4. Polite Decline Logic

The prompt explicitly defines a polite decline pattern.

If the farmer says things like:

- `नाही`
- `नको`
- `सध्या नाही`
- `गरज नाही`

the agent should say:

- `ठीक आहे, काही हरकत नाही.`

and then move forward or close politely without pushing further.

---

## 5. Expert Callback Rule

The prompt is strict about escalation.

The agent should offer an expert callback only for genuine complaint or diagnosis situations, for example:

- the farmer says the product did not work,
- the farmer reports damage or loss,
- the farmer explicitly asks for deeper technical guidance,
- the disease cannot be identified confidently.

The prompt explicitly says not to offer expert callback for ordinary product refusal.

---

## 6. Interrupt and Noise Handling

Interrupt phrases like these are treated specially:

- `ऐक ना`
- `अलो`
- `excuse me`
- `थांबा`
- `एक मिनिट`

The agent is instructed to stop and respond with a listening acknowledgement.

For unclear/noisy input, the prompt instructs the agent to:

1. ask the farmer to repeat,
2. if still unclear, mention network difficulty and suggest a later call,
3. never invent missing content.

---

## 7. Domain Guard Rules In Prompt

The prompt blocks the agent from answering non-agriculture topics such as:

- math,
- politics,
- religion,
- cricket,
- movies,
- stock market,
- general knowledge.

Expected behavior is a polite redirection back to agriculture and fertilizer help.

This prompt-level domain blocking is the real runtime guard. The helper file `services/domainGuard.ts` exists, but it is not what enforces live call behavior today.

---

## 8. Safety Positioning

The prompt includes a hard safety statement:

- Mahadhan products are fertilizers, not direct medicines.
- The agent must not claim to cure disease.
- It may say that products improve crop strength and resistance.

This is one of the most important business constraints in the current prompt.

---

## 9. Step-by-Step Prompt Flow

### Step 1: Greeting and identity check

The agent immediately introduces itself and confirms that it is speaking to the intended farmer.

If the person says it is the wrong number, the prompt instructs the agent to apologize and close.

### Step 2: Consent gate

The agent asks whether the farmer has 2 to 3 minutes.

Possible branches:

- yes -> continue,
- no or busy -> callback flow,
- unclear -> repeat once, then close.

### Step 3: Feedback on previous product

The prompt refers to the `lastProduct` value and asks how the crop response was after use.

This splits into:

- positive feedback branch,
- negative feedback branch.

### Positive branch

The agent asks whether the farmer wants more fertilizer.

- if yes -> move toward ordering,
- if no -> ask whether the crop has any disease or issue,
- if no disease -> close politely.

### Negative branch

The agent asks what problem occurred.

- if the description sounds like disease symptoms -> disease flow,
- if it is a direct product complaint -> expert callback / complaint handling,
- no upsell is allowed in this branch.

---

## 10. Disease Flow In Prompt

The prompt contains specific response templates for common patterns such as:

- red rot,
- yellow leaves,
- leaf spot,
- wilt,
- calcium deficiency / fruit cracking,
- pest attack,
- unknown disease.

Typical behavior in the disease branch:

1. identify likely issue,
2. explain at a high level,
3. suggest a Mahadhan fertilizer for crop strength/support,
4. ask whether the farmer wants that fertilizer.

If the farmer asks whether there is a direct disease medicine, the prompt forces the disclaimer that the products are fertilizers, not direct medicines.

---

## 11. Product and Recommendation Rules

The prompt has a smart branching rule for product intent:

- if the farmer already names a specific product, do not ask which crop it is for,
- go directly to quantity,
- if the farmer just says fertilizer is needed generically, ask crop and then recommend.

Prompt recommendation set includes:

- general growth -> 19:19:19
- roots/new plants -> MAP 12:61:0
- flowering/fruiting -> MKP 0:52:34
- fruit color and quality -> 13:0:45
- maturity -> SOP 0:0:50
- fruit cracking -> calcium nitrate
- soil health -> Kranti
- zinc deficiency -> Zincsulf

Note that the authoritative runtime pricing and alias map still comes from `backend/knowledge/productCatalog.ts`, not from the prompt text.

---

## 12. Order Capture Rules In Prompt

The prompt wants the agent to avoid redundant questions.

Examples:

- product and quantity already given -> ask address next,
- only product given -> ask quantity,
- nothing given -> ask product, then quantity,
- once address details are already provided, do not ask for them again.

Address collection is supposed to capture:

- village,
- taluka,
- district,
- pincode.

The prompt instructs the agent to ask one missing field at a time when the address is incomplete.

---

## 13. Confirmation, SMS, and Closure

### Order confirmation

The prompt tells the agent to read back:

- fertilizer,
- quantity,
- address,
- pincode,

and then ask whether it is correct.

### SMS step

The agent then says it will send:

- order details,
- payment link,
- 24-hour payment instruction,
- 3 to 4 day delivery estimate.

This wording is important because the backend SMS trigger listens for SMS/payment phrases in finalized agent text.

### Closure

The prompt ends with a thank-you and good-day closing.

The backend hangup detector relies on these kinds of closing lines to terminate the live phone call automatically.

---

## 14. What Is Prompt-Driven vs Code-Driven

### Prompt-driven today

- consent behavior,
- complaint escalation behavior,
- topic restrictions,
- disease guidance language,
- address questioning style,
- callback wording,
- overall sales flow.

### Code-driven today

- audio streaming,
- outbound-first guard,
- transcript buffering,
- UI sync events,
- product alias resolution,
- order map updates,
- SMS trigger detection,
- order lock,
- SMS formatting,
- auto-hangup after closing line.

---

## 15. Important Mismatch To Remember

The repository still includes helper modules for language switching, consent, and domain classification, but the active call behavior is primarily enforced by the prompt. If the prompt changes, the live call behavior changes even when those helper files stay untouched.
