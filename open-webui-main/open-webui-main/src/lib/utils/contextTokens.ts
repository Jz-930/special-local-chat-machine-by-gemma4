import { sha256 } from 'js-sha256';

type MessageLike = {
	id?: string;
	role?: string;
	content?: any;
	parentId?: string | null;
	files?: any[];
	merged?: { content?: any };
};

export type ContextTokenProfile = {
	id: string;
	cjkTokenRatio: number;
	latinCharsPerToken: number;
	numberCharsPerToken: number;
	punctuationTokenRatio: number;
	whitespaceCharsPerToken: number;
	newlineTokenRatio: number;
	messageOverhead: number;
	systemOverhead: number;
	markdownOverheadRatio: number;
	codeCharsPerToken: number;
	imageTokenCost: number;
};

export type ContextPayloadFlags = {
	hasFiles: boolean;
	hasTools: boolean;
	hasWebSearch: boolean;
	hasRag: boolean;
};

export type ContextTokenAnchor = {
	modelId: string;
	chatId?: string;
	anchorMessageId: string;
	actualPromptTokens: number;
	rawEstimatedPromptTokens: number;
	messageChainHash: string;
	messageChainIds: string[];
	systemPromptHash: string;
	systemEstimatedTokens: number;
	vaultTextHash: string;
	vaultEstimatedTokens: number;
	settingsHash: string;
	payloadFlags: ContextPayloadFlags;
	createdAt: number;
};

export type ContextTokenAnchorDraft = Omit<ContextTokenAnchor, 'actualPromptTokens' | 'createdAt'>;

export type ContextTokenBreakdown = {
	total: number;
	rawTotal: number;
	vault: number;
	history: number;
	system: number;
	mode: 'anchor_delta' | 'calibrated_estimate' | 'estimate';
	anchorMessageId?: string;
	calibrationFactor: number;
	profileId: string;
};

type CalibrationEntry = {
	factor: number;
	samples: number;
	updatedAt: number;
};

const ANCHORS_STORAGE_KEY = 'contextTokenAnchors';
const CALIBRATION_STORAGE_KEY = 'contextTokenCalibrationByModel';
const DEFAULT_CONTEXT_TOKENS = 250000;
const MAX_ANCHORS_PER_CHAT = 80;

const CLEAN_PAYLOAD_FLAGS: ContextPayloadFlags = {
	hasFiles: false,
	hasTools: false,
	hasWebSearch: false,
	hasRag: false
};

const PROFILES: Record<string, ContextTokenProfile> = {
	cjk_friendly: {
		id: 'cjk_friendly',
		cjkTokenRatio: 1.05,
		latinCharsPerToken: 3.8,
		numberCharsPerToken: 3.5,
		punctuationTokenRatio: 0.6,
		whitespaceCharsPerToken: 8,
		newlineTokenRatio: 0.5,
		messageOverhead: 8,
		systemOverhead: 12,
		markdownOverheadRatio: 0.08,
		codeCharsPerToken: 3.0,
		imageTokenCost: 85
	},
	cjk_expensive: {
		id: 'cjk_expensive',
		cjkTokenRatio: 1.35,
		latinCharsPerToken: 3.7,
		numberCharsPerToken: 3.4,
		punctuationTokenRatio: 0.65,
		whitespaceCharsPerToken: 8,
		newlineTokenRatio: 0.5,
		messageOverhead: 8,
		systemOverhead: 12,
		markdownOverheadRatio: 0.1,
		codeCharsPerToken: 2.8,
		imageTokenCost: 85
	},
	openai_like: {
		id: 'openai_like',
		cjkTokenRatio: 1.15,
		latinCharsPerToken: 4.0,
		numberCharsPerToken: 3.5,
		punctuationTokenRatio: 0.6,
		whitespaceCharsPerToken: 8,
		newlineTokenRatio: 0.5,
		messageOverhead: 6,
		systemOverhead: 10,
		markdownOverheadRatio: 0.08,
		codeCharsPerToken: 3.0,
		imageTokenCost: 85
	},
	fallback: {
		id: 'fallback',
		cjkTokenRatio: 1.25,
		latinCharsPerToken: 3.8,
		numberCharsPerToken: 3.5,
		punctuationTokenRatio: 0.65,
		whitespaceCharsPerToken: 8,
		newlineTokenRatio: 0.5,
		messageOverhead: 8,
		systemOverhead: 12,
		markdownOverheadRatio: 0.1,
		codeCharsPerToken: 2.9,
		imageTokenCost: 85
	}
};

