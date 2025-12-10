// app/api/prof-query/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY!;
const PINECONE_HOST = process.env.PINECONE_HOST!;
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'tumprof';
const TEXT_FIELD = process.env.PINECONE_TEXT_FIELD || 'text';
const OPENAI_API_KEY = process.env.OPENAI_KEY!;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

type PineconeHit = {
  _id: string;
  _score: number;
  fields?: Record<string, unknown>;
};

type MatchForClient = {
  score: number;
  name: string;
  url: string;
  snippet: string;
};

function shorten(text: string, max = 200): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3) + '...';
}

async function searchPinecone(question: string, topK = 5): Promise<PineconeHit[]> {
  const url = `${PINECONE_HOST}/records/namespaces/${encodeURIComponent(
    PINECONE_NAMESPACE
  )}/search`;

  const body = {
    query: {
      inputs: { text: question },
      top_k: topK,
    },
    fields: [TEXT_FIELD, 'professorName', 'url', 'filename'],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json',
      'X-Pinecone-Api-Version': '2025-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Pinecone error:', errText);
    throw new Error(`Pinecone search failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return (data?.result?.hits || []) as PineconeHit[];
}

function buildContextMarkdown(hits: PineconeHit[]): {
  context: string;
  hitsForClient: MatchForClient[];
} {
  let context = '';
  const hitsForClient: MatchForClient[] = [];

  hits.forEach((hit, idx) => {
    const fields = (hit.fields || {}) as Record<string, string>;
    const name = fields.professorName || fields.professorname || '(unknown name)';
    const url = fields.url || hit._id || '(no URL)';
    const md = fields[TEXT_FIELD] || '';

    context += `--- PROFESSOR #${idx + 1} ---\n`;
    context += `Name: ${name}\n`;
    context += `URL: ${url}\n\n`;
    context += `${md}\n\n`;

    hitsForClient.push({
      score: hit._score,
      name,
      url,
      snippet: shorten(md),
    });
  });

  return { context, hitsForClient };
}

async function askOpenAIAssistant(
  question: string,
  contextMarkdown: string
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'You are an assistant answering questions about TUM professors. ' +
          'You are given a set of professor profiles in Markdown. ' +
          'Use ONLY this information to answer. ' +
          'If the answer is not stated in the profiles, say so clearly.',
      },
      {
        role: 'user',
        content:
          `Here are the relevant professor profiles:\n\n` +
          `--- PROFILES START ---\n` +
          `${contextMarkdown}\n` +
          `--- PROFILES END ---\n\n` +
          `User question: ${question}\n\n` +
          `Please:\n` +
          `1. Name the best-matching professor(s) with their URL.\n` +
          `2. Explain why they are relevant.\n` +
          `3. Answer the question as specifically as possible from the profiles.`,
      },
    ],
  });

  return completion.choices[0].message.content || '';
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "question" in body' },
        { status: 400 }
      );
    }

    const hits = await searchPinecone(question, 5);

    if (!hits.length) {
      return NextResponse.json({
        answer:
          'I could not find any professors matching that question in the indexed data.',
        matches: [],
      });
    }

    const { context, hitsForClient } = buildContextMarkdown(hits);

    const answer = await askOpenAIAssistant(question, context);

    return NextResponse.json({
      answer,
      matches: hitsForClient,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('API error:', err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}