# 핀하이 정모 방뽑기

GitHub Pages용 모바일 최적화 방배정 웹앱입니다.

## 이번 수정
- 참석자 등록은 GitHub 응답을 기다리지 않고 즉시 화면에 반영됩니다.
- 신규 참가자 이름은 로컬 대기열에 보관한 뒤 GitHub `data/participants.json`에 백그라운드 자동 저장합니다.
- 네트워크 오류/동시 수정(409) 발생 시 자동 재시도하며, 이미 GitHub에 존재하는 이름은 다시 저장하지 않습니다.
- GitHub 자동저장 설정이 없는 경우에도 현재 모임 등록은 정상 완료되고, 설정 후 대기 중인 이름을 자동 동기화합니다.
- iPhone 홈 화면 아이콘은 `pinhigh.jpg`를 안전 여백 안에 배치한 `apple-touch-icon.png`를 사용해 상하좌우 잘림을 방지합니다.
- Android/Chrome manifest 아이콘도 안전 여백 버전으로 교체했습니다.

## GitHub 자동저장 설정
1. GitHub 저장소에서 `data/participants.json`을 유지합니다.
2. 사이트의 `GitHub 자동저장 설정`에서 사용자/조직명, 저장소, 브랜치, Fine-grained Token을 관리자 기기에서 1회 입력합니다.
3. Token에는 해당 저장소의 **Contents: Read and write** 권한이 필요합니다.
4. 이후 신규 이름을 추가하면 자동으로 GitHub에 저장됩니다.

Token은 GitHub 저장소 파일에 업로드되지 않고 해당 브라우저의 localStorage에만 저장됩니다.
