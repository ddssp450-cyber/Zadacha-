import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { apiRouter, requireAuth } from './server/routes.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.resolve(__dirname, 'public')));

app.use('/api/ai', requireAuth);
app.use('/api', apiRouter);

// Initialize Gemini client on server
const apiKey = process.env.GEMINI_API_KEY;
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
let ai: GoogleGenAI | null = null;

try {
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
} catch (err) {
  console.warn('Gemini client initialization notice:', err);
}

const isTransientOrQuota = (err: any) => {
  const status = err?.status;
  return status === 429 || status === 503 || status === 500;
};

function formatGeminiError(err: any, fallback: string): { status: number; message: string } {
  const status = Number(err?.status) || 500;
  const raw = String(err?.message || '');
  if (
    status === 401 ||
    status === 403 ||
    raw.includes('ACCOUNT_STATE_INVALID') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('UNAUTHENTICATED')
  ) {
    return {
      status,
      message:
        'Ключът за Gemini API е невалиден или обвързаният акаунт е деактивиран. Обнови GEMINI_API_KEY в Settings > Secrets и опитай пак.',
    };
  }
  if (status === 429 || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'Достигнат е лимитът на заявките към Gemini API. Изчакай малко или провери квотата на ключа.',
    };
  }
  return { status, message: raw && !raw.startsWith('{') ? raw : fallback };
}

async function callWithRetryAndFallback<T>(fn: (model: string) => Promise<T>): Promise<T> {
  try {
    return await fn(PRIMARY_MODEL);
  } catch (err: any) {
    if (!isTransientOrQuota(err)) throw err;
    if (err?.status === 503) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        return await fn(PRIMARY_MODEL);
      } catch (retryErr: any) {
        if (!isTransientOrQuota(retryErr)) throw retryErr;
      }
    }
    return await fn(FALLBACK_MODEL);
  }
}

const parseJson = (text: string | undefined) => {
  const raw = (text ?? '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
  }
};

