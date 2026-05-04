// Gemini client — parses natural-language reminders into structured JSON.
// Server-only: relies on GEMINI_API_KEY which must never reach the browser.

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export interface ParsedReminder {
  title: string;
  notes: string | null;
  category: "work" | "home" | "personal";
  due_at: string | null;
  rrule: string | null;
}

const SYSTEM_INSTRUCTION = `You parse a user's reminder request into structured fields.

Rules:
- title: short imperative phrase (max 80 chars), no trailing period
- notes: extra detail from input, or null
- category: "work" | "home" | "personal" — infer from context
- due_at: ISO 8601 timestamp WITH timezone offset, or null if no specific time
- rrule: RFC 5545 RRULE string for recurrence (e.g. "FREQ=DAILY;UNTIL=20260315T170000Z") or null for one-shot

- The user's timezone is given. Use it for due_at.
- "tomorrow", "Friday", "next week" → resolve relative to current_time.
- Default to 9:00 AM in user's timezone if a date is given without a time.
- "every X" → set rrule. due_at = the FIRST occurrence.
- "until Sunday" combined with daily → FREQ=DAILY;UNTIL=<sunday-end-of-day-in-UTC>
- If no time mention at all, due_at = null and rrule = null.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    notes: { type: "string", nullable: true },
    category: { type: "string", enum: ["work", "home", "personal"] },
    due_at: { type: "string", nullable: true },
    rrule: { type: "string", nullable: true },
  },
  required: ["title", "category"],
};

export async function parseReminder(
  text: string,
  ctx: { currentTime: string; timezone: string },
): Promise<ParsedReminder> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `current_time: ${ctx.currentTime}\ntimezone: ${ctx.timezone}\n\ninput: ${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("Gemini returned no content");

  let parsed: Partial<ParsedReminder>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${content.slice(0, 200)}`);
  }

  if (!parsed.title) throw new Error("Gemini did not produce a title");

  return {
    title: parsed.title,
    notes: parsed.notes ?? null,
    category: parsed.category ?? "personal",
    due_at: parsed.due_at ?? null,
    rrule: parsed.rrule ?? null,
  };
}
