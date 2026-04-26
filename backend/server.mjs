import cors from "cors";
import express from "express";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-admin-key";
const DATA_DIR = resolve("backend/data");
const DB_PATH = resolve(DATA_DIR, "portal-content.db");
const PORTAL_ROW_ID = 1;
const ALLOWED_SECTIONS = new Set(["latestUpdates", "upcomingEvents", "goodsUpdates"]);

let db;

app.use(
	cors({
		origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
	}),
);
app.use(express.json({ limit: "1mb" }));

const ensureDb = async () => {
	await mkdir(DATA_DIR, { recursive: true });
	db = await open({
		filename: DB_PATH,
		driver: sqlite3.Database,
	});
	await db.exec(`
		CREATE TABLE IF NOT EXISTS portal_hero (
			id INTEGER PRIMARY KEY,
			eyebrow TEXT NOT NULL,
			title TEXT NOT NULL,
			description TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS portal_posts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			section TEXT NOT NULL,
			order_index INTEGER NOT NULL,
			title TEXT NOT NULL,
			date TEXT NOT NULL,
			summary TEXT,
			image_url TEXT,
			link TEXT,
			is_published INTEGER NOT NULL DEFAULT 1
		);
		CREATE INDEX IF NOT EXISTS idx_portal_posts_section_order
			ON portal_posts(section, order_index);
	`);

	const existingHero = await db.get("SELECT id FROM portal_hero WHERE id = ?", PORTAL_ROW_ID);
	const existingPosts = await db.get("SELECT id FROM portal_posts LIMIT 1");
	if (existingHero || existingPosts) {
		await migrateFromLegacyBlobTable();
	}
};

