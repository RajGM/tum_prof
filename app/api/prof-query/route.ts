// app/api/prof-query/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

export const runtime = "nodejs";

const PINECONE_API_KEY = process.env.PINECONE_API_KEY!;
const PINECONE_HOST = process.env.PINECONE_HOST!;
const PINECONE_INDEX = process.env.PINECONE_INDEX || "tum2prof";
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || ""; // optional
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY!;

if (!PINECONE_API_KEY) throw new Error("Missing PINECONE_API_KEY");
if (!PINECONE_HOST) throw new Error("Missing PINECONE_HOST");
if (!PINECONE_INDEX) throw new Error("Missing PINECONE_INDEX");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY (or OPENAI_KEY)");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const baseIndex = pc.index(PINECONE_INDEX, PINECONE_HOST);
const index =
  PINECONE_NAMESPACE && typeof (baseIndex as any).namespace === "function"
    ? (baseIndex as any).namespace(PINECONE_NAMESPACE)
    : baseIndex;

// If your SDK doesn’t support index.namespace(), we’ll pass `namespace` in query calls
const namespaceFallback =
  PINECONE_NAMESPACE && typeof (baseIndex as any).namespace !== "function"
    ? PINECONE_NAMESPACE
    : undefined;

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

type MatchForClient = {
  score: number;
  professor: string;
  url: string;
  chunkBlock: string;
  snippet: string;
};

function shorten(text: string, max = 220) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3) + "...";
}

async function embedQuery(q: string) {
  const emb = await openai.embeddings.create({
    model: "text-embedding-3-small",
    dimensions: 512,
    input: q,
  });
  return emb.data[0].embedding;
}

async function pineconeQuery(params: {
  vector: number[];
  topK: number;
  filter?: Record<string, any>;
}) {
  const payload: any = {
    vector: params.vector,
    topK: params.topK,
    includeMetadata: true,
    filter: params.filter,
  };
  if (namespaceFallback) payload.namespace = namespaceFallback;
  return await (index as any).query(payload);
}

function matchesToClient(matches: any[]): MatchForClient[] {
  return matches.map((m) => {
    const md = m.metadata || {};
    const professor = md.professor || md.professorName || "(unknown)";
    const url = md.source_url || md.url || "";
    const chunkBlock = md.chunk_block || md.chunkBlock || "";
    const text = md.text || "";
    return {
      score: m.score ?? m._score ?? 0,
      professor,
      url,
      chunkBlock,
      snippet: shorten(String(text)),
    };
  });
}

function buildContext(matches: any[]) {
  return matches
    .map((m, i) => {
      const md = m.metadata || {};
      const professor = md.professor || md.professorName || "Unknown";
      const url = md.source_url || md.url || "";
      const block = md.chunk_block || "";
      const text = (md.text || "").toString();

      return [
        `[#${i + 1}] Professor: ${professor}`,
        block ? `Section: ${block}` : null,
        url ? `Source: ${url}` : null,
        "",
        text,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");
}

/**
 * Always rewrite the latest user message into a standalone retrieval query using chat history.
 * This makes follow-up questions work (pronouns, "what about awards?", etc.).
 *
 * Request body must send: { messages: [{role, content}, ...] }
 * and the LAST message must be { role: "user", content: "..." }
 */
async function rewriteToStandalone(messages: ChatMsg[]) {
  const history = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are a query rewriter for semantic search.\n" +
          "Rewrite the user's latest message into a fully standalone question.\n" +
          "Rules:\n" +
          "- Resolve pronouns and references using the conversation.\n" +
          "- If the user asks for contact info (email/phone/address), make the subject explicit.\n" +
          "- Preserve intent; do not add facts.\n" +
          "Output ONLY the rewritten question (no quotes, no commentary).",
      },
      ...history,
      { role: "user", content: "Rewrite my latest message into a standalone question." },
    ],
  });

  return resp.choices[0]?.message?.content?.trim() || messages[messages.length - 1]?.content || "";
}

async function askLLM(finalQuestion: string, context: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You answer questions about TUM professors using ONLY the provided context. " +
          "If the answer is not in the context, say you don’t have that information. " +
          "Write a polished, direct answer. " +
          "Do NOT mention sources, retrieval, Pinecone, embeddings, or chunks. " +
          "Output ONLY the final answer text.",
      },
      { role: "user", content: `Question:\n${finalQuestion}\n\nContext:\n${context}` },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body?.messages as ChatMsg[] | undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid "messages" array in body' },
        { status: 400 }
      );
    }

    const last = messages[messages.length - 1];
    if (!last || last.role !== "user" || typeof last.content !== "string" || !last.content.trim()) {
      return NextResponse.json(
        { error: 'The last message must be a user message with non-empty "content".' },
        { status: 400 }
      );
    }

    // 0) rewrite latest user message into a standalone query (no heuristics)
    const rewrittenQuestion = await rewriteToStandalone(messages);

    // 1) embed rewritten query
    const qVec = await embedQuery(rewrittenQuestion);

    // 2) stage 1: route via summaries (best professor docs)
    const summaryRes = await pineconeQuery({
      vector: qVec,
      topK: 3,
      filter: { kind: "profile_summary" },
    });

    const summaryMatches: any[] = summaryRes?.matches || [];
    const docIds = Array.from(
      new Set(summaryMatches.map((m) => m?.metadata?.doc_id).filter(Boolean))
    );

    // 3) stage 2: fetch chunks filtered to routed docs
    const chunkFilter =
      docIds.length > 0
        ? { kind: "profile_chunk", doc_id: { $in: docIds } }
        : { kind: "profile_chunk" };

    const chunkRes = await pineconeQuery({
      vector: qVec,
      topK: 12,
      filter: chunkFilter,
    });

    let chunkMatches: any[] = chunkRes?.matches || [];

    // broaden once if routing is too narrow
    if (docIds.length > 0 && chunkMatches.length < 3) {
      const broadenRes = await pineconeQuery({
        vector: qVec,
        topK: 12,
        filter: { kind: "profile_chunk" },
      });
      chunkMatches = broadenRes?.matches || chunkMatches;
    }

    if (!chunkMatches.length) {
      return NextResponse.json({
        answer:
          "I could not find relevant information in the indexed professor profiles for that question.",
        matches: [],
        rewrittenQuestion,
      });
    }

    // pick up to 8 chunks; prefer diverse sections
    const picked: any[] = [];
    const seenBlocks = new Set<string>();

    for (const m of chunkMatches) {
      if (picked.length >= 8) break;
      const block = (m?.metadata?.chunk_block || "") as string;
      if (!block || !seenBlocks.has(block)) {
        picked.push(m);
        if (block) seenBlocks.add(block);
      }
    }
    for (const m of chunkMatches) {
      if (picked.length >= 8) break;
      if (!picked.includes(m)) picked.push(m);
    }

    const context = buildContext(picked);

    // 4) final answer (ONLY polished answer)
    const answer = await askLLM(rewrittenQuestion, context);

    return NextResponse.json({
      answer,
      matches: matchesToClient(picked), // use for UI cards
      rewrittenQuestion, // remove in prod if you want
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("API error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
