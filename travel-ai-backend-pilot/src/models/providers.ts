import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type ModelPrompt = {
  system: string;
  user: string;
  context: string[];
};

export type ModelResult = {
  provider: string;
  text: string;
  latencyMs: number;
  normalizedTokens: number;
};

export interface ModelProvider {
  name: string;
  complete(prompt: ModelPrompt): Promise<ModelResult>;
}

type ProviderKind = "openai" | "anthropic" | "mock";

function normalizeTokens(user: string, context: string[], usageTotal?: number): number {
  if (usageTotal && Number.isFinite(usageTotal)) {
    return usageTotal;
  }
  return Math.ceil((user.length + context.join(" ").length) / 4);
}

function buildContextBlock(context: string[]): string {
  if (context.length === 0) {
    return "No retrieval context available.";
  }

  return [
    "Retrieved agency context (use for grounded guidance and cite-safe suggestions):",
    ...context.map((item, idx) => `${idx + 1}. ${item}`),
  ].join("\n");
}

export class LocalPrimaryFrontierModel implements ModelProvider {
  name = "mock-primary-frontier";

  async complete(prompt: ModelPrompt): Promise<ModelResult> {
    const started = Date.now();
    const text = [
      "Here are the best next options based on your preferences.",
      `I reviewed ${prompt.context.length} relevant agency sources and prioritized policy-safe guidance.`,
      "An advisor can confirm final inventory and pricing in real time.",
    ].join(" ");

    return {
      provider: this.name,
      text,
      latencyMs: Date.now() - started,
      normalizedTokens: normalizeTokens(prompt.user, prompt.context),
    };
  }
}

export class LocalFallbackModel implements ModelProvider {
  name = "mock-fallback-frontier";

  async complete(prompt: ModelPrompt): Promise<ModelResult> {
    const started = Date.now();
    return {
      provider: this.name,
      text: `Fallback response: we can still recommend options and route you to an advisor. Context items used: ${prompt.context.length}.`,
      latencyMs: Date.now() - started,
      normalizedTokens: normalizeTokens(prompt.user, prompt.context),
    };
  }
}

export class OpenAIModelProvider implements ModelProvider {
  name: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(args: { model: string; apiKey: string; baseUrl?: string; name?: string }) {
    this.model = args.model;
    this.name = args.name ?? `openai:${args.model}`;
    this.client = new OpenAI({
      apiKey: args.apiKey,
      baseURL: args.baseUrl,
    });
  }

  async complete(prompt: ModelPrompt): Promise<ModelResult> {
    const started = Date.now();
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: `${prompt.user}\n\n${buildContextBlock(prompt.context)}`,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error(`OpenAI returned empty completion for model ${this.model}`);
    }

    return {
      provider: this.name,
      text,
      latencyMs: Date.now() - started,
      normalizedTokens: normalizeTokens(prompt.user, prompt.context, completion.usage?.total_tokens),
    };
  }
}

export class AnthropicModelProvider implements ModelProvider {
  name: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(args: { model: string; apiKey: string; baseUrl?: string; name?: string }) {
    this.model = args.model;
    this.name = args.name ?? `anthropic:${args.model}`;
    this.client = new Anthropic({
      apiKey: args.apiKey,
      baseURL: args.baseUrl,
    });
  }

  async complete(prompt: ModelPrompt): Promise<ModelResult> {
    const started = Date.now();
    const completion = await this.client.messages.create({
      model: this.model,
      max_tokens: 700,
      temperature: 0.2,
      system: prompt.system,
      messages: [
        {
          role: "user",
          content: `${prompt.user}\n\n${buildContextBlock(prompt.context)}`,
        },
      ],
    });

    const text = completion.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();

    if (!text) {
      throw new Error(`Anthropic returned empty completion for model ${this.model}`);
    }

    const usageTokens = (completion.usage?.input_tokens ?? 0) + (completion.usage?.output_tokens ?? 0);

    return {
      provider: this.name,
      text,
      latencyMs: Date.now() - started,
      normalizedTokens: normalizeTokens(prompt.user, prompt.context, usageTokens),
    };
  }
}

export class ModelRouter {
  constructor(
    private readonly primary: ModelProvider,
    private readonly fallback: ModelProvider,
  ) {}

  async complete(prompt: ModelPrompt): Promise<ModelResult> {
    try {
      return await this.primary.complete(prompt);
    } catch {
      return this.fallback.complete(prompt);
    }
  }
}

function parseProviderKind(raw: string | undefined, defaultKind: ProviderKind): ProviderKind {
  const value = (raw ?? defaultKind).toLowerCase();
  if (value === "openai" || value === "anthropic" || value === "mock") {
    return value;
  }
  return defaultKind;
}

function resolveOpenAiProvider(name: string, model: string | undefined): ModelProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(`${name} provider is openai but OPENAI_API_KEY is not configured`);
  }
  return new OpenAIModelProvider({
    name,
    model: model && model.trim() !== "" ? model : "gpt-4.1-mini",
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
  });
}

function resolveAnthropicProvider(name: string, model: string | undefined): ModelProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(`${name} provider is anthropic but ANTHROPIC_API_KEY is not configured`);
  }
  return new AnthropicModelProvider({
    name,
    model: model && model.trim() !== "" ? model : "claude-3-5-sonnet-latest",
    apiKey,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
  });
}

function resolveProvider(args: { roleName: string; kind: ProviderKind; modelEnvValue: string | undefined }): ModelProvider {
  if (args.kind === "openai") {
    return resolveOpenAiProvider(args.roleName, args.modelEnvValue);
  }
  if (args.kind === "anthropic") {
    return resolveAnthropicProvider(args.roleName, args.modelEnvValue);
  }

  if (args.roleName === "primary") {
    return new LocalPrimaryFrontierModel();
  }
  return new LocalFallbackModel();
}

export function createModelRouterFromEnv(): ModelRouter {
  const primaryKind = parseProviderKind(process.env.MODEL_PRIMARY_PROVIDER, "mock");
  const fallbackKind = parseProviderKind(process.env.MODEL_FALLBACK_PROVIDER, "mock");

  let primary: ModelProvider;
  let fallback: ModelProvider;

  try {
    primary = resolveProvider({
      roleName: "primary",
      kind: primaryKind,
      modelEnvValue: process.env.MODEL_PRIMARY_MODEL,
    });
  } catch {
    primary = new LocalPrimaryFrontierModel();
  }

  try {
    fallback = resolveProvider({
      roleName: "fallback",
      kind: fallbackKind,
      modelEnvValue: process.env.MODEL_FALLBACK_MODEL,
    });
  } catch {
    fallback = new LocalFallbackModel();
  }

  return new ModelRouter(primary, fallback);
}