const migrateFromLegacyBlobTable = async () => {
	const hasLegacyBlobTable = await db.get(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'portal_content'`,
	);
	if (!hasLegacyBlobTable) {
		return;
	}
	const legacyRow = await db.get("SELECT content_json FROM portal_content WHERE id = ?", PORTAL_ROW_ID);
	if (!legacyRow?.content_json) {
		return;
	}
	const heroRow = await db.get("SELECT id FROM portal_hero WHERE id = ?", PORTAL_ROW_ID);
	const postRow = await db.get("SELECT id FROM portal_posts LIMIT 1");
	if (heroRow || postRow) {
		return;
	}
	let payload;
	try {
		payload = JSON.parse(legacyRow.content_json);
	} catch {
		return;
	}
	if (!validatePortalContent(payload)) {
		return;
	}
	await savePortalContent(payload);
};

const readPortalContent = async () => {
	if (!db) {
		throw new Error("DB가 초기화되지 않았습니다.");
	}
	const heroRow = await db.get(
		"SELECT eyebrow, title, description FROM portal_hero WHERE id = ?",
		PORTAL_ROW_ID,
	);
	const postRows = await db.all(
		`SELECT section, title, date, summary, image_url, link, is_published
		 FROM portal_posts
		 ORDER BY section ASC, order_index ASC`,
	);
	const grouped = {
		latestUpdates: [],
		upcomingEvents: [],
		goodsUpdates: [],
	};
	for (const row of postRows) {
		if (!ALLOWED_SECTIONS.has(row.section)) {
			continue;
		}
		grouped[row.section].push({
			title: row.title,
			date: row.date,
			summary: row.summary || "",
			imageUrl: row.image_url || "",
			link: row.link || "",
			isPublished: Boolean(row.is_published),
		});
	}
	return {
		hero: {
			eyebrow: heroRow?.eyebrow || "",
			title: heroRow?.title || "",
			description: heroRow?.description || "",
		},
		latestUpdates: grouped.latestUpdates,
		upcomingEvents: grouped.upcomingEvents,
		goodsUpdates: grouped.goodsUpdates,
	};
};

const savePortalContent = async (payload) => {
	if (!db) {
		throw new Error("DB가 초기화되지 않았습니다.");
	}
	const now = new Date().toISOString();
	await db.exec("BEGIN");
	try {
		await db.run(
			`INSERT INTO portal_hero (id, eyebrow, title, description, updated_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
			   eyebrow = excluded.eyebrow,
			   title = excluded.title,
			   description = excluded.description,
			   updated_at = excluded.updated_at`,
			PORTAL_ROW_ID,
			payload.hero.eyebrow,
			payload.hero.title,
			payload.hero.description,
			now,
		);
		await db.run("DELETE FROM portal_posts");
		const insertPostSql = `INSERT INTO portal_posts
			(section, order_index, title, date, summary, image_url, link, is_published)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
		const sections = [
			["latestUpdates", payload.latestUpdates],
			["upcomingEvents", payload.upcomingEvents],
			["goodsUpdates", payload.goodsUpdates],
		];
		for (const [section, items] of sections) {
			for (let i = 0; i < items.length; i += 1) {
				const item = items[i];
				await db.run(
					insertPostSql,
					section,
					i,
					item.title,
					item.date,
					item.summary || "",
					item.imageUrl || "",
					item.link || "",
					item.isPublished === false ? 0 : 1,
				);
			}
		}
		await db.exec("COMMIT");
	} catch (error) {
		await db.exec("ROLLBACK");
		throw error;
	}
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

const validateHeroPayload = (payload) =>
	payload &&
	typeof payload === "object" &&
	typeof payload.eyebrow === "string" &&
	typeof payload.title === "string" &&
	typeof payload.description === "string";

const normalizePostPayload = (payload) => {
	if (!payload || typeof payload !== "object") {
		return null;
	}
	if (typeof payload.title !== "string" || typeof payload.date !== "string") {
		return null;
	}
	return {
		title: payload.title,
		date: payload.date,
		summary: typeof payload.summary === "string" ? payload.summary : "",
		imageUrl: typeof payload.imageUrl === "string" ? payload.imageUrl : "",
		link: typeof payload.link === "string" ? payload.link : "",
		isPublished: payload.isPublished !== false,
	};
};

const parseSection = (value) => {
	if (typeof value !== "string" || !ALLOWED_SECTIONS.has(value)) {
		return null;
	}
	return value;
};

const mapPostRow = (row) => ({
	id: row.id,
	section: row.section,
	orderIndex: row.order_index,
	title: row.title,
	date: row.date,
	summary: row.summary || "",
	imageUrl: row.image_url || "",
	link: row.link || "",
	isPublished: Boolean(row.is_published),
});

const requireAdmin = (req, res, next) => {
	const providedKey = req.header("x-admin-key");
	if (!providedKey || providedKey !== ADMIN_KEY) {
		res.status(401).json({ message: "관리자 인증에 실패했습니다." });
		return;
	}
	next();
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

const handlePortalContentSave = async (req, res) => {
	if (!validatePortalContent(req.body)) {
		res.status(400).json({ message: "포털 데이터 형식이 올바르지 않습니다." });
		return;
	}

	try {
		await savePortalContent(req.body);
		res.json({ message: "저장되었습니다." });
	} catch {
		res.status(500).json({ message: "저장 중 오류가 발생했습니다." });
	}
};

app.put("/api/portal-content", requireAdmin, handlePortalContentSave);
app.post("/api/portal-content", requireAdmin, handlePortalContentSave);

app.get("/api/admin/hero", requireAdmin, async (_req, res) => {
	try {
		const hero = await db.get("SELECT eyebrow, title, description, updated_at FROM portal_hero WHERE id = ?", PORTAL_ROW_ID);
		if (!hero) {
			res.status(404).json({ message: "히어로 데이터가 없습니다." });
			return;
		}
		res.json(hero);
	} catch {
		res.status(500).json({ message: "히어로 데이터를 불러오지 못했습니다." });
	}
});

app.put("/api/admin/hero", requireAdmin, async (req, res) => {
	if (!validateHeroPayload(req.body)) {
		res.status(400).json({ message: "히어로 데이터 형식이 올바르지 않습니다." });
		return;
	}
	try {
		await db.run(
			`INSERT INTO portal_hero (id, eyebrow, title, description, updated_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
			   eyebrow = excluded.eyebrow,
			   title = excluded.title,
			   description = excluded.description,
			   updated_at = excluded.updated_at`,
			PORTAL_ROW_ID,
			req.body.eyebrow,
			req.body.title,
			req.body.description,
			new Date().toISOString(),
		);
		res.json({ message: "히어로가 저장되었습니다." });
	} catch {
		res.status(500).json({ message: "히어로 저장 중 오류가 발생했습니다." });
	}
});

app.get("/api/admin/posts", requireAdmin, async (req, res) => {
	const section = parseSection(req.query.section);
	if (!section) {
		res.status(400).json({ message: "유효한 section이 필요합니다." });
		return;
	}
	try {
		const rows = await db.all(
			`SELECT id, section, order_index, title, date, summary, image_url, link, is_published
			 FROM portal_posts
			 WHERE section = ?
			 ORDER BY order_index ASC`,
			section,
		);
		res.json(rows.map(mapPostRow));
	} catch {
		res.status(500).json({ message: "게시글 목록을 불러오지 못했습니다." });
	}
});

app.post("/api/admin/posts", requireAdmin, async (req, res) => {
	const section = parseSection(req.query.section);
	if (!section) {
		res.status(400).json({ message: "유효한 section이 필요합니다." });
		return;
	}
	const post = normalizePostPayload(req.body);
	if (!post) {
		res.status(400).json({ message: "게시글 데이터 형식이 올바르지 않습니다." });
		return;
	}
	try {
		const maxRow = await db.get("SELECT COALESCE(MAX(order_index), -1) AS max_order FROM portal_posts WHERE section = ?", section);
		const nextOrder = Number(maxRow?.max_order ?? -1) + 1;
		const result = await db.run(
			`INSERT INTO portal_posts (section, order_index, title, date, summary, image_url, link, is_published)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			section,
			nextOrder,
			post.title,
			post.date,
			post.summary,
			post.imageUrl,
			post.link,
			post.isPublished ? 1 : 0,
		);
		const created = await db.get(
			`SELECT id, section, order_index, title, date, summary, image_url, link, is_published
			 FROM portal_posts WHERE id = ?`,
			result.lastID,
		);
		res.status(201).json(mapPostRow(created));
	} catch {
		res.status(500).json({ message: "게시글 생성 중 오류가 발생했습니다." });
	}
});

app.put("/api/admin/posts/:id", requireAdmin, async (req, res) => {
	const postId = Number(req.params.id);
	if (!Number.isInteger(postId) || postId <= 0) {
		res.status(400).json({ message: "유효한 게시글 id가 필요합니다." });
		return;
	}
	const post = normalizePostPayload(req.body);
	if (!post) {
		res.status(400).json({ message: "게시글 데이터 형식이 올바르지 않습니다." });
		return;
	}
	try {
		const existing = await db.get("SELECT id FROM portal_posts WHERE id = ?", postId);
		if (!existing) {
			res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
			return;
		}
		await db.run(
			`UPDATE portal_posts
			 SET title = ?, date = ?, summary = ?, image_url = ?, link = ?, is_published = ?
			 WHERE id = ?`,
			post.title,
			post.date,
			post.summary,
			post.imageUrl,
			post.link,
			post.isPublished ? 1 : 0,
			postId,
		);
		const updated = await db.get(
			`SELECT id, section, order_index, title, date, summary, image_url, link, is_published
			 FROM portal_posts WHERE id = ?`,
			postId,
		);
		res.json(mapPostRow(updated));
	} catch {
		res.status(500).json({ message: "게시글 수정 중 오류가 발생했습니다." });
	}
});

app.delete("/api/admin/posts/:id", requireAdmin, async (req, res) => {
	const postId = Number(req.params.id);
	if (!Number.isInteger(postId) || postId <= 0) {
		res.status(400).json({ message: "유효한 게시글 id가 필요합니다." });
		return;
	}
	try {
		const target = await db.get("SELECT section, order_index FROM portal_posts WHERE id = ?", postId);
		if (!target) {
			res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
			return;
		}
		await db.exec("BEGIN");
		try {
			await db.run("DELETE FROM portal_posts WHERE id = ?", postId);
			await db.run(
				`UPDATE portal_posts
				 SET order_index = order_index - 1
				 WHERE section = ? AND order_index > ?`,
				target.section,
				target.order_index,
			);
			await db.exec("COMMIT");
		} catch (error) {
			await db.exec("ROLLBACK");
			throw error;
		}
		res.json({ message: "게시글이 삭제되었습니다." });
	} catch {
		res.status(500).json({ message: "게시글 삭제 중 오류가 발생했습니다." });
	}
});

app.put("/api/admin/posts/reorder", requireAdmin, async (req, res) => {
	const section = parseSection(req.body?.section);
	const orderedIds = req.body?.orderedIds;
	if (!section || !Array.isArray(orderedIds) || orderedIds.some((id) => !Number.isInteger(id) || id <= 0)) {
		res.status(400).json({ message: "section과 orderedIds 형식이 올바르지 않습니다." });
		return;
	}
	try {
		const rows = await db.all("SELECT id FROM portal_posts WHERE section = ? ORDER BY order_index ASC", section);
		const currentIds = rows.map((row) => row.id);
		if (currentIds.length !== orderedIds.length) {
			res.status(400).json({ message: "orderedIds 길이가 일치하지 않습니다." });
			return;
		}
		const currentSet = new Set(currentIds);
		for (const id of orderedIds) {
			if (!currentSet.has(id)) {
				res.status(400).json({ message: "orderedIds에 유효하지 않은 id가 포함되어 있습니다." });
				return;
			}
		}
		await db.exec("BEGIN");
		try {
			for (let i = 0; i < orderedIds.length; i += 1) {
				await db.run("UPDATE portal_posts SET order_index = ? WHERE id = ?", i, orderedIds[i]);
			}
			await db.exec("COMMIT");
		} catch (error) {
			await db.exec("ROLLBACK");
			throw error;
		}
		const updatedRows = await db.all(
			`SELECT id, section, order_index, title, date, summary, image_url, link, is_published
			 FROM portal_posts
			 WHERE section = ?
			 ORDER BY order_index ASC`,
			section,
		);
		res.json(updatedRows.map(mapPostRow));
	} catch {
		res.status(500).json({ message: "게시글 정렬 중 오류가 발생했습니다." });
	}
});

await ensureDb();

app.listen(PORT, () => {
	console.log(`Portal API server running on http://localhost:${PORT}`);
});