// Bank slips and damage photos arrive as data URLs or raw base64.
const filePart = (mimeType: string | undefined, fileBase64: string) => {
  const raw = String(fileBase64 || '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
  return {
    inlineData: {
      mimeType: match?.[1] || mimeType || 'image/jpeg',
      data: match?.[2] || raw.replace(/^data:[^;]+;base64,/, ''),
    },
  };
};

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

    if (!ai) {
      return res.status(503).json({ error: 'Липсва GEMINI_API_KEY на сървъра.' });
    }

    const history = (conversationHistory || []).map((msg: any) =>
      `${msg.sender === 'user' ? 'Потребител' : 'Building Brain'}: ${msg.text}`
    );
    const contents = [...history, `Потребител: ${message}`].join('\n\n');

    const startStream = async (model: string, useSearch: boolean) => {
      const stream = await ai!.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          ...(useSearch ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      return { first, iterator };
    };

    const runWithFallback = async () => {
      for (const attempt of [
        { model: PRIMARY_MODEL, search: true },
        { model: PRIMARY_MODEL, search: false },
        { model: FALLBACK_MODEL, search: true },
        { model: FALLBACK_MODEL, search: false },
      ]) {
        try {
          return await startStream(attempt.model, attempt.search);
        } catch (err: any) {
          if (!isTransientOrQuota(err)) throw err;
        }
      }
      return await startStream(FALLBACK_MODEL, false);
    };

    const { first, iterator } = await runWithFallback();

    // Plain-text stream: the chat window appends each chunk as it arrives.
    let sentAny = false;
    const sources = new Map<string, string>();
    const handleChunk = (chunk: any) => {
      const groundingChunks = chunk?.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
        for (const gc of groundingChunks) {
          if (gc.web?.uri) {
            sources.set(gc.web.uri, gc.web.title || gc.web.uri);
          }
        }
      }
      const text = chunk?.text;
      if (!text) return;
      // X-Accel-Buffering stops an nginx-style proxy (kuso) from holding the stream until it ends.
      if (!sentAny) res.type('text/plain; charset=utf-8').setHeader('X-Accel-Buffering', 'no');
      sentAny = true;
      res.write(text);
    };

    try {
      if (!first.done) handleChunk(first.value);
      for (;;) {
        const next = await iterator.next();
        if (next.done) break;
        handleChunk(next.value);
      }
    } catch (streamError: any) {
      // Mid-answer failure: headers are already sent, so end what the user has rather than fall back.
      if (sentAny) {
        console.warn('Gemini stream broke mid-answer:', streamError?.message || streamError);
        return res.end();
      }
      throw streamError;
    }

    if (!sentAny) {
      return res.type('text/plain; charset=utf-8').send('Няма генериран отговор от асистента.');
    }
    if (sources.size) {
      res.write(`\n\nИзточници:\n${[...sources].slice(0, 5).map(([uri, title]) => `- ${title}: ${uri}`).join('\n')}`);
    }
    return res.end();
  } catch (error: any) {
    console.error('AI chat endpoint error:', error);
    const formatted = formatGeminiError(error, 'Нещо се обърка от моя страна. Пробвай пак.');
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

// 3. AI Receipt Extraction Endpoint: reads the uploaded bank slip; without AI the owner checks it by hand.
app.post('/api/ai/extract-receipt', async (req: Request, res: Response) => {
  const { fileBase64, mimeType, amountExpected, expectedReason } = req.body;
  if (!ai || !fileBase64) return res.status(!ai ? 503 : 400).json({ success: false, error: !ai ? 'Липсва GEMINI_API_KEY.' : 'Липсва файл.' });
  try {
    const response = await callWithRetryAndFallback((model) =>
      ai!.models.generateContent({
        model,
        contents: {
          parts: [
            filePart(mimeType, fileBase64),
            {
              text: `Това е платежно нареждане/бордеро. Очаквана сума: ${amountExpected ?? 'неизвестна'} €. Очаквано основание: ${expectedReason || 'неизвестно'}.
Върни САМО JSON: {"detectedAmount": число или null, "detectedDate": "YYYY-MM-DD" или null, "senderName": текст или null, "recipientIban": текст или null, "referenceNumber": текст или null, "paymentReason": текст или null, "notes": "кратко на български: съвпада ли сумата и основанието"}.
Не измисляй стойности — каквото не се вижда, е null.`,
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedAmount: { type: Type.NUMBER, nullable: true },
              detectedDate: { type: Type.STRING, nullable: true },
              senderName: { type: Type.STRING, nullable: true },
              recipientIban: { type: Type.STRING, nullable: true },
              referenceNumber: { type: Type.STRING, nullable: true },
              paymentReason: { type: Type.STRING, nullable: true },
              notes: { type: Type.STRING },
            },
          },
        },
      })
    );
    return res.json({ success: true, extractedData: parseJson(response.text) });
  } catch (err: any) {
    console.warn('Receipt extraction failed:', err?.message || err);
    const formatted = formatGeminiError(err, 'Грешка при разчитане на документа.');
    return res.status(formatted.status).json({ success: false, error: formatted.message });
  }
});

// 3.1. AI Multimodal Photo Damage Diagnosis Endpoint
app.post('/api/ai/diagnose-damage', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType, userNotes, apartmentNumber } = req.body;
    if (!ai) {
      return res.status(503).json({ error: 'Липсва GEMINI_API_KEY на сървъра.' });
    }
    if (!imageBase64) {
      return res.status(400).json({ error: 'Качи снимка на повредата.' });
    }

    const response = await callWithRetryAndFallback((model) =>
      ai!.models.generateContent({
        model,
        contents: {
          parts: [
            filePart(mimeType, imageBase64),
            {
              text: `Ти си главен технически експерт и инженер по сградна поддръжка за жилищни комплекси в България.
Анализирай качената от мобилен телефон снимка на повреда в сградата (Апартамент/Зона: ${apartmentNumber || 'Не е посочено'}).
Бележки от подателя: ${userNotes || 'Няма допълнителни бележки'}.

Върни анализа като JSON обект на български език с тези точни стойности за enum полетата:
- category: "plumbing" | "electrical" | "hvac" | "common_area" | "construction_defect" | "elevator"
- categoryBg: "ВиК инсталация" | "Електротехника" | "Отопление & Климатизация" | "Общи части" | "Строителен дефект"
- severity: "urgent" | "high" | "medium" | "low"
- severityBg: "Спешно" | "Висок" | "Среден" | "Нисък"`,
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedIssue: { type: Type.STRING },
              category: { type: Type.STRING },
              categoryBg: { type: Type.STRING },
              severity: { type: Type.STRING },
              severityBg: { type: Type.STRING },
              severityReason: { type: Type.STRING },
              tradeNeeded: { type: Type.STRING },
              estimatedBudget: { type: Type.NUMBER },
              requiredMaterials: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendedAction: { type: Type.STRING },
              preventionTip: { type: Type.STRING },
            },
          },
        },
      })
    );

    const parsed = parseJson(response.text);
    if (parsed && parsed.detectedIssue) {
      return res.json({ success: true, diagnosis: parsed });
    }

    return res.status(503).json({ error: 'AI не успя да разгледа снимката. Пробвай пак или опиши повредата ръчно.' });
  } catch (err: any) {
    console.error('Diagnosis error:', err);
    const formatted = formatGeminiError(err, 'Грешка при диагностициране на снимката.');
    return res.status(formatted.status).json({ error: formatted.message });
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
  if (!command) return res.status(400).json({ success: false, error: 'Въведи команда.' });
  if (!ai) return res.status(503).json({ success: false, error: 'Липсва GEMINI_API_KEY на сървъра.' });
  try {
    const response = await callWithRetryAndFallback((model) =>
      ai!.models.generateContent({
        model,
        contents: `Днес е ${new Date().toISOString().split('T')[0]}. Превърни командата в календарно събитие за жилищна сграда.
Команда: "${command}"
Върни JSON с полета: title (кратко, на български), category ("repair"|"construction"|"inspection"|"maintenance"|"cleaning"|"meeting"|"rent_deadline"), date ("YYYY-MM-DD"), time ("HH:MM"), duration (текст), assignedRole ("owner"|"tenant"|"builder"|"craftsman"|"all"), apartment (напр. "Ап. 5" или "Общи части"), description.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Кратко заглавие до 6 думи на български' },
              category: { type: Type.STRING, description: 'Едно от: repair, construction, inspection, maintenance, cleaning, meeting, rent_deadline' },
              date: { type: Type.STRING, description: 'Дата във формат YYYY-MM-DD' },
              time: { type: Type.STRING, description: 'Начален час във формат HH:MM' },
              duration: { type: Type.STRING, description: 'Продължителност, напр. 1 час' },
              assignedRole: { type: Type.STRING, description: 'Едно от: owner, tenant, builder, craftsman, all' },
              apartment: { type: Type.STRING, description: 'Апартамент или зона, напр. Ап. 5 или Общи части' },
              description: { type: Type.STRING, description: 'Кратко описание на задачата на български' },
            },
            required: ['title', 'category', 'date', 'time', 'duration', 'assignedRole', 'apartment', 'description'],
          },
        },
      })
    );
    return res.json({ success: true, proposal: { ...fallback, ...parseJson(response.text), hasConflict: false, conflictDetails: null } });
  } catch (err: any) {
    console.warn('Calendar command parse failed:', err?.message || err);
    const formatted = formatGeminiError(err, 'Грешка при разчитане на командата.');
    return res.status(formatted.status).json({ success: false, error: formatted.message });
  }
});

// Production / Dev Vite Mount
async function startServer() {
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

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Building Brain server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