const VAULT_HEADER =
	'\u3010\u5c0f\u8bf4\u540e\u53f0\u8bb0\u5fc6\u6cd5\u5219\uff1a\u6700\u9ad8\u4f18\u5148\u7ea7 (Vault)\u3011';

const isBrowser = () => typeof localStorage !== 'undefined';

const safeParse = <T>(value: string | null, fallback: T): T => {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
};

export const hashText = (value: string) => sha256(value ?? '');

export const buildVaultBlock = (manualMemoryText = '') => {
	const manualVault = manualMemoryText.trim();
	return manualVault ? `${VAULT_HEADER}\n${manualVault}\n\n====================\n\n` : '';
};

export const buildPromptSystemContent = (systemPrompt = '', manualMemoryText = '') => {
	return `${buildVaultBlock(manualMemoryText)}${systemPrompt ?? ''}`;
};

export const getContextTokenProfile = (modelId = ''): ContextTokenProfile => {
	const id = modelId.toLowerCase();
	if (/(qwen|deepseek|glm|yi|moonshot|kimi)/i.test(id)) return PROFILES.cjk_friendly;
	if (/(llama|mistral|mixtral|gemma|phi)/i.test(id)) return PROFILES.cjk_expensive;
	if (/(gpt|openai|claude|anthropic|o1|o3|o4)/i.test(id)) return PROFILES.openai_like;
	return PROFILES.fallback;
};

const isCjk = (char: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char);
const isLatin = (char: string) => /\p{Script=Latin}/u.test(char);
const isNumber = (char: string) => /\p{Number}/u.test(char);
const isSpace = (char: string) => /[ \t\f\v\r]/.test(char);
const isNewline = (char: string) => char === '\n';
const isMarkdownSyntax = (char: string) => /[#*_>`~\-[\]()|]/.test(char);

const codePointLength = (text: string) => Array.from(text ?? '').length;

const estimatePlainTextTokens = (text: string, profile: ContextTokenProfile) => {
	let tokens = 0;
	let latinRun = 0;
	let numberRun = 0;
	let spaceRun = 0;
	let markdownSyntax = 0;

	const flushLatin = () => {
		if (latinRun) {
			tokens += latinRun / profile.latinCharsPerToken;
			latinRun = 0;
		}
	};

	const flushNumber = () => {
		if (numberRun) {
			tokens += numberRun / profile.numberCharsPerToken;
			numberRun = 0;
		}
	};

	const flushSpace = () => {
		if (spaceRun) {
			tokens += spaceRun / profile.whitespaceCharsPerToken;
			spaceRun = 0;
		}
	};

	const flushRuns = () => {
		flushLatin();
		flushNumber();
		flushSpace();
	};

	for (const char of text ?? '') {
		if (isLatin(char)) {
			flushNumber();
			flushSpace();
			latinRun += 1;
		} else if (isNumber(char)) {
			flushLatin();
			flushSpace();
			numberRun += 1;
		} else if (isSpace(char)) {
			flushLatin();
			flushNumber();
			spaceRun += 1;
		} else {
			flushRuns();
			if (isCjk(char)) {
				tokens += profile.cjkTokenRatio;
			} else if (isNewline(char)) {
				tokens += profile.newlineTokenRatio;
			} else {
				if (isMarkdownSyntax(char)) markdownSyntax += 1;
				tokens += profile.punctuationTokenRatio;
			}
		}
	}

	flushRuns();
	tokens += markdownSyntax * profile.markdownOverheadRatio;
	return tokens;
};

export const estimateTextTokens = (text = '', profile = getContextTokenProfile()) => {
	if (!text) return 0;

	const parts = text.split(/(```[\s\S]*?```)/g);
	let tokens = 0;

	for (const part of parts) {
		if (!part) continue;
		if (part.startsWith('```')) {
			tokens += codePointLength(part) / profile.codeCharsPerToken;
		} else {
			tokens += estimatePlainTextTokens(part, profile);
		}
	}

	return Math.ceil(tokens);
};

export const extractMessageText = (content: any): string => {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === 'string') return part;
				if (typeof part?.text === 'string') return part.text;
				if (typeof part?.content === 'string') return part.content;
				return '';
			})
			.join('\n');
	}
	if (typeof content?.text === 'string') return content.text;
	return '';
};

