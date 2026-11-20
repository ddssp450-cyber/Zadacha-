import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { dbRouter, initDb } from './db.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.resolve(__dirname, 'public')));
// Auth + data API; also puts every /api/ai route behind a login.
app.use(dbRouter);

// Initialize Anthropic client on server
const apiKey = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-5-5';
let ai: Anthropic | null = null;

try {
  if (apiKey) {
    ai = new Anthropic({ apiKey });
  }
} catch (err) {
  console.warn('Anthropic client initialization notice:', err);
}

const replyText = (msg: Anthropic.Message) =>
  msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
// Prompts ask for bare JSON; this strips any text Claude puts around it.
const parseJson = (text: string) => JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
// Bank slips arrive as PDF or photo; Claude takes PDFs as document blocks.
const filePart = (mimeType: string | undefined, data: string): Anthropic.ContentBlockParam =>
  mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: (mimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data } };

// 1. AI Chat Endpoint
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const { message, role, contextData, conversationHistory } = req.body;

    const systemPrompt = `Ти си асистентът на "BUILDING BRAIN" — приложение за управление на сгради в България.
Твоята цел е да помагаш на потребителя според неговата роля: ${role || 'owner'} (собственик, наемател, строител, майстор).
Отговаряй на български, на „ти“, кратко и конкретно — като съсед, който си знае работата. Кратки изречения. Без клишета („вълнуващ“, „революционен“, „динамичен“, „важно е да отбележим“, „в заключение“), без удивителни и без излишна учтивост.

Информация за сградата и състоянието:
${JSON.stringify(contextData || {}, null, 2)}

Правила:
1. За сградата, плащанията, ремонтите, уредите и задачите ползвай САМО предоставената информация. Не си измисляй фалшиви данни.
2. Когато потребителят попита за плащания, ремонти, дефекти или графици, направи точни изчисления (суми в евро (€), брой чакащи, просрочени дни).
3. При предложения за действия (например насрочване на оглед, одобряване на плащане или добавяне на ремонт) предложи ясна следваща стъпка и попитай за потвърждение, ако действието е отговорно.
4. Използвай форматиране с кратки списъци или подточки за лесно четене.
5. Когато търсят майстор, техник или фирма (ВиК, електро, асансьори, покриви и т.н.), потърси в Google близо до адреса на сградата (${contextData?.buildingAddress || ''}, ${contextData?.buildingCity || ''}). Дай 3–5 варианта: име, телефон, район, рейтинг ако го има. Не измисляй телефони — само каквото намериш. Кажи, че са външни фирми, непроверени от Building Brain.`;

    if (ai) {
      try {
        const history = (conversationHistory || []).map((msg: any) =>
          `${msg.sender === 'user' ? 'Потребител' : 'Building Brain'}: ${msg.text}`
        );
        const stream = ai.messages.stream({
          model: MODEL,
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: 'user', content: [...history, `Потребител: ${message}`].join('\n\n') }],
          // Low effort keeps short chat answers over given data fast.
          // web_search lets it find repairmen near the building; it searches only when the question needs it.
          output_config: { effort: 'low' },
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
        });

        // Plain-text stream: the chat window appends each chunk as it arrives.
        let sentAny = false;
        const sources = new Map<string, string>();
        try {
          for await (const event of stream) {
            if (event.type !== 'content_block_delta' || event.delta.type !== 'text_delta' || !event.delta.text) continue;
            // X-Accel-Buffering stops an nginx-style proxy (kuso) from holding the stream until it ends.
            if (!sentAny) res.type('text/plain; charset=utf-8').setHeader('X-Accel-Buffering', 'no');
            sentAny = true;
            res.write(event.delta.text);
          }
          for (const block of (await stream.finalMessage()).content) {
            if (block.type !== 'text') continue;
            for (const c of block.citations ?? []) {
              if (c.type === 'web_search_result_location') sources.set(c.url, c.title || c.url);
            }
          }
        } catch (streamError: any) {
          // Mid-answer failure: headers are already sent, so end what the user has rather than fall back.
          if (sentAny) {
            console.warn('Claude stream broke mid-answer:', streamError?.message || streamError);
            return res.end();
          }
          throw streamError;
        }
        if (!sentAny) return res.type('text/plain; charset=utf-8').send('Няма генериран отговор от асистента.');
        if (sources.size) {
          res.write(`\n\nИзточници:\n${[...sources].slice(0, 5).map(([uri, title]) => `- ${title}: ${uri}`).join('\n')}`);
        }
        return res.end();
      } catch (aiError: any) {
        console.warn('Live Claude API call notice, using smart local handler:', aiError?.message || aiError);
      }
    }

    // No canned answers: they would show another building's made-up data.
    const fallbackReply = 'AI асистентът не отговаря в момента (лимит или връзка). Данните за сградата са си в разделите — пробвай пак след малко.';
    return res.type('text/plain; charset=utf-8').send(fallbackReply);
  } catch (error: any) {
    console.error('AI chat endpoint error:', error);
    return res.status(500).json({ error: 'Нещо се обърка от моя страна. Пробвай пак.' });
  }
});

