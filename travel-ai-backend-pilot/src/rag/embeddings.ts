import OpenAI from "openai";

const EMBEDDING_DIM = 64;
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

let warnedEmbedFallback = false;

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function embedTextDeterministic(text: string, dims: number = EMBEDDING_DIM): number[] {
  const vector = new Array<number>(dims).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const h = hashToken(token);
    const idx = h % dims;
    const sign = h % 2 === 0 ? 1 : -1;
    vector[idx] += sign * (1 + (token.length % 3) * 0.1);
  }

  const mag = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => Number((v / mag).toFixed(8)));
}

function normalizeVector(vec: number[], dims: number): number[] {
  const clipped = vec.slice(0, dims);
  if (clipped.length < dims) {
    clipped.push(...new Array(dims - clipped.length).fill(0));
  }

  const mag = Math.sqrt(clipped.reduce((sum, v) => sum + v * v, 0)) || 1;
  return clipped.map((v) => Number((v / mag).toFixed(8)));
}

function parseEmbeddingDims(): number {
  const raw = process.env.EMBEDDING_DIMENSIONS?.trim();
  if (!raw) {
    return EMBEDDING_DIM;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return EMBEDDING_DIM;
  }
  return Math.floor(n);
}

function buildOpenAIClient(): OpenAI | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return undefined;
  }

  return new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

async function embedTextsWithOpenAI(texts: string[], dims: number): Promise<number[][]> {
  const model = process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  const client = buildOpenAIClient();
  if (!client) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const req: {
    model: string;
    input: string[];
    dimensions?: number;
  } = {
    model,
    input: texts,
  };

  // OpenAI embedding v3 models support configurable output dimensions.
  if (model.startsWith("text-embedding-3-")) {
    req.dimensions = dims;
  }

  const response = await client.embeddings.create(req);
  return response.data.map((row) => normalizeVector(row.embedding, dims));
}

function maybeWarnFallback(message: string): void {
  if (warnedEmbedFallback) {
    return;
  }
  warnedEmbedFallback = true;
  // eslint-disable-next-line no-console
  console.warn(`Embedding fallback active: ${message}`);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const dims = parseEmbeddingDims();
  if (texts.length === 0) {
    return [];
  }

  try {
    return await embedTextsWithOpenAI(texts, dims);
  } catch (error) {
    maybeWarnFallback((error as Error).message);
    return texts.map((text) => embedTextDeterministic(text, dims));
  }
}

export async function embedText(text: string): Promise<number[]> {
  const dims = parseEmbeddingDims();
  const result = await embedTexts([text]);
  return result[0] ?? embedTextDeterministic(text, dims);
}

export function vectorToPgLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export const embeddingDimension = EMBEDDING_DIM;
