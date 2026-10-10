# 안 돼! 사서님!

도서관 방탈출 「고양이가 된 사서」의 마지막 장면. 첨부 ZIP의 실제 PNG·좌표 JSON·playable 예제를 기반으로 완성한 정적 웹게임입니다. 기존 프로젝트가 없어 독립 실행형으로 구성했습니다.

## 컷인·8프레임 달리기 업데이트

- tracking에서만 새 달리기 시트를 사용합니다. 580ms 주기, 프레임별 content_rect와 clip_polygon_in_content, 공통 배율 250/411, 발 앵커·이마 좌표를 유지합니다. 느린 방향 전환의 기준은 scene-config.js의 facingVelocityThreshold입니다. 나머지 자세는 기존 librarian-actions 에셋을 유지합니다.
- 실제 forehead-bump 이벤트를 받은 직후의 humanHead에서 투명 컷인을 한 번 시작합니다. 170/130/260ms 확대·안정·퇴장, 최대 12% 배경 어둡게 처리합니다. 타이밍과 크기는 assets/forehead-bump-cutin.json에서 조절합니다. Canvas 밖으로 클리핑하며 HUD를 덮지 않습니다. 쿵!은 컷인에서만 그립니다.
- impact-cutin.js가 70ms만 engine 진행 시간을 제외하고 컷인은 계속 진행합니다. 수동·탭 일시정지는 두 시간을 함께 멈추고 재시작은 효과 상태를 초기화합니다. 동작 줄이기 설정에서는 확대와 타격 정지 없이 280ms로 보여 줍니다.
- 현재 저장소 테스트 22개와 첨부 ZIP 예제 테스트 4개가 통과했습니다. 실제 이미지 감사에서 8자세 양방향을 렌더링하고 폴리곤이 이웃 자세의 불투명 픽셀 2,434개를 제거하는 것을 확인했습니다. 새 PNG/JSON은 시작 전 모두 로딩합니다.
- 이번 업데이트의 실제 모바일 브라우저 QA는 로컬 서버 연결 timeout 때문에 완료하지 못했습니다. 코드·Canvas 렌더 검증과 기기 검증을 구분합니다. GitHub Pages에는 Commit/Push 후 새 버전이 반영됩니다.

## 실행

- 가장 간단한 방법: 별도 제공한 **안-돼-사서님.html**을 브라우저에서 엽니다. 모든 이미지·좌표·코드가 들어 있어 서버와 네트워크가 필요 없습니다.
- 소스 실행: 이 README가 있는 폴더에서 `python -m http.server 8000` 또는 Windows의 `py -m http.server 8000`을 실행하고 `http://localhost:8000/playable/`을 엽니다.
- 정적 배포: `assets/`와 `playable/`을 이웃한 폴더로 함께 올립니다. 진입점은 `playable/index.html`입니다. 별도 빌드·npm install·CDN·외부 폰트·계정이 필요 없습니다.
- 소스의 index.html은 ES 모듈과 JSON fetch를 사용하므로 더블클릭 실행에는 단일 HTML을 사용하세요.

## 조작과 결말

그림이 준비되면 시작합니다. 3·2·1 후 고양이를 좌우 드래그하거나 ← → 키로 움직입니다. 마지막 단의 빛나는 자리에 들어오면 자동으로 구조합니다. 처음 고양이를 그대로 두면 도움 상태에서 무제한 기다립니다.

두 이마가 한 번 닿을 때 영혼이 복귀합니다. 사서는 앉아서 “앗.. 돌아왔다!”, 고양이는 “야옹~” 하며 오른쪽으로 달아납니다. 이후 확정 만화의 panel_4를 자동 표시합니다. 「엔딩 만화 보기」에서 원본 4컷을 100~300% 확대하고 스크롤할 수 있습니다.

상단 Ⅱ는 일시정지, ↻는 처음부터 재시작입니다. 창을 떠나거나 탭이 숨겨지면 자동 정지하며 돌아온 뒤 「이어서 하기」를 눌러 재개합니다. 「다시 보기」는 새 플레이를 시작합니다.

## 변경 파일

