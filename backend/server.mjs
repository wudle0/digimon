import cors from "cors";
import express from "express";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-admin-key";
const DATA_DIR = resolve("backend/data");
const DATA_PATH = resolve(DATA_DIR, "portal-content.json");
const FALLBACK_PATH = resolve("public/data/portal-content.json");

app.use(
	cors({
		origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
	}),
);
app.use(express.json({ limit: "1mb" }));

const ensureDataFile = async () => {
	await mkdir(DATA_DIR, { recursive: true });

	try {
		await readFile(DATA_PATH, "utf8");
	} catch {
		const fallback = await readFile(FALLBACK_PATH, "utf8");
		await writeFile(DATA_PATH, fallback, "utf8");
	}
};

const readPortalContent = async () => {
	const raw = await readFile(DATA_PATH, "utf8");
	return JSON.parse(raw);
};

const validatePortalContent = (payload) => {
	if (!payload || typeof payload !== "object") {
		return false;
	}
	if (!payload.hero || typeof payload.hero !== "object") {
		return false;
	}
	if (!Array.isArray(payload.latestUpdates)) {
		return false;
	}
	if (!Array.isArray(payload.upcomingEvents)) {
		return false;
	}
	if (!Array.isArray(payload.goodsUpdates)) {
		return false;
	}
	return true;
};

app.get("/api/health", (_req, res) => {
	res.json({ ok: true });
});

app.get("/api/portal-content", async (_req, res) => {
	try {
		const content = await readPortalContent();
		res.json(content);
	} catch (error) {
		res.status(500).json({ message: "포털 데이터를 불러오지 못했습니다." });
	}
});

app.put("/api/portal-content", async (req, res) => {
	const providedKey = req.header("x-admin-key");
	if (!providedKey || providedKey !== ADMIN_KEY) {
		res.status(401).json({ message: "관리자 인증에 실패했습니다." });
		return;
	}

	if (!validatePortalContent(req.body)) {
		res.status(400).json({ message: "포털 데이터 형식이 올바르지 않습니다." });
		return;
	}

	try {
		await writeFile(DATA_PATH, JSON.stringify(req.body, null, 2), "utf8");
		res.json({ message: "저장되었습니다." });
	} catch {
		res.status(500).json({ message: "저장 중 오류가 발생했습니다." });
	}
});

await ensureDataFile();

app.listen(PORT, () => {
	console.log(`Portal API server running on http://localhost:${PORT}`);
});