const countImageParts = (message: MessageLike) => {
	const contentImages = Array.isArray(message?.content)
		? message.content.filter((part) => part?.type === 'image_url' || part?.type === 'image').length
		: 0;
	const fileImages = (message?.files ?? []).filter(
		(file) => file?.type === 'image' || (file?.content_type ?? '').startsWith('image/')
	).length;
	return contentImages + fileImages;
};

export const defaultStripReasoningContent = (content: string) =>
	(content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

export const normalizeMessageContentForTokens = (
	message: MessageLike,
	stripReasoning = false,
	stripReasoningContent: (content: string) => string = defaultStripReasoningContent
) => {
	const content = message?.merged?.content ?? message?.content;
	let text = extractMessageText(content);
	if (stripReasoning && message?.role === 'assistant') {
		text = stripReasoningContent(text);
	}
	return text;
};

export const estimateMessageTokens = (
	message: MessageLike,
	profile = getContextTokenProfile(),
	options: {
		stripReasoning?: boolean;
		stripReasoningContent?: (content: string) => string;
	} = {}
) => {
	const text = normalizeMessageContentForTokens(
		message,
		options.stripReasoning ?? false,
		options.stripReasoningContent
	);
	const overhead = message?.role === 'system' ? profile.systemOverhead : profile.messageOverhead;
	return (
		overhead +
		estimateTextTokens(text, profile) +
		countImageParts(message) * profile.imageTokenCost
	);
};

export const getContextSettingsHash = (settings: Record<string, any>) =>
	hashText(JSON.stringify(settings ?? {}));

export const getMessageChainIds = (messages: MessageLike[]) =>
	(messages ?? []).map((message) => message?.id).filter(Boolean) as string[];

export const hashMessageChain = (
	messages: MessageLike[],
	options: {
		stripReasoning?: boolean;
		stripReasoningContent?: (content: string) => string;
	} = {}
) =>
	hashText(
		JSON.stringify(
			(messages ?? []).map((message) => ({
				id: message?.id ?? null,
				role: message?.role ?? null,
				parentId: message?.parentId ?? null,
				contentHash: hashText(
					normalizeMessageContentForTokens(
						message,
						options.stripReasoning ?? false,
						options.stripReasoningContent
					)
				)
			}))
		)
	);

const cleanPayload = (flags?: ContextPayloadFlags) => {
	const value = flags ?? CLEAN_PAYLOAD_FLAGS;
	return !value.hasFiles && !value.hasTools && !value.hasWebSearch && !value.hasRag;
};

const getAnchorStore = (): Record<string, Record<string, ContextTokenAnchor>> => {
	if (!isBrowser()) return {};
	return safeParse(localStorage.getItem(ANCHORS_STORAGE_KEY), {});
};

const setAnchorStore = (store: Record<string, Record<string, ContextTokenAnchor>>) => {
	if (!isBrowser()) return;
	localStorage.setItem(ANCHORS_STORAGE_KEY, JSON.stringify(store));
};

export const saveContextTokenAnchor = (anchor: ContextTokenAnchor) => {
	if (!isBrowser() || !anchor?.anchorMessageId || !cleanPayload(anchor.payloadFlags)) return false;

	const chatKey = anchor.chatId || '__global__';
	const store = getAnchorStore();
	const chatAnchors = {
		...(store[chatKey] ?? {}),
		[anchor.anchorMessageId]: anchor
	};
	const sorted = Object.values(chatAnchors).sort((a, b) => b.createdAt - a.createdAt);

	store[chatKey] = Object.fromEntries(
		sorted.slice(0, MAX_ANCHORS_PER_CHAT).map((item) => [item.anchorMessageId, item])
	);
	setAnchorStore(store);
	return true;
};

export const getInputTokensFromUsage = (usage: any): number | null => {
	const value =
		usage?.input_tokens ??
		usage?.prompt_tokens ??
		usage?.prompt_eval_count ??
		usage?.usage?.input_tokens ??
		usage?.usage?.prompt_tokens;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};

const getCalibrationStore = (): Record<string, CalibrationEntry> => {
	if (!isBrowser()) return {};
	return safeParse(localStorage.getItem(CALIBRATION_STORAGE_KEY), {});
};

const setCalibrationStore = (store: Record<string, CalibrationEntry>) => {
	if (!isBrowser()) return;
	localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(store));
};

export const getContextTokenCalibrationFactor = (modelId = '') => {
	const entry = getCalibrationStore()[modelId];
	const factor = Number(entry?.factor);
	return Number.isFinite(factor) && factor > 0 ? factor : 1;
};

