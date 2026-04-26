import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.scss";

type NamedValue = { id: number; level?: string; type?: string; attribute?: string };
type ImageValue = { href: string; transparent: boolean };
type DescriptionValue = { language: string; description: string };
type EvolutionValue = { id: number; digimon: string; condition: string; image: string };
type Digimon = {
	id: number;
	name: string;
	xAntibody: boolean;
	images: ImageValue[];
	levels: NamedValue[];
	types: NamedValue[];
	attributes: NamedValue[];
	releaseDate?: string;
	descriptions?: DescriptionValue[];
	priorEvolutions?: EvolutionValue[];
	nextEvolutions?: EvolutionValue[];
};
type DigimonKoNamesMap = Record<string, string>;
type DigimonKoDescriptionsMap = Record<string, string>;
type PortalListItem = {
	title: string;
	date: string;
	summary?: string;
	imageUrl?: string;
	link?: string;
	isPublished?: boolean;
};
type PortalContent = {
	hero: { eyebrow: string; title: string; description: string };
	latestUpdates: PortalListItem[];
	upcomingEvents: PortalListItem[];
	goodsUpdates: PortalListItem[];
};
type AdminTab = "hero" | "updates" | "events" | "goods";
type AdminListKind = "latestUpdates" | "upcomingEvents" | "goodsUpdates";
type DeleteTarget = { list: AdminListKind; index: number } | null;
type DragTarget = { list: AdminListKind; index: number } | null;
type ListPageKind = "updates" | "schedule" | "goods";

const quickKeywords = ["agumon", "gabumon", "patamon", "tailmon", "guilmon"];
const fixedSections = [
	{ id: "home", label: "홈" },
	{ id: "updates", label: "최신 소식" },
	{ id: "schedule", label: "일정" },
	{ id: "goods", label: "굿즈 소식" },
	{ id: "encyclopedia", label: "도감" },
];
const ADMIN_ID = "admin";
const ADMIN_PASSWORD = "dkrnahs9581";
const ADMIN_SAVED_ID_KEY = "digimon-admin-saved-id";
const defaultPortalContent: PortalContent = {
	hero: {
		eyebrow: "",
		title: "",
		description: "",
	},
	latestUpdates: [],
	upcomingEvents: [],
	goodsUpdates: [],
};

const LEVEL_KO_MAP: Record<string, string> = {
	Baby: "유년기",
	"In-Training": "성장기 이전",
	Child: "성장기",
	Adult: "성숙기",
	Perfect: "완전체",
	Ultimate: "궁극체",
	Armor: "아머체",
	Hybrid: "하이브리드체",
};
const TYPE_KO_MAP: Record<string, string> = {
	Reptile: "파충류형",
	Beast: "짐승형",
	Bird: "조류형",
	Dinosaur: "공룡형",
	Dragon: "드래곤형",
	Aquatic: "수생형",
	Machine: "기계형",
	Cyborg: "사이보그형",
	Holy: "성스러운형",
	Angel: "천사형",
	Devil: "악마형",
	Undead: "언데드형",
	Demon: "마인형",
	Insect: "곤충형",
	Plant: "식물형",
	Mineral: "광물형",
	Beastkin: "수인형",
	Puppet: "퍼펫형",
	Mutant: "변이형",
};
const ATTRIBUTE_KO_MAP: Record<string, string> = {
	Vaccine: "백신",
	Data: "데이터",
	Virus: "바이러스",
	Free: "프리",
	Variable: "가변",
	Unknown: "불명",
	"No Data": "데이터 없음",
};

const normalizeKeyword = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "");
const createRowId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createRowIds = (length: number) => Array.from({ length }, () => createRowId());
const reorderItems = <T,>(items: T[], from: number, to: number): T[] => {
	if (from === to) {
		return items;
	}
	const copied = [...items];
	const [moved] = copied.splice(from, 1);
	copied.splice(to, 0, moved);
	return copied;
};

const getPortalContent = async (): Promise<PortalContent> => {
	const apiResponse = await fetch("/api/portal-content");
	if (!apiResponse.ok) {
		throw new Error("포털 데이터를 불러오지 못했습니다.");
	}
	return (await apiResponse.json()) as PortalContent;
};

const translateLabel = (value: string | undefined, dictionary: Record<string, string>) =>
	value ? dictionary[value] || value : "-";
const translateDigimonName = (nameMap: DigimonKoNamesMap, id: number | undefined, value: string | undefined) =>
	!value ? "-" : !id ? value : nameMap[String(id)] || value;
