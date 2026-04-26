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
type PortalNavItem = { id: string; label: string };
type PortalListItem = { title: string; date: string };
type FanContentItem = { title: string; description: string };
type PortalContent = {
	hero: { eyebrow: string; title: string; description: string };
	sections: PortalNavItem[];
	latestUpdates: PortalListItem[];
	upcomingEvents: PortalListItem[];
	fanContents: FanContentItem[];
};
type AdminTab = "hero" | "sections" | "updates" | "events" | "contents";

const quickKeywords = ["agumon", "gabumon", "patamon", "tailmon", "guilmon"];
const ADMIN_ID = "admin";
const ADMIN_PASSWORD = "dkrnahs9581";
const ADMIN_SAVED_ID_KEY = "digimon-admin-saved-id";
const defaultPortalContent: PortalContent = {
	hero: {
		eyebrow: "디지몬 소식, 도감, 팬 콘텐츠를 한곳에서",
		title: "한국어 기반 디지몬 통합 허브",
		description:
			"이 페이지는 도감만이 아니라, 최신 소식/일정/팬 콘텐츠까지 모아서 보는 종합 팬페이지입니다. 도감은 아래의 한 섹션으로 배치되어 있어요.",
	},
	sections: [
		{ id: "home", label: "홈" },
		{ id: "updates", label: "최신 소식" },
		{ id: "schedule", label: "일정" },
		{ id: "encyclopedia", label: "도감" },
		{ id: "contents", label: "팬 콘텐츠" },
	],
	latestUpdates: [
		{ title: "디지몬 신작 애니메이션 트레일러 공개", date: "2026.04.26" },
		{ title: "디지몬 카드게임 신규 스타터 덱 발표", date: "2026.04.24" },
		{ title: "디지몬 게임 업데이트 로드맵 공개", date: "2026.04.20" },
	],
	upcomingEvents: [
		{ title: "팬아트 챌린지 #1", date: "2026.05.01" },
		{ title: "디지몬 명장면 같이 보기 스트리밍", date: "2026.05.03 21:00" },
		{ title: "주간 디지몬 카드 입문 라이브", date: "2026.05.05 20:00" },
	],
	fanContents: [
		{ title: "디지몬 입문 가이드", description: "시리즈, 게임, 카드까지 빠르게 정리한 초심자용 가이드" },
		{ title: "인기 진화 루트 모음", description: "많이 찾는 진화 트리와 추천 포인트 정리" },
		{ title: "팬아트/코스프레 갤러리", description: "커뮤니티에서 공유하는 창작물 아카이브" },
	],
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

const getPortalContent = async (): Promise<PortalContent> => {
	try {
		const apiResponse = await fetch("/api/portal-content");
		if (apiResponse.ok) {
			return (await apiResponse.json()) as PortalContent;
		}
	} catch {
		// backend unavailable; fallback static file
	}
	const staticResponse = await fetch("/data/portal-content.json");
	if (!staticResponse.ok) {
		throw new Error("포털 데이터를 불러오지 못했습니다.");
	}
	return (await staticResponse.json()) as PortalContent;
};

const translateLabel = (value: string | undefined, dictionary: Record<string, string>) =>
	value ? dictionary[value] || value : "-";
const translateDigimonName = (nameMap: DigimonKoNamesMap, id: number | undefined, value: string | undefined) =>
	!value ? "-" : !id ? value : nameMap[String(id)] || value;

function App() {
	const isAdminPage = window.location.pathname.startsWith("/admin");
	const [adminLoginId, setAdminLoginId] = useState("");
	const [adminLoginPassword, setAdminLoginPassword] = useState("");
	const [adminRememberId, setAdminRememberId] = useState(false);
	const [adminAuthenticated, setAdminAuthenticated] = useState(false);
	const [adminAuthError, setAdminAuthError] = useState("");
	const [adminStatus, setAdminStatus] = useState("");
	const [adminTab, setAdminTab] = useState<AdminTab>("hero");
	const [adminDraft, setAdminDraft] = useState<PortalContent>(defaultPortalContent);

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

	const moveToSection = (sectionId: string) => {
		const target = document.getElementById(sectionId);
		target?.scrollIntoView({ behavior: "smooth", block: "start" });
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
	const updateSection = (index: number, field: keyof PortalNavItem, value: string) => {
		setAdminDraft((prev) => ({
			...prev,
			sections: prev.sections.map((section, idx) =>
				idx === index ? { ...section, [field]: value } : section,
			),
		}));
	};
	const updateListItem = (
		key: "latestUpdates" | "upcomingEvents",
		index: number,
		field: keyof PortalListItem,
		value: string,
	) => {
		setAdminDraft((prev) => ({
			...prev,
			[key]: prev[key].map((item, idx) => (idx === index ? { ...item, [field]: value } : item)),
		}));
	};
	const updateFanContent = (index: number, field: keyof FanContentItem, value: string) => {
		setAdminDraft((prev) => ({
			...prev,
			fanContents: prev.fanContents.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)),
		}));
	};
	const addSection = () => {
		setAdminDraft((prev) => ({
			...prev,
			sections: [...prev.sections, { id: `section-${Date.now()}`, label: "새 섹션" }],
		}));
	};
	const removeSection = (index: number) => {
		setAdminDraft((prev) => ({
			...prev,
			sections: prev.sections.filter((_, idx) => idx !== index),
		}));
	};
	const addListItem = (key: "latestUpdates" | "upcomingEvents") => {
		setAdminDraft((prev) => ({
			...prev,
			[key]: [...prev[key], { title: "새 항목", date: "2026.01.01" }],
		}));
	};
	const removeListItem = (key: "latestUpdates" | "upcomingEvents", index: number) => {
		setAdminDraft((prev) => ({
			...prev,
			[key]: prev[key].filter((_, idx) => idx !== index),
		}));
	};
	const addFanContent = () => {
		setAdminDraft((prev) => ({
			...prev,
			fanContents: [...prev.fanContents, { title: "새 콘텐츠", description: "설명을 입력하세요." }],
		}));
	};
	const removeFanContent = (index: number) => {
		setAdminDraft((prev) => ({
			...prev,
			fanContents: prev.fanContents.filter((_, idx) => idx !== index),
		}));
	};

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
						<button type="button" className={adminTab === "sections" ? "is-active" : ""} onClick={() => setAdminTab("sections")}>섹션 관리</button>
						<button type="button" className={adminTab === "updates" ? "is-active" : ""} onClick={() => setAdminTab("updates")}>최신 소식</button>
						<button type="button" className={adminTab === "events" ? "is-active" : ""} onClick={() => setAdminTab("events")}>일정</button>
						<button type="button" className={adminTab === "contents" ? "is-active" : ""} onClick={() => setAdminTab("contents")}>팬 콘텐츠</button>
					</div>

					{adminTab === "hero" ? (
						<div className="admin-edit-group">
							<label>Eyebrow<input type="text" value={adminDraft.hero.eyebrow} onChange={(event) => updateHeroField("eyebrow", event.target.value)} /></label>
							<label>타이틀<input type="text" value={adminDraft.hero.title} onChange={(event) => updateHeroField("title", event.target.value)} /></label>
							<label>설명<textarea rows={4} value={adminDraft.hero.description} onChange={(event) => updateHeroField("description", event.target.value)} /></label>
						</div>
					) : null}

					{adminTab === "sections" ? (
						<div className="admin-edit-list">
							{adminDraft.sections.map((section, index) => (
								<div key={`${section.id}-${index}`} className="admin-item-card">
									<label>id<input type="text" value={section.id} onChange={(event) => updateSection(index, "id", event.target.value)} /></label>
									<label>라벨<input type="text" value={section.label} onChange={(event) => updateSection(index, "label", event.target.value)} /></label>
									<button type="button" className="danger" onClick={() => removeSection(index)}>삭제</button>
								</div>
							))}
							<button type="button" onClick={addSection}>섹션 추가</button>
						</div>
					) : null}

					{adminTab === "updates" ? (
						<div className="admin-edit-list">
							{adminDraft.latestUpdates.map((item, index) => (
								<div key={`${item.title}-${index}`} className="admin-item-card">
									<label>제목<input type="text" value={item.title} onChange={(event) => updateListItem("latestUpdates", index, "title", event.target.value)} /></label>
									<label>날짜<input type="text" value={item.date} onChange={(event) => updateListItem("latestUpdates", index, "date", event.target.value)} /></label>
									<button type="button" className="danger" onClick={() => removeListItem("latestUpdates", index)}>삭제</button>
								</div>
							))}
							<button type="button" onClick={() => addListItem("latestUpdates")}>소식 추가</button>
						</div>
					) : null}

					{adminTab === "events" ? (
						<div className="admin-edit-list">
							{adminDraft.upcomingEvents.map((item, index) => (
								<div key={`${item.title}-${index}`} className="admin-item-card">
									<label>제목<input type="text" value={item.title} onChange={(event) => updateListItem("upcomingEvents", index, "title", event.target.value)} /></label>
									<label>날짜<input type="text" value={item.date} onChange={(event) => updateListItem("upcomingEvents", index, "date", event.target.value)} /></label>
									<button type="button" className="danger" onClick={() => removeListItem("upcomingEvents", index)}>삭제</button>
								</div>
							))}
							<button type="button" onClick={() => addListItem("upcomingEvents")}>일정 추가</button>
						</div>
					) : null}

					{adminTab === "contents" ? (
						<div className="admin-edit-list">
							{adminDraft.fanContents.map((item, index) => (
								<div key={`${item.title}-${index}`} className="admin-item-card">
									<label>제목<input type="text" value={item.title} onChange={(event) => updateFanContent(index, "title", event.target.value)} /></label>
									<label>설명<textarea rows={3} value={item.description} onChange={(event) => updateFanContent(index, "description", event.target.value)} /></label>
									<button type="button" className="danger" onClick={() => removeFanContent(index)}>삭제</button>
								</div>
							))}
							<button type="button" onClick={addFanContent}>콘텐츠 추가</button>
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
			</div>
		);
	}

	return (
		<div className="encyclopedia-page">
			<header className="global-header">
				<div className="global-header__title">
					<p>DIGIMON FAN PORTAL</p>
					<h1>디지몬 종합 팬페이지</h1>
				</div>
				<nav aria-label="페이지 섹션 이동">
					<ul>
						{portalContent.sections.map((section) => (
							<li key={section.id}>
								<button type="button" onClick={() => moveToSection(section.id)}>
									{section.label}
								</button>
							</li>
						))}
					</ul>
				</nav>
			</header>

			<section className="portal-hero" id="home">
				<p className="portal-hero__eyebrow">{portalContent.hero.eyebrow}</p>
				<h2>{portalContent.hero.title}</h2>
				<p>{portalContent.hero.description}</p>
				<div className="portal-hero__actions">
					<button type="button" onClick={() => moveToSection("encyclopedia")}>
						도감 바로가기
					</button>
					<button type="button" onClick={() => moveToSection("updates")}>
						최신 소식 보기
					</button>
				</div>
			</section>

			<section className="portal-section-grid" id="updates">
				<article className="portal-card">
					<h3>최신 소식</h3>
					<ul>
						{portalContent.latestUpdates.map((item) => (
							<li key={`${item.title}-${item.date}`}>
								<p>{item.title}</p>
								<span>{item.date}</span>
							</li>
						))}
					</ul>
				</article>
				<article className="portal-card" id="schedule">
					<h3>일정</h3>
					<ul>
						{portalContent.upcomingEvents.map((item) => (
							<li key={`${item.title}-${item.date}`}>
								<p>{item.title}</p>
								<span>{item.date}</span>
							</li>
						))}
					</ul>
				</article>
			</section>

			<section className="portal-card fan-content-card" id="contents">
				<h3>팬 콘텐츠</h3>
				<div className="fan-content-grid">
					{portalContent.fanContents.map((item) => (
						<div key={item.title}>
							<h4>{item.title}</h4>
							<p>{item.description}</p>
						</div>
					))}
				</div>
			</section>

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
		</div>
	);
}

export default App;