export const updateContextTokenCalibration = (
	modelId: string,
	estimatedInputTokens: number,
	actualInputTokens: number,
	payloadFlags?: ContextPayloadFlags
) => {
	if (!isBrowser() || !modelId || !cleanPayload(payloadFlags)) return false;
	if (!estimatedInputTokens || estimatedInputTokens < 1000 || !actualInputTokens) return false;

	const newFactor = actualInputTokens / estimatedInputTokens;
	if (!Number.isFinite(newFactor) || newFactor < 0.5 || newFactor > 2.5) return false;

	const store = getCalibrationStore();
	const current = store[modelId];
	const factor = current?.factor ? current.factor * 0.7 + newFactor * 0.3 : newFactor;

	store[modelId] = {
		factor,
		samples: (current?.samples ?? 0) + 1,
		updatedAt: Date.now()
	};
	setCalibrationStore(store);
	return true;
};

export const parseContextBudgetToTokens = (input: string, modelId = '') => {
	if (!input) return null;

	let str = input.toLowerCase().replace(/,/g, '').trim();
	const profile = getContextTokenProfile(modelId);
	const hasCharacterUnit = /(\u5b57\u7b26|\u5b57|characters?|chars?)/i.test(str);

	str = str
		.replace(/tokens?|tok|characters?|chars?|\u5b57\u7b26|\u5b57/gi, '')
		.replace(/\s+/g, '')
		.trim();

	let multiplier = 1;
	if (/[w\u4e07]$/.test(str)) {
		multiplier = 10000;
		str = str.replace(/[w\u4e07]$/g, '');
	} else if (/kb?$/.test(str)) {
		multiplier = 1024;
		str = str.replace(/kb?$/g, '');
	} else if (/mb?$/.test(str)) {
		multiplier = 1024 * 1024;
		str = str.replace(/mb?$/g, '');
	}

	const parsed = parseFloat(str);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;

	const value = parsed * multiplier;
	return Math.round(hasCharacterUnit ? value * profile.cjkTokenRatio : value);
};

export const getStoredMaxContextTokens = () => {
	if (!isBrowser()) return DEFAULT_CONTEXT_TOKENS;
	const storedTokens = parseInt(localStorage.getItem('maxContextTokens') ?? '', 10);
	if (Number.isFinite(storedTokens) && storedTokens > 0) return storedTokens;

	const legacy = parseInt(localStorage.getItem('maxContextLoad') ?? '', 10);
	if (Number.isFinite(legacy) && legacy > 0) {
		localStorage.setItem('maxContextTokens', String(legacy));
		return legacy;
	}

	return DEFAULT_CONTEXT_TOKENS;
};

export const findValidAnchor = (input: {
	modelId: string;
	chatId?: string;
	currentMessageChain: MessageLike[];
	settingsHash: string;
	stripReasoning?: boolean;
	stripReasoningContent?: (content: string) => string;
}) => {
	if (!isBrowser()) return null;

	const chatKey = input.chatId || '__global__';
	const store = getAnchorStore();
	const anchors = {
		...(store.__global__ ?? {}),
		...(store[chatKey] ?? {})
	};
	const currentIds = getMessageChainIds(input.currentMessageChain);

	for (let index = currentIds.length - 1; index >= 0; index -= 1) {
		const messageId = currentIds[index];
		const anchor = anchors[messageId];
		if (!anchor) continue;
		if (anchor.modelId !== input.modelId) continue;
		if (anchor.settingsHash !== input.settingsHash) continue;
		if (!cleanPayload(anchor.payloadFlags)) continue;

		const promptChain = input.currentMessageChain.slice(0, index);
		const promptChainHash = hashMessageChain(promptChain, {
			stripReasoning: input.stripReasoning,
			stripReasoningContent: input.stripReasoningContent
		});
		if (promptChainHash !== anchor.messageChainHash) continue;

		return anchor;
	}

	return null;
};

