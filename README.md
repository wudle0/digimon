# digimon

디지몬 팬 포털 + 관리자 페이지 프로젝트입니다.

## 로컬 실행

```bash
npm install
npm run dev
```

## Render + Cloudflare Pages 배포

### 1) Render에 백엔드 배포

1. Render에서 `New +` -> `Blueprint` 선택
2. 이 저장소 연결 후 `render.yaml` 사용해 배포
3. Render 환경변수 설정
   - `ADMIN_KEY`: 관리자 저장 키
   - `CORS_ORIGIN`: `https://bolero-time.pages.dev`
4. 배포 완료 후 백엔드 URL 확보 (예: `https://digimon-api.onrender.com`)

### 2) Cloudflare Pages에 프론트 API 주소 연결

Cloudflare Pages 프로젝트 환경변수에 아래 추가:

- `VITE_API_BASE_URL` = Render 백엔드 URL
  - 예: `https://digimon-api.onrender.com`

설정 후 프론트 재배포하면, `/api/*` 호출이 Render 백엔드로 전송됩니다.
