# BUILDING BRAIN — redesign summary (24 Oct 2026)

The AI Studio app (React + Vite frontend, Express server for the AI routes, deployed as one Node app; the unused ASP.NET backend and its „Бекенд“ tab were removed) with a new visual design, rewritten Bulgarian copy and euro amounts.

## Run it

```bash
npm install --legacy-peer-deps   # the shipped package.json has an esbuild/vite peer conflict
PORT=3005 npm run dev            # http://localhost:3005
```

The AI features need `GEMINI_API_KEY` in `.env.local` (not included). Without it the app answers with its built-in demo replies.

## What changed

**Look: "the building as its own drawing".** The dark navy theme with Plus Jakarta Sans and JetBrains Mono is gone.

- Light drafting-film background, graphite text, and a green cutting-mat top bar with a faint grid.
- Geologica for text, Jura for numbers and labels.
- New logo: the level mark from an architect's elevation drawing (`public/icon.svg` and `Logo` in `src/components/Drawing.tsx`).
- States read the same everywhere:
  - violet ink stamp = paid / confirmed
  - dashed line = declared, waiting for the owner's check
  - red pen cloud = overdue or broken
  - yellow highlighter = today
- One motion: clouds draw themselves in and stamps press down when the drawing loads. It switches off with reduced motion.

**Dashboard and Building tab.** The AI-generated building photo is replaced by a section drawing of the block (`SectionDrawing`): floors as rows, flats as cells, marked with stamps, clouds and dashed lines from the real payment and repair data. Hovering a flat dims the rest. The "AI Daily Briefing" banner became „Днес накратко“: plain headline, figures with drafting dimension lines, one button per task, margin notes.

**Images.**
- The three AI-generated JPGs are deleted.
- Stock-photo faces became initials.
- Stock photos that didn't match their item are removed (the boiler showed a crossword, a kitchen leak showed a bathroom). Empty slots say „Още няма снимка“.
- One stock receipt photo remains in the demo payment data.

**Copy.** The UI talks to the user as „ти“, in short, direct sentences. Phrases like „Интелигентен…“, „Дигитален паспорт“ and „&“ in headings are gone. The AI prompt in `server.ts` now asks for a plain neighbourly voice and ban clichés like „вълнуващ“, „революционен“, „динамичен“, „важно е да отбележим“, „в заключение“. No reviews, faces or numbers were invented.

**Currency.** Every amount is in euro (€) in the UI, demo data, server replies and AI prompts. Amounts were relabelled, not converted: 1 200 лв. became 1 200 €.

## Checked

- `npx tsc --noEmit` passes.
- Every tab was screenshotted at 1440 px. The dashboard, building, payments and calendar tabs were also checked at 390 px. Nothing overflows horizontally.
- The design detector reports one advisory: the cutting-mat grid. It's intentional.

## Not done

- The pop-up windows (login, camera diagnosis, new-item forms) got the new colours, but their copy wasn't rewritten line by line. A few formal „Вие“ phrases may remain.
- No formal design review and no DESIGN.md design-system document.
- Not tested with a real Gemini key.