- `playable/app.js`: 만화 확대, 플레이 중 재시작, blur/pagehide 자동 정지, 포인터 해제, 초기화 UI, 완료 신호 연결.
- `playable/index.html`, `style.css`: 확대 창과 재시작 버튼, 화면의 남은 높이에 맞춘 2:3 장면, dvh·안전 영역·가로 화면 대응. 조작 영역은 touch-action:none입니다.
- `playable/engine.js`: 확정 안내·대사 유지. 기존 단일 구조 상태 흐름과 연속 위치 보간을 재사용합니다.
- `playable/renderer.js`: metadata의 panel_4 선택, 접촉 지점의 한 번만 나타나는 작은 빛. 실제 content_rect·발 앵커·이마 좌표와 공통 배율을 그대로 사용합니다.
- `playable/scene-config.js`: 지정된 기본 조절값 유지, 운영 연결용 미정 설정 추가.
- `playable/tests/engine.test.js`, `tests/app.test.js`: 시간·연속성·도움 대기·UI 연결 검증 추가.
- `tools/build-standalone.py`: 첨부 번들러 그대로 재사용합니다.
- `assets/*`: 원본과 동일하며 다시 생성하거나 변경하지 않았습니다.

## 조절과 방탈출 연결

`playable/scene-config.js`의 SCENE과 TIMING에서 경로·크기·이동 범위·구조 반경·연출 시간을 조절합니다. 기준 공간 768×1152, 사람 250, 고양이 85를 유지합니다. 기본 자동 진행은 약 16.9초이며 도움 대기 시간은 별도입니다.

INTEGRATION의 `nextSceneUrl`, `escapeCode`는 null로 남겼습니다. 임의 주소·암호 또는 자동 외부 이동을 넣지 않았습니다.

완료 시 새 플레이마다 정확히 한 번 다음 이벤트를 보냅니다.

```js
document.addEventListener('library:game-complete', ({ detail }) => {
  // detail = { gameId: 'library-ending-rescue', completed: true, assisted: boolean }
  // 운영 시스템의 기존 보상/다음 장면 처리와 연결하세요.
});
```

`window.onGameComplete`가 함수이면 같은 결과로 한 번 호출합니다. 두 방식 중 운영 시스템에 맞는 한 방식을 사용하고 운영 보상 중복 방지는 기존 시스템에서 처리하세요. `window.libraryEndingGame`은 start/pause/resume/reset/getState/integration을 제공합니다.

## 검증과 남은 확인

Node.js가 설치되어 있으면 `playable/`에서 `npm test`를 실행합니다. 외부 패키지 설치 없이 **22개 테스트 통과**했습니다.

- 기본 고양이 미조작 시 도움 정지, 장시간 대기, 다시 이동 후 성공.
- 구조·영혼 복귀·완료의 단일 발생과 다시 보기에서 새 완료 발생.
- 30/60/144Hz에서 약 17초 진행, slip→jump의 위치 연속성.
- pause/resume, 미완료 상태 재시작, 키보드와 Pointer Events 연결, pointercancel 이후 입력 해제.
- 실제 앱 코드의 로딩 실패·재시도·시작 준비 차단, visibilitychange/blur 자동 정지, 만화 확대/닫기, 완료 DOM 이벤트와 기존 콜백 연결. 이 항목은 DOM API 모형을 사용하는 코드 테스트이며 실제 브라우저 테스트는 아닙니다.
- 실제 PNG로 8개 장면을 Canvas 렌더링했습니다. 두 이마 차이 **0픽셀**, 앉기/달아나기 원본 프레임 선택, 앉은 자세 공통 배율 유지, 도움 정지를 검사했습니다. 초기 머리·신발·꼬리 및 접촉 장면을 이미지로 확인했습니다. 투명 PNG와 원본 content_rect를 유지합니다. 결과는 `render-audit.json`에 있습니다.

**실제 브라우저 검증은 수행하지 못했습니다.** 이 환경에서 로컬 HTTP 연결이 timeout으로 실패했고 브라우저 정책이 file URL을 허용하지 않았습니다. 실제 휴대폰에서 손가락 드래그·주소창 높이 변화·화면 회전·안전 영역·글자 선명도·만화 확대 스크롤을 확인해야 합니다. CSS 대응과 입력 코드 검증은 구현되어 있지만 기기 검증을 대체하지 않습니다.

추가 렌더 감사는 `@napi-rs/canvas`가 있는 환경에서 `node playable/tests/render-audit.mjs <출력폴더>`로 실행합니다. 런타임 의존성이 없는 기본 npm test와 별개입니다.

## 단일 HTML 재생성

소스를 조절한 뒤 프로젝트 루트에서 다음을 실행하세요.

```text
python tools/build-standalone.py ../안-돼-사서님.html
```