export const estimateContextTokens = (input: {
	manualMemoryText?: string;
	systemPrompt?: string;
	messages?: MessageLike[];
	modelId?: string;
	chatId?: string;
	stripReasoning?: boolean;
	stripReasoningContent?: (content: string) => string;
	useAnchor?: boolean;
	calibrationFactor?: number;
	settingsHash?: string;
}): ContextTokenBreakdown => {
	const profile = getContextTokenProfile(input.modelId);
	const messages = input.messages ?? [];
	const stripReasoning = input.stripReasoning ?? false;
	const stripReasoningContent = input.stripReasoningContent ?? defaultStripReasoningContent;

	const vaultBlock = buildVaultBlock(input.manualMemoryText ?? '');
	const vault = estimateTextTokens(vaultBlock, profile);
	const system = estimateTextTokens(input.systemPrompt ?? '', profile) + (vaultBlock || input.systemPrompt ? profile.systemOverhead : 0);
	const history = messages.reduce(
		(total, message) =>
			total +
			(message?.role === 'system'
				? 0
				: estimateMessageTokens(message, profile, { stripReasoning, stripReasoningContent })),
		0
	);
	const rawTotal = Math.max(0, Math.round(vault + system + history));
	const settingsHash =
		input.settingsHash ??
		getContextSettingsHash({
			stripReasoning
		});

	if (input.useAnchor !== false) {
		const anchor = findValidAnchor({
			modelId: input.modelId ?? '',
			chatId: input.chatId,
			currentMessageChain: messages,
			settingsHash,
			stripReasoning,
			stripReasoningContent
		});

		if (anchor) {
			const anchorIndex = messages.findIndex((message) => message?.id === anchor.anchorMessageId);
			const introducedMessages = anchorIndex >= 0 ? messages.slice(anchorIndex) : [];
			const introducedTokens = introducedMessages.reduce(
				(total, message) =>
					total + estimateMessageTokens(message, profile, { stripReasoning, stripReasoningContent }),
				0
			);
			const total = Math.max(
				0,
				Math.round(
					anchor.actualPromptTokens +
						introducedTokens +
						(vault - anchor.vaultEstimatedTokens) +
						(system - anchor.systemEstimatedTokens)
				)
			);

			return {
				total,
				rawTotal,
				vault,
				system,
				history,
				mode: 'anchor_delta',
				anchorMessageId: anchor.anchorMessageId,
				calibrationFactor: 1,
				profileId: profile.id
			};
		}
	}

	const calibrationFactor =
		input.calibrationFactor ?? getContextTokenCalibrationFactor(input.modelId ?? '');
	const calibratedTotal = Math.max(0, Math.round(rawTotal * calibrationFactor));

	return {
		total: calibratedTotal,
		rawTotal,
		vault,
		system,
		history,
		mode: calibrationFactor !== 1 ? 'calibrated_estimate' : 'estimate',
		calibrationFactor,
		profileId: profile.id
	};
};

export const createContextTokenAnchorDraft = (input: {
	modelId: string;
	chatId?: string;
	anchorMessageId: string;
	messageChain: MessageLike[];
	systemPrompt?: string;
	manualMemoryText?: string;
	stripReasoning?: boolean;
	stripReasoningContent?: (content: string) => string;
	payloadFlags?: ContextPayloadFlags;
	settingsHash?: string;
}) => {
	const profile = getContextTokenProfile(input.modelId);
	const stripReasoning = input.stripReasoning ?? false;
	const stripReasoningContent = input.stripReasoningContent ?? defaultStripReasoningContent;
	const estimate = estimateContextTokens({
		manualMemoryText: input.manualMemoryText,
		systemPrompt: input.systemPrompt,
		messages: input.messageChain,
		modelId: input.modelId,
		stripReasoning,
		stripReasoningContent,
		useAnchor: false,
		calibrationFactor: 1
	});
	const vaultBlock = buildVaultBlock(input.manualMemoryText ?? '');
	const settingsHash =
		input.settingsHash ??
		getContextSettingsHash({
			stripReasoning
		});

	return {
		modelId: input.modelId,
		chatId: input.chatId,
		anchorMessageId: input.anchorMessageId,
		rawEstimatedPromptTokens: estimate.rawTotal,
		messageChainHash: hashMessageChain(input.messageChain, {
			stripReasoning,
			stripReasoningContent
		}),
		messageChainIds: getMessageChainIds(input.messageChain),
		systemPromptHash: hashText(input.systemPrompt ?? ''),
		systemEstimatedTokens:
			estimateTextTokens(input.systemPrompt ?? '', profile) +
			(vaultBlock || input.systemPrompt ? profile.systemOverhead : 0),
		vaultTextHash: hashText(vaultBlock),
		vaultEstimatedTokens: estimateTextTokens(vaultBlock, profile),
		settingsHash,
		payloadFlags: input.payloadFlags ?? CLEAN_PAYLOAD_FLAGS
	} satisfies ContextTokenAnchorDraft;
};

export const finalizeContextTokenAnchor = (
	draft: ContextTokenAnchorDraft,
	actualPromptTokens: number
): ContextTokenAnchor => ({
	...draft,
	actualPromptTokens,
	createdAt: Date.now()
});
