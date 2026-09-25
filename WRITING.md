# How this site is written

These rules apply to every page, whether a person or Claude wrote it. `node scripts/site.mjs check` catches some of them. Nothing catches the rest, so read the page back before merging.

## Who it is for

Someone in the UK who owns or rents a home and is wondering whether to change how it is heated, powered or charged. They are not an engineer and are not in a hurry to buy anything. Tell them what they need to know to make a decision, or to ask an installer good questions, and stop.

## Voice

- Plain and specific. Say what something does, what it costs you in effort, and what can go wrong.
- No selling. The site has nothing to sell, and nobody pays for the tools. Don't write "affordable", "smart", "future-proof", "the perfect choice" or anything else a brochure would say.
- Say when it depends and what it depends on. "Most homes" is fine if it's true. "Every home" usually isn't.
- British English: colour, metres, programme, "flat" not "apartment".
- Sentence case for headings and links.
- Short pages. If a section doesn't change what a reader would do, cut it.

## Punctuation

- **En-dashes, never em-dashes.** Use a spaced en-dash ` – `. The check fails on `—`.
- No exclamation marks.
- Don't bold phrases for emphasis in running text.

## Tropes to avoid

These make text read as generated. The check rejects the words in the list in `scripts/site.mjs`; the patterns below it can't see:

- Openers like "In today's world", "When it comes to", "Whether you're a … or a …".
- "It's not just X, it's Y." "X isn't Y – it's Z."
- Groups of three adjectives or three parallel clauses, used for rhythm and not because there are three things.
- Rhetorical questions as headings ("Why does insulation matter?"). Headings should name what the section is about.
- Wrap-ups that repeat the page ("In summary", "The bottom line", "Ultimately").
- Metaphors of journeys, landscapes, unlocking or empowering.
- Hedging stacks ("can potentially help to").

## Facts and numbers

- **Don't put numbers that change into the prose.** Energy prices, grant amounts, scheme deadlines and tariff rates go stale, and this site has nothing that updates them. The KarbonKit tools do: the grant finder is checked against official pages and the calculator follows each price cap. Point to the tool instead ("the grant finder shows what the grant is today").
- Physical facts that don't change (a heat pump moves heat rather than making it; induction needs a magnetic pan) can be stated.
- Link the official source for anything a reader might act on: GOV.UK, Ofgem, MCS, Home Energy Scotland, gov.wales, nidirect/NIHE, Planning Portal.
- Cover all four UK nations or say which one a fact applies to.

## Tools

- Each KarbonKit widget has its own page at `/tools/<slug>/`, and may also appear on the topic page where it helps most.
- Around a tool, say what it needs from the reader (a postcode, a phone, five minutes), what it can't tell them, and what to do with the answer.
- Paste the embed exactly as the KarbonKit dashboard gives it, with the `<!-- karbonkit: TYPE -->` comment above it. See README.md.