// 3. AI Receipt Extraction Endpoint: reads the uploaded bank slip; without AI the owner checks it by hand.
app.post('/api/ai/extract-receipt', async (req: Request, res: Response) => {
  const { fileBase64, mimeType, amountExpected, expectedReason } = req.body;
  if (!ai || !fileBase64) return res.json({ success: false });
  try {
    const response = await ai.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: 'low' },
      messages: [{
        role: 'user',
        content: [
          filePart(mimeType, String(fileBase64).replace(/^data:[^;]+;base64,/, '')),
          {
            type: 'text',
            text: `Това е платежно нареждане/бордеро. Очаквана сума: ${amountExpected ?? 'неизвестна'} €. Очаквано основание: ${expectedReason || 'неизвестно'}.
Върни САМО JSON: {"detectedAmount": число или null, "detectedDate": "YYYY-MM-DD" или null, "senderName": текст или null, "recipientIban": текст или null, "referenceNumber": текст или null, "paymentReason": текст или null, "notes": "кратко на български: съвпада ли сумата и основанието"}.
Не измисляй стойности — каквото не се вижда, е null.`,
          },
        ],
      }],
    });
    return res.json({ success: true, extractedData: parseJson(replyText(response)) });
  } catch (err: any) {
    console.warn('Receipt extraction failed:', err?.message || err);
    return res.json({ success: false });
  }
});

// 3.1. AI Multimodal Photo Damage Diagnosis Endpoint
app.post('/api/ai/diagnose-damage', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType, userNotes, apartmentNumber } = req.body;

    if (ai && imageBase64) {
      try {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const imagePart = filePart(mimeType, cleanBase64);
        const textPart = {
          type: 'text' as const,
          text: `Ти си главен технически експерт и инженер по сградна поддръжка за жилищни комплекси в България.
Анализирай качената от мобилен телефон снимка на повреда в сградата (Апартамент/Зона: ${apartmentNumber || 'Не е посочено'}).
Бележки от подателя: ${userNotes || 'Няма допълнителни бележки'}.

Върни анализа САМО като чист JSON обект без излишен текст с тези точни полета:
{
  "detectedIssue": "точно и професионално заглавие на повредата на български език",
  "category": "plumbing" | "electrical" | "hvac" | "common_area" | "construction_defect" | "elevator",
  "categoryBg": "ВиК инсталация" | "Електротехника" | "Отопление & Климатизация" | "Общи части" | "Строителен дефект",
  "severity": "urgent" | "high" | "medium" | "low",
  "severityBg": "Спешно" | "Висок" | "Среден" | "Нисък",
  "severityReason": "защо е определена тази спешност и какви са рисковете при забавяне",
  "tradeNeeded": "необходим майстор (напр. ВиК специалист, Електротехник, Сервиз климатици)",
  "estimatedBudget": 140,
  "requiredMaterials": ["материал 1", "материал 2"],
  "recommendedAction": "конкретни стъпки за отстраняване на проблема",
  "preventionTip": "съвет как да се предотврати повторение"
}`
        };

        const response = await ai.messages.create({
          model: MODEL,
          max_tokens: 2048,
          output_config: { effort: 'low' },
          messages: [{ role: 'user', content: [imagePart, textPart] }],
        });

        const rawText = replyText(response);
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.json({ success: true, diagnosis: parsed });
        }
      } catch (aiErr: any) {
        console.warn('Claude vision diagnosis fallback triggered:', aiErr?.message || aiErr);
      }
    }

    return res.status(503).json({ error: 'AI не успя да разгледа снимката. Пробвай пак или опиши повредата ръчно.' });
  } catch (err) {
    console.error('Diagnosis error:', err);
    return res.status(500).json({ error: 'Грешка при диагностициране на снимката.' });
  }
});


// 4. AI Calendar Command Parser
app.post('/api/ai/parse-calendar-command', async (req: Request, res: Response) => {
  const command = String(req.body?.command || '').trim();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const fallback = {
    title: command.slice(0, 80) || 'Ново събитие',
    category: 'inspection',
    date: tomorrow,
    time: '10:00',
    duration: '1 час',
    assignedRole: 'all',
    apartment: 'Общи части',
    description: command,
    hasConflict: false,
    conflictDetails: null as string | null,
  };
  if (!ai || !command) return res.json({ success: true, proposal: fallback });
  try {
    const response = await ai.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: `Днес е ${new Date().toISOString().split('T')[0]}. Превърни командата в календарно събитие за жилищна сграда.
Команда: "${command}"
Върни САМО JSON с полета: title (кратко, на български), category ("repair"|"construction"|"inspection"|"maintenance"|"cleaning"|"meeting"|"rent_deadline"), date ("YYYY-MM-DD"), time ("HH:MM"), duration (текст), assignedRole ("owner"|"tenant"|"builder"|"craftsman"|"all"), apartment (напр. "Ап. 5" или "Общи части"), description.` }],
    });
    return res.json({ success: true, proposal: { ...fallback, ...parseJson(replyText(response)), hasConflict: false, conflictDetails: null } });
  } catch (err: any) {
    console.warn('Calendar command parse failed:', err?.message || err);
    return res.json({ success: true, proposal: fallback });
  }
});

// Production / Dev Vite Mount
async function startServer() {
  await initDb();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Building Brain server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start (is MySQL running?):', err);
  process.exit(1);
});
