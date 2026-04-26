import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const API_BASE = "https://digi-api.com/api/v1";
const PAGE_SIZE = 100;
const CONCURRENCY = 4;
const RETRY = 3;

const namesOutputPath = resolve("public/data/digimon-ko-names.json");
const descriptionsOutputPath = resolve("public/data/digimon-ko-descriptions.json");

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function fetchJsonWithRetry(url, retries = RETRY) {
	for (let i = 0; i <= retries; i += 1) {
		try {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			return await response.json();
		} catch (error) {
			if (i === retries) {
				throw error;
			}
			await sleep(600 * (i + 1));
		}
	}

	throw new Error("Unexpected retry termination");
}

async function translateText(text) {
	if (!text || !text.trim()) {
		return "";
	}

	const endpoint = new URL("https://translate.googleapis.com/translate_a/single");
	endpoint.searchParams.set("client", "gtx");
	endpoint.searchParams.set("sl", "en");
	endpoint.searchParams.set("tl", "ko");
	endpoint.searchParams.set("dt", "t");
	endpoint.searchParams.set("q", text);

	const result = await fetchJsonWithRetry(endpoint.toString(), 2);
	return Array.isArray(result?.[0]) ? result[0].map((chunk) => chunk[0]).join("") : text;
}

async function fetchAllDigimonSummaries() {
	const firstPage = await fetchJsonWithRetry(`${API_BASE}/digimon?page=0&pageSize=${PAGE_SIZE}`);
	const totalPages = firstPage.pageable?.totalPages ?? 0;
	const all = [...(firstPage.content ?? [])];

	for (let page = 1; page < totalPages; page += 1) {
		const current = await fetchJsonWithRetry(
			`${API_BASE}/digimon?page=${page}&pageSize=${PAGE_SIZE}`,
		);
		all.push(...(current.content ?? []));
	}

	return all;
}

function parseDictionarySource(source) {
	try {
		return JSON.parse(source);
	} catch {
		return {};
	}
}

async function readExistingDictionary() {
	try {
		const [nameSource, descriptionSource] = await Promise.all([
			readFile(namesOutputPath, "utf8"),
			readFile(descriptionsOutputPath, "utf8"),
		]);
		const nameMap = parseDictionarySource(nameSource);
		const descriptionMap = parseDictionarySource(descriptionSource);
		const merged = {};

		for (const [id, name] of Object.entries(nameMap)) {
			merged[id] = {
				name,
				description: descriptionMap[id] || "",
			};
		}

		return merged;
	} catch {
		return {};
	}
}

function createWorkerPool(items, worker, concurrency = CONCURRENCY) {
	let index = 0;

	const run = async () => {
		while (index < items.length) {
			const currentIndex = index;
			index += 1;
			await worker(items[currentIndex], currentIndex);
		}
	};

	return Promise.all(Array.from({ length: concurrency }, run));
}

async function main() {
	await mkdir(resolve("public/data"), { recursive: true });

	const existing = await readExistingDictionary();
	const summaries = await fetchAllDigimonSummaries();

	const targetIds = summaries.map((item) => item.id);
	console.log(`총 ${targetIds.length}마리 확인. 번역 시작...`);

	const dictionary = { ...existing };
	let done = 0;

	await createWorkerPool(targetIds, async (id) => {
		if (dictionary[id]?.name && dictionary[id]?.description) {
			done += 1;
			if (done % 50 === 0) {
				console.log(`진행률 ${done}/${targetIds.length} (캐시 활용)`);
			}
			return;
		}

		const detail = await fetchJsonWithRetry(`${API_BASE}/digimon/${id}`);
		const enDescription =
			detail?.descriptions?.find((item) => item.language === "en_us")?.description ?? "";
		const name = detail?.name ?? "";

		const [nameKo, descriptionKo] = await Promise.all([
			translateText(name),
			translateText(enDescription),
		]);

		dictionary[id] = {
			name: nameKo || name,
			description: descriptionKo || enDescription,
		};

		done += 1;
		if (done % 20 === 0) {
			console.log(`진행률 ${done}/${targetIds.length}`);
		}
	}, CONCURRENCY);

	const nameMap = Object.fromEntries(
		Object.entries(dictionary).map(([id, value]) => [id, value.name || ""]),
	);
	const descriptionMap = Object.fromEntries(
		Object.entries(dictionary).map(([id, value]) => [id, value.description || ""]),
	);

	await Promise.all([
		writeFile(namesOutputPath, JSON.stringify(nameMap, null, 2), "utf8"),
		writeFile(descriptionsOutputPath, JSON.stringify(descriptionMap, null, 2), "utf8"),
	]);
	console.log(`완료: ${namesOutputPath}`);
	console.log(`완료: ${descriptionsOutputPath}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