const EmptyPosts = () => <p className="empty-posts">등록된 게시글이 없습니다.</p>;

function App() {
	const isAdminPage = window.location.pathname.startsWith("/admin");
	const [currentPath, setCurrentPath] = useState(window.location.pathname);
	const [adminLoginId, setAdminLoginId] = useState("");
	const [adminLoginPassword, setAdminLoginPassword] = useState("");
	const [adminRememberId, setAdminRememberId] = useState(false);
	const [adminAuthenticated, setAdminAuthenticated] = useState(false);
	const [adminAuthError, setAdminAuthError] = useState("");
	const [adminStatus, setAdminStatus] = useState("");
	const [adminTab, setAdminTab] = useState<AdminTab>("hero");
	const [adminDraft, setAdminDraft] = useState<PortalContent>(defaultPortalContent);
	const [updateRowIds, setUpdateRowIds] = useState<string[]>(
		createRowIds(defaultPortalContent.latestUpdates.length),
	);
	const [eventRowIds, setEventRowIds] = useState<string[]>(
		createRowIds(defaultPortalContent.upcomingEvents.length),
	);
	const [goodsRowIds, setGoodsRowIds] = useState<string[]>(
		createRowIds(defaultPortalContent.goodsUpdates.length),
	);
	const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
	const [dragTarget, setDragTarget] = useState<DragTarget>(null);

	const [keyword, setKeyword] = useState("agumon");
	const [digimon, setDigimon] = useState<Digimon | null>(null);
	const [koNamesMap, setKoNamesMap] = useState<DigimonKoNamesMap>({});
	const [koDescriptionMap, setKoDescriptionMap] = useState<DigimonKoDescriptionsMap>({});
	const [portalContent, setPortalContent] = useState<PortalContent>(defaultPortalContent);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const koNameLookupMap = useMemo(
		() => Object.fromEntries(Object.entries(koNamesMap).map(([id, name]) => [normalizeKeyword(name), id])),
		[koNamesMap],
	);
	const mainImage = digimon?.images?.[0]?.href;
	const enDescription = useMemo(
		() => digimon?.descriptions?.find((item) => item.language === "en_us")?.description,
		[digimon?.descriptions],
	);
	const koreanDescription = useMemo(
		() => digimon?.descriptions?.find((item) => item.language === "ko_kr")?.description,
		[digimon?.descriptions],
	);
	const translatedDescription = useMemo(() => {
		if (koreanDescription) {
			return koreanDescription;
		}
		if (digimon?.id) {
			const dictionaryDescription = koDescriptionMap[String(digimon.id)];
			if (dictionaryDescription) {
				return dictionaryDescription;
			}
		}
		return enDescription || "";
	}, [digimon?.id, enDescription, koDescriptionMap, koreanDescription]);

	const fetchDigimon = async (value: string) => {
		const normalized = normalizeKeyword(value);
		const query = koNameLookupMap[normalized] || normalized;
		if (!query) {
			setError("검색어를 입력해주세요. 예: agumon 또는 1");
			return;
		}
		setLoading(true);
		setError("");
		try {
			const response = await fetch(`https://digi-api.com/api/v1/digimon/${query}`);
			if (!response.ok) {
				throw new Error("해당 디지몬을 찾을 수 없습니다.");
			}
			setDigimon((await response.json()) as Digimon);
		} catch (fetchError) {
			setError(fetchError instanceof Error ? fetchError.message : "요청 중 문제가 발생했습니다.");
			setDigimon(null);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void fetchDigimon("agumon");
	}, []);

	useEffect(() => {
		const run = async () => {
			try {
				const content = await getPortalContent();
				setPortalContent(content);
				setAdminDraft(content);
				setUpdateRowIds(createRowIds(content.latestUpdates.length));
				setEventRowIds(createRowIds(content.upcomingEvents.length));
				setGoodsRowIds(createRowIds(content.goodsUpdates.length));
			} catch {
				// fallback default content
			}
		};
		void run();
	}, []);

	useEffect(() => {
		if (!isAdminPage) {
			return;
		}

		const savedId = window.localStorage.getItem(ADMIN_SAVED_ID_KEY);
		if (savedId) {
			setAdminLoginId(savedId);
			setAdminRememberId(true);
		}
	}, [isAdminPage]);

	useEffect(() => {
		const loadNames = async () => {
			try {
				const response = await fetch("/data/digimon-ko-names.json");
				if (response.ok) {
					setKoNamesMap((await response.json()) as DigimonKoNamesMap);
				}
			} catch {
				// keep fallback
			}
		};
		void loadNames();
	}, []);

	useEffect(() => {
		if (!digimon?.id || koDescriptionMap[String(digimon.id)]) {
			return;
		}
		const loadDescriptions = async () => {
			try {
				const response = await fetch("/data/digimon-ko-descriptions.json");
				if (response.ok) {
					setKoDescriptionMap((await response.json()) as DigimonKoDescriptionsMap);
				}
			} catch {
				// keep fallback
			}
		};
		void loadDescriptions();
	}, [digimon?.id, koDescriptionMap]);

	const navigateTo = (path: string) => {
		if (window.location.pathname === path) {
			return;
		}
		window.history.pushState({}, "", path);
		setCurrentPath(path);
		window.scrollTo({ top: 0, behavior: "smooth" });
	};
	const handleEvolutionClick = (id: number) => {
		setKeyword(String(id));
		void fetchDigimon(String(id));
		window.scrollTo({ top: 0, behavior: "smooth" });
	};
	const handleSearch = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void fetchDigimon(keyword);
	};
	const handleAdminSave = async () => {
		try {
			const response = await fetch("/api/portal-content", {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					"x-admin-key": ADMIN_PASSWORD,
				},
				body: JSON.stringify(adminDraft),
			});
			if (!response.ok) {
				const result = (await response.json().catch(() => ({ message: "저장 실패" }))) as { message?: string };
				throw new Error(result.message || "저장 실패");
			}
			setPortalContent(adminDraft);
			setAdminStatus("저장 완료: 팬페이지에 즉시 반영됩니다.");
		} catch (saveError) {
			setAdminStatus(saveError instanceof Error ? saveError.message : "저장 중 오류가 발생했습니다.");
		}
	};

	const handleAdminLogin = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (adminLoginId === ADMIN_ID && adminLoginPassword === ADMIN_PASSWORD) {
			setAdminAuthenticated(true);
			setAdminAuthError("");
			if (adminRememberId) {
				window.localStorage.setItem(ADMIN_SAVED_ID_KEY, adminLoginId);
			} else {
				window.localStorage.removeItem(ADMIN_SAVED_ID_KEY);
			}
			return;
		}

		setAdminAuthError("아이디 또는 패스워드가 올바르지 않습니다.");
	};

	const updateHeroField = (field: keyof PortalContent["hero"], value: string) => {
		setAdminDraft((prev) => ({ ...prev, hero: { ...prev.hero, [field]: value } }));
	};
	const updateListItem = (
		key: "latestUpdates" | "upcomingEvents" | "goodsUpdates",
		index: number,
		field: keyof PortalListItem,
		value: string | boolean,
	) => {
		setAdminDraft((prev) => ({
			...prev,
			[key]: prev[key].map((item, idx) => (idx === index ? { ...item, [field]: value } : item)),
		}));
	};
	const addListItem = (key: "latestUpdates" | "upcomingEvents" | "goodsUpdates") => {
		setAdminDraft((prev) => ({
			...prev,
			[key]: [
				...prev[key],
				{
					title: "새 항목",
					date: "2026.01.01",
					summary: "요약을 입력하세요.",
					imageUrl: "",
					link: "",
					isPublished: true,
				},
			],
		}));
		if (key === "latestUpdates") {
			setUpdateRowIds((prev) => [...prev, createRowId()]);
			return;
		}
		if (key === "upcomingEvents") {
			setEventRowIds((prev) => [...prev, createRowId()]);
			return;
		}
		setGoodsRowIds((prev) => [...prev, createRowId()]);
	};
	const removeListItem = (key: "latestUpdates" | "upcomingEvents" | "goodsUpdates", index: number) => {
		setAdminDraft((prev) => ({
			...prev,
			[key]: prev[key].filter((_, idx) => idx !== index),
		}));
		if (key === "latestUpdates") {
			setUpdateRowIds((prev) => prev.filter((_, idx) => idx !== index));
			return;
		}
		if (key === "upcomingEvents") {
			setEventRowIds((prev) => prev.filter((_, idx) => idx !== index));
			return;
		}
		setGoodsRowIds((prev) => prev.filter((_, idx) => idx !== index));
	};

	const requestDelete = (list: AdminListKind, index: number) => {
		setDeleteTarget({ list, index });
	};
	const confirmDelete = () => {
		if (!deleteTarget) {
			return;
		}
		if (deleteTarget.list === "latestUpdates") {
			removeListItem("latestUpdates", deleteTarget.index);
		} else if (deleteTarget.list === "upcomingEvents") {
			removeListItem("upcomingEvents", deleteTarget.index);
		} else {
			removeListItem("goodsUpdates", deleteTarget.index);
		}
		setDeleteTarget(null);
	};
	const handleDropReorder = (list: AdminListKind, dropIndex: number) => {
		if (!dragTarget || dragTarget.list !== list) {
			return;
		}
		const from = dragTarget.index;
		const to = dropIndex;

		if (list === "latestUpdates") {
			setAdminDraft((prev) => ({ ...prev, latestUpdates: reorderItems(prev.latestUpdates, from, to) }));
			setUpdateRowIds((prev) => reorderItems(prev, from, to));
		} else if (list === "upcomingEvents") {
			setAdminDraft((prev) => ({ ...prev, upcomingEvents: reorderItems(prev.upcomingEvents, from, to) }));
			setEventRowIds((prev) => reorderItems(prev, from, to));
		} else {
			setAdminDraft((prev) => ({ ...prev, goodsUpdates: reorderItems(prev.goodsUpdates, from, to) }));
			setGoodsRowIds((prev) => reorderItems(prev, from, to));
		}
		setDragTarget(null);
	};
	const moveItemByButtons = (list: AdminListKind, index: number, direction: "up" | "down") => {
		const to = direction === "up" ? index - 1 : index + 1;
		const length =
			list === "latestUpdates"
				? adminDraft.latestUpdates.length
				: list === "upcomingEvents"
					? adminDraft.upcomingEvents.length
					: adminDraft.goodsUpdates.length;
		if (to < 0 || to >= length) {
			return;
		}

		if (list === "latestUpdates") {
			setAdminDraft((prev) => ({ ...prev, latestUpdates: reorderItems(prev.latestUpdates, index, to) }));
			setUpdateRowIds((prev) => reorderItems(prev, index, to));
		} else if (list === "upcomingEvents") {
			setAdminDraft((prev) => ({ ...prev, upcomingEvents: reorderItems(prev.upcomingEvents, index, to) }));
			setEventRowIds((prev) => reorderItems(prev, index, to));
		} else {
			setAdminDraft((prev) => ({ ...prev, goodsUpdates: reorderItems(prev.goodsUpdates, index, to) }));
			setGoodsRowIds((prev) => reorderItems(prev, index, to));
		}
	};
	const getListMeta = (kind: ListPageKind) => {
		const onlyPublished = (items: PortalListItem[]) => items.filter((item) => item.isPublished !== false);
		if (kind === "updates") {
			return { title: "최신 소식", items: onlyPublished(portalContent.latestUpdates) };
		}
		if (kind === "schedule") {
			return { title: "일정", items: onlyPublished(portalContent.upcomingEvents) };
		}
		return { title: "굿즈 소식", items: onlyPublished(portalContent.goodsUpdates) };
	};

	useEffect(() => {
		const handlePopState = () => setCurrentPath(window.location.pathname);
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, []);

	if (isAdminPage) {
		if (!adminAuthenticated) {
			return (
				<div className="encyclopedia-page">
					<section className="portal-card admin-login-panel">
						<h2>Admin 로그인</h2>
						<form onSubmit={handleAdminLogin}>
							<label>
								아이디
								<input
									type="text"
									value={adminLoginId}
									onChange={(event) => setAdminLoginId(event.target.value)}
									autoComplete="username"
								/>
							</label>
							<label>
								패스워드
								<input
									type="password"
									value={adminLoginPassword}
									onChange={(event) => setAdminLoginPassword(event.target.value)}
									autoComplete="current-password"
								/>
							</label>
							<label className="remember-check">
								<input
									type="checkbox"
									checked={adminRememberId}
									onChange={(event) => setAdminRememberId(event.target.checked)}
								/>
								아이디 저장
							</label>
							<button type="submit">로그인</button>
						</form>
						{adminAuthError ? <p className="status-message status-message--error">{adminAuthError}</p> : null}
					</section>
				</div>
			);
		}

		return (
			<div className="encyclopedia-page">
				<section className="portal-card admin-panel">
					<h2>Admin - 포털 콘텐츠 관리</h2>
					<p>섹션별로 항목을 관리한 뒤 저장하면 메인 페이지에 반영됩니다.</p>
					<div className="admin-tabs">
						<button type="button" className={adminTab === "hero" ? "is-active" : ""} onClick={() => setAdminTab("hero")}>히어로</button>
						<button type="button" className={adminTab === "updates" ? "is-active" : ""} onClick={() => setAdminTab("updates")}>최신 소식</button>
						<button type="button" className={adminTab === "events" ? "is-active" : ""} onClick={() => setAdminTab("events")}>일정</button>
						<button type="button" className={adminTab === "goods" ? "is-active" : ""} onClick={() => setAdminTab("goods")}>굿즈 소식</button>
					</div>

					{adminTab === "hero" ? (
						<div className="admin-edit-group">
							<label>Eyebrow<input type="text" value={adminDraft.hero.eyebrow} onChange={(event) => updateHeroField("eyebrow", event.target.value)} /></label>
							<label>타이틀<input type="text" value={adminDraft.hero.title} onChange={(event) => updateHeroField("title", event.target.value)} /></label>
							<label>설명<textarea rows={4} value={adminDraft.hero.description} onChange={(event) => updateHeroField("description", event.target.value)} /></label>
						</div>
					) : null}

					{adminTab === "updates" ? (
						<div className="admin-edit-list">
							{adminDraft.latestUpdates.map((item, index) => (
								<div
									key={updateRowIds[index]}
									className={`admin-item-card ${
										dragTarget?.list === "latestUpdates" && dragTarget.index === index ? "is-dragging" : ""
									}`}
									draggable
									onDragStart={() => setDragTarget({ list: "latestUpdates", index })}
									onDragEnd={() => setDragTarget(null)}
									onDragOver={(event) => event.preventDefault()}
									onDrop={() => handleDropReorder("latestUpdates", index)}>
									<div className="drag-tools">
										<span className="drag-handle">드래그해서 순서 변경</span>
										<div className="order-buttons">
											<button type="button" onClick={() => moveItemByButtons("latestUpdates", index, "up")}>위로</button>
											<button type="button" onClick={() => moveItemByButtons("latestUpdates", index, "down")}>아래로</button>
										</div>
									</div>
									<label>제목<input type="text" value={item.title} onChange={(event) => updateListItem("latestUpdates", index, "title", event.target.value)} /></label>
									<label>날짜<input type="text" value={item.date} onChange={(event) => updateListItem("latestUpdates", index, "date", event.target.value)} /></label>
									<label>요약<textarea rows={2} value={item.summary || ""} onChange={(event) => updateListItem("latestUpdates", index, "summary", event.target.value)} /></label>
									<label>이미지 URL<input type="text" value={item.imageUrl || ""} onChange={(event) => updateListItem("latestUpdates", index, "imageUrl", event.target.value)} /></label>
									<label>링크 URL<input type="text" value={item.link || ""} onChange={(event) => updateListItem("latestUpdates", index, "link", event.target.value)} /></label>
									<label className="admin-checkbox"><input type="checkbox" checked={item.isPublished !== false} onChange={(event) => updateListItem("latestUpdates", index, "isPublished", event.target.checked)} />게시</label>
									<button type="button" className="danger" onClick={() => requestDelete("latestUpdates", index)}>삭제</button>
								</div>
							))}
							<button type="button" onClick={() => addListItem("latestUpdates")}>소식 추가</button>
						</div>
					) : null}

					{adminTab === "events" ? (
						<div className="admin-edit-list">
							{adminDraft.upcomingEvents.map((item, index) => (
								<div
									key={eventRowIds[index]}
									className={`admin-item-card ${
										dragTarget?.list === "upcomingEvents" && dragTarget.index === index ? "is-dragging" : ""
									}`}
									draggable
									onDragStart={() => setDragTarget({ list: "upcomingEvents", index })}
									onDragEnd={() => setDragTarget(null)}
									onDragOver={(event) => event.preventDefault()}
									onDrop={() => handleDropReorder("upcomingEvents", index)}>
									<div className="drag-tools">
										<span className="drag-handle">드래그해서 순서 변경</span>
										<div className="order-buttons">
											<button type="button" onClick={() => moveItemByButtons("upcomingEvents", index, "up")}>위로</button>
											<button type="button" onClick={() => moveItemByButtons("upcomingEvents", index, "down")}>아래로</button>
										</div>
									</div>
									<label>제목<input type="text" value={item.title} onChange={(event) => updateListItem("upcomingEvents", index, "title", event.target.value)} /></label>
									<label>날짜<input type="text" value={item.date} onChange={(event) => updateListItem("upcomingEvents", index, "date", event.target.value)} /></label>
									<label>요약<textarea rows={2} value={item.summary || ""} onChange={(event) => updateListItem("upcomingEvents", index, "summary", event.target.value)} /></label>
									<label>이미지 URL<input type="text" value={item.imageUrl || ""} onChange={(event) => updateListItem("upcomingEvents", index, "imageUrl", event.target.value)} /></label>
									<label>링크 URL<input type="text" value={item.link || ""} onChange={(event) => updateListItem("upcomingEvents", index, "link", event.target.value)} /></label>
									<label className="admin-checkbox"><input type="checkbox" checked={item.isPublished !== false} onChange={(event) => updateListItem("upcomingEvents", index, "isPublished", event.target.checked)} />게시</label>
									<button type="button" className="danger" onClick={() => requestDelete("upcomingEvents", index)}>삭제</button>
								</div>
							))}
							<button type="button" onClick={() => addListItem("upcomingEvents")}>일정 추가</button>
						</div>
					) : null}

					{adminTab === "goods" ? (
						<div className="admin-edit-list">
							{adminDraft.goodsUpdates.map((item, index) => (
								<div
									key={goodsRowIds[index]}
									className={`admin-item-card ${
										dragTarget?.list === "goodsUpdates" && dragTarget.index === index ? "is-dragging" : ""
									}`}
									draggable
									onDragStart={() => setDragTarget({ list: "goodsUpdates", index })}
									onDragEnd={() => setDragTarget(null)}
									onDragOver={(event) => event.preventDefault()}
									onDrop={() => handleDropReorder("goodsUpdates", index)}>
									<div className="drag-tools">
										<span className="drag-handle">드래그해서 순서 변경</span>
										<div className="order-buttons">
											<button type="button" onClick={() => moveItemByButtons("goodsUpdates", index, "up")}>위로</button>
											<button type="button" onClick={() => moveItemByButtons("goodsUpdates", index, "down")}>아래로</button>
										</div>
									</div>
									<label>제목<input type="text" value={item.title} onChange={(event) => updateListItem("goodsUpdates", index, "title", event.target.value)} /></label>
									<label>날짜<input type="text" value={item.date} onChange={(event) => updateListItem("goodsUpdates", index, "date", event.target.value)} /></label>
									<label>요약<textarea rows={2} value={item.summary || ""} onChange={(event) => updateListItem("goodsUpdates", index, "summary", event.target.value)} /></label>
									<label>이미지 URL<input type="text" value={item.imageUrl || ""} onChange={(event) => updateListItem("goodsUpdates", index, "imageUrl", event.target.value)} /></label>
									<label>링크 URL<input type="text" value={item.link || ""} onChange={(event) => updateListItem("goodsUpdates", index, "link", event.target.value)} /></label>
									<label className="admin-checkbox"><input type="checkbox" checked={item.isPublished !== false} onChange={(event) => updateListItem("goodsUpdates", index, "isPublished", event.target.checked)} />게시</label>
									<button type="button" className="danger" onClick={() => requestDelete("goodsUpdates", index)}>삭제</button>
								</div>
							))}
							<button type="button" onClick={() => addListItem("goodsUpdates")}>굿즈 소식 추가</button>
						</div>
					) : null}

					<div className="admin-actions">
						<button type="button" onClick={handleAdminSave}>
							저장
						</button>
						<a href="/">팬페이지로 이동</a>
					</div>
					{adminStatus ? <p className="status-message">{adminStatus}</p> : null}
				</section>
				{deleteTarget ? (
					<div className="delete-modal-backdrop" role="presentation">
						<div className="delete-modal" role="dialog" aria-modal="true" aria-label="삭제 확인">
							<h3>항목을 삭제할까요?</h3>
							<p>삭제한 항목은 저장 후 실제 페이지에 반영됩니다.</p>
							<div className="delete-modal__actions">
								<button type="button" className="ghost" onClick={() => setDeleteTarget(null)}>
									취소
								</button>
								<button type="button" className="danger" onClick={confirmDelete}>
									삭제
								</button>
							</div>
						</div>
					</div>
				) : null}
			</div>
		);
	}

	const isEncyclopediaPage = currentPath === "/encyclopedia";
	const isListPage = currentPath === "/updates" || currentPath === "/schedule" || currentPath === "/goods";
	const listMeta = isListPage ? getListMeta(currentPath as ListPageKind) : null;
	const latestPreviewItems = portalContent.latestUpdates.filter((item) => item.isPublished !== false).slice(0, 3);
	const eventPreviewItems = portalContent.upcomingEvents.filter((item) => item.isPublished !== false).slice(0, 3);
	const goodsPreviewItems = portalContent.goodsUpdates.filter((item) => item.isPublished !== false).slice(0, 3);

	return (
		<div className="encyclopedia-page">
			<header className="global-header">
				<div className="global-header__title">
					<p>DIGIMON FAN PORTAL</p>
					<h1>디지몬 종합 팬페이지</h1>
				</div>
				<nav aria-label="페이지 섹션 이동">
					<ul>
						{fixedSections.map((section) => (
							<li key={section.id}>
								<button
									type="button"
									onClick={() => {
										if (section.id === "home") navigateTo("/");
										else if (section.id === "updates") navigateTo("/updates");
										else if (section.id === "schedule") navigateTo("/schedule");
										else if (section.id === "goods") navigateTo("/goods");
										else navigateTo("/encyclopedia");
									}}>
									{section.label}
								</button>
							</li>
						))}
					</ul>
				</nav>
			</header>

			{isListPage && listMeta ? (
				<section className="list-grid-page">
					<div className="list-grid-page__head">
						<h2>{listMeta.title} 전체보기</h2>
						<button type="button" onClick={() => navigateTo("/")}>
							메인으로
						</button>
					</div>
					<div className="list-grid">
						{listMeta.items.length ? (
							listMeta.items.map((item, index) => (
								<article className="list-grid-card" key={`${item.title}-${item.date}-${index}`}>
									{item.imageUrl ? <img src={item.imageUrl} alt={item.title} loading="lazy" /> : null}
									<h3>{item.title}</h3>
									<p>{item.summary || "요약이 아직 등록되지 않았습니다."}</p>
									<span>{item.date}</span>
									{item.link ? (
										<a href={item.link} target="_blank" rel="noreferrer">
											자세히 보기
										</a>
									) : null}
								</article>
							))
						) : (
							<EmptyPosts />
						)}
					</div>
				</section>
			) : null}

			{isEncyclopediaPage ? (
				<>
					<section id="encyclopedia">
						<header className="top-header">
							<p className="top-header__eyebrow">DIGIMON ENCYCLOPEDIA</p>
							<h2>디지몬 도감</h2>
							<p>Digi API를 기반으로 이름/ID/한글명으로 검색할 수 있어요.</p>
						</header>
						<section className="search-panel">
							<form className="search-form" onSubmit={handleSearch}>
								<input
									type="text"
									value={keyword}
									onChange={(event) => setKeyword(event.target.value)}
									placeholder="예: agumon, 1, 아구몬"
									aria-label="디지몬 이름 또는 ID"
								/>
								<button type="submit" disabled={loading}>
									{loading ? "검색 중..." : "검색"}
								</button>
							</form>
							<div className="quick-buttons">
								{quickKeywords.map((item) => (
									<button
										type="button"
										key={item}
										onClick={() => {
											setKeyword(item);
											void fetchDigimon(item);
										}}>
										{item}
									</button>
								))}
							</div>
						</section>
						{error ? <p className="status-message status-message--error">{error}</p> : null}
						{loading ? <p className="status-message">데이터를 불러오는 중입니다...</p> : null}
					</section>

					{digimon ? (
						<main className="detail-grid">
							<article className="card card--profile">
								<div className="card__head">
									<h2>
										#{digimon.id} {translateDigimonName(koNamesMap, digimon.id, digimon.name)}
									</h2>
									{digimon.xAntibody ? <span className="badge">X-Antibody</span> : null}
								</div>
								<div className="profile-body">
									{mainImage ? <img src={mainImage} alt={digimon.name} /> : null}
									<div>
										<ul className="meta-list">
											<li>
												<strong>레벨</strong>
												<span>{digimon.levels.map((item) => translateLabel(item.level, LEVEL_KO_MAP)).join(", ") || "-"}</span>
											</li>
											<li>
												<strong>타입</strong>
												<span>{digimon.types.map((item) => translateLabel(item.type, TYPE_KO_MAP)).join(", ") || "-"}</span>
											</li>
											<li>
												<strong>속성</strong>
												<span>{digimon.attributes.map((item) => translateLabel(item.attribute, ATTRIBUTE_KO_MAP)).join(", ") || "-"}</span>
											</li>
											<li>
												<strong>첫 등장</strong>
												<span>{digimon.releaseDate || "-"}</span>
											</li>
										</ul>
									</div>
								</div>
							</article>
							<article className="card">
								<h3>설명</h3>
								<p>{translatedDescription || "설명 데이터가 없습니다."}</p>
							</article>
							<article className="card">
								<h3>이전 진화</h3>
								<ul className="evolution-list">
									{digimon.priorEvolutions?.length ? (
										digimon.priorEvolutions.slice(0, 8).map((item) => (
											<li key={`${item.id}-${item.digimon}`}>
												<img src={item.image} alt={translateDigimonName(koNamesMap, item.id, item.digimon)} loading="lazy" />
												<div>
													<button type="button" onClick={() => handleEvolutionClick(item.id)}>
														{translateDigimonName(koNamesMap, item.id, item.digimon)}
													</button>
												</div>
											</li>
										))
									) : (
										<li className="evolution-list__empty">이전 진화 정보가 없습니다.</li>
									)}
								</ul>
							</article>
							<article className="card">
								<h3>다음 진화</h3>
								<ul className="evolution-list">
									{digimon.nextEvolutions?.length ? (
										digimon.nextEvolutions.slice(0, 8).map((item) => (
											<li key={`${item.id}-${item.digimon}`}>
												<img src={item.image} alt={translateDigimonName(koNamesMap, item.id, item.digimon)} loading="lazy" />
												<div>
													<button type="button" onClick={() => handleEvolutionClick(item.id)}>
														{translateDigimonName(koNamesMap, item.id, item.digimon)}
													</button>
												</div>
											</li>
										))
									) : (
										<li className="evolution-list__empty">다음 진화 정보가 없습니다.</li>
									)}
								</ul>
							</article>
						</main>
					) : null}
				</>
			) : null}

			{!isListPage && !isEncyclopediaPage ? (
				<>
					<section className="portal-hero" id="home">
						{portalContent.hero.eyebrow || portalContent.hero.title || portalContent.hero.description ? (
							<>
								<p className="portal-hero__eyebrow">{portalContent.hero.eyebrow}</p>
								<h2>{portalContent.hero.title}</h2>
								<p>{portalContent.hero.description}</p>
							</>
						) : (
							<EmptyPosts />
						)}
						<div className="portal-hero__actions">
							<button type="button" onClick={() => navigateTo("/encyclopedia")}>
								디지몬 도감으로 가기
							</button>
							<button type="button" onClick={() => navigateTo("/updates")}>
								최신 소식 보기
							</button>
						</div>
					</section>

					<section className="portal-section-grid">
						<article className="portal-card">
							<div className="portal-card__head">
								<h3>최신 소식</h3>
								<button type="button" onClick={() => navigateTo("/updates")}>전체보기</button>
							</div>
							{latestPreviewItems.length ? (
								<ul>
									{latestPreviewItems.map((item, index) => (
										<li key={`${item.title}-${item.date}-${index}`}>
											<p>{item.title}</p>
											<span>{item.date}</span>
										</li>
									))}
								</ul>
							) : (
								<EmptyPosts />
							)}
						</article>
						<article className="portal-card">
							<div className="portal-card__head">
								<h3>일정</h3>
								<button type="button" onClick={() => navigateTo("/schedule")}>전체보기</button>
							</div>
							{eventPreviewItems.length ? (
								<ul>
									{eventPreviewItems.map((item, index) => (
										<li key={`${item.title}-${item.date}-${index}`}>
											<p>{item.title}</p>
											<span>{item.date}</span>
										</li>
									))}
								</ul>
							) : (
								<EmptyPosts />
							)}
						</article>
					</section>

					<section className="portal-card fan-content-card">
						<div className="portal-card__head">
							<h3>굿즈 소식</h3>
							<button type="button" onClick={() => navigateTo("/goods")}>전체보기</button>
						</div>
						{goodsPreviewItems.length ? (
							<div className="fan-content-grid">
								{goodsPreviewItems.map((item, index) => (
									<div key={`${item.title}-${item.date}-${index}`}>
										<h4>{item.title}</h4>
										<p>{item.date}</p>
									</div>
								))}
							</div>
						) : (
							<EmptyPosts />
						)}
					</section>
				</>
			) : null}
		</div>
	);
}

export default App;
