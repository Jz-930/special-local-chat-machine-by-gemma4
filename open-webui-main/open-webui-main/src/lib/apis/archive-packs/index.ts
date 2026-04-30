import { WEBUI_API_BASE_URL } from '$lib/constants';

class NonJsonArchiveResponseError extends Error {
	retryable = true;

	constructor(
		public url: string,
		public status: number
	) {
		super(`档案接口返回了页面内容，不是 JSON。请求地址：${url}。HTTP ${status}`);
	}
}

const hasToken = (token: string) => token && token !== 'undefined' && token !== 'null';

const jsonHeaders = (token: string) => {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Content-Type': 'application/json'
	};

	if (hasToken(token)) {
		headers.authorization = `Bearer ${token}`;
	}

	return headers;
};

const uniqueUrls = (urls: string[]) => [...new Set(urls.filter(Boolean).map((url) => url.replace(/\/$/, '')))];

const getArchiveApiBaseUrls = () => {
	const urls: string[] = [];

	if (typeof window !== 'undefined') {
		const { protocol, hostname, port, origin } = window.location;

		if (port === '8080') {
			urls.push(`${origin}/api/v1`);
		}

		if (hostname && hostname !== '0.0.0.0') {
			urls.push(`${protocol}//${hostname}:8080/api/v1`);
		}

		urls.push('http://localhost:8080/api/v1', 'http://127.0.0.1:8080/api/v1');
	}

	urls.push(WEBUI_API_BASE_URL || '/api/v1', '/api/v1');

	return uniqueUrls(urls);
};

async function parseJsonResponse(res: Response, url: string) {
	const text = await res.text();
	const contentType = res.headers.get('content-type') || '';
	const looksJson = contentType.includes('application/json') || /^[\s\n\r]*[\[{]/.test(text);

	if (!text) return null;
	if (!looksJson) {
		throw new NonJsonArchiveResponseError(url, res.status);
	}

	return JSON.parse(text);
}

async function ensureArchiveToken(token: string, baseUrl: string) {
	if (hasToken(token)) return token;

	const url = `${baseUrl}/auths/signin`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ email: '', password: '' })
	});

	const data = await parseJsonResponse(res, url);
	if (!res.ok) throw data?.detail || '无法初始化本地工作区会话';
	if (data?.token && typeof localStorage !== 'undefined') {
		localStorage.token = data.token;
	}

	return data?.token || token;
}

async function requestJson(token: string, path: string, options: RequestInit = {}) {
	let lastError: any = null;

	for (const baseUrl of getArchiveApiBaseUrls()) {
		const url = `${baseUrl}/archive-packs${path}`;
		try {
			const archiveToken = await ensureArchiveToken(token, baseUrl);
			const res = await fetch(url, {
				...options,
				headers: {
					...jsonHeaders(archiveToken),
					...(options.headers || {})
				}
			});
			const data = await parseJsonResponse(res, url);
			if (!res.ok) throw data;
			return data;
		} catch (err) {
			lastError = err;
			console.error(err);
		}
	}

	throw lastError?.detail || lastError?.message || lastError || '档案接口请求失败';
}

export const listArchivePacks = async (token: string) => requestJson(token, '');

export const exportArchivePack = async (token: string, payload: object) =>
	requestJson(token, '/export', {
		method: 'POST',
		body: JSON.stringify(payload)
	});

export const exportArchivePackFiles = async (token: string, payload: object) =>
	requestJson(token, '/export-files', {
		method: 'POST',
		body: JSON.stringify(payload)
	});

export const inspectArchivePack = async (token: string, payload: object) =>
	requestJson(token, '/inspect', {
		method: 'POST',
		body: JSON.stringify(payload)
	});

export const importArchivePack = async (token: string, payload: object) =>
	requestJson(token, '/import', {
		method: 'POST',
		body: JSON.stringify(payload)
	});

export const importArchivePackFiles = async (token: string, payload: object) =>
	requestJson(token, '/import-files', {
		method: 'POST',
		body: JSON.stringify(payload)
	});

export const inspectArchiveClear = async (token: string, payload: object) =>
	requestJson(token, '/clear/inspect', {
		method: 'POST',
		body: JSON.stringify(payload)
	});

export const clearArchiveData = async (token: string, payload: object) =>
	requestJson(token, '/clear', {
		method: 'POST',
		body: JSON.stringify(payload)
	});

export const deleteArchivePack = async (token: string, packName: string) =>
	requestJson(token, `/${encodeURIComponent(packName)}`, {
		method: 'DELETE'
	});
