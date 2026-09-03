// 사이트 전역 설정. 블로그 제목이나 저자를 바꾸려면 여기만 고치면 된다.
export default {
  title: '기록',
  description: '읽고 만든 것들에 대한 기록',
  author: 'USER',

  // GitHub Pages 배포 주소. canonical / og:url 에만 쓰인다.
  // 비어 있으면 canonical / og:url 태그를 생략한다.
  url: 'https://cjh3131473-hash.github.io/my-blog',

  // 한국어 기준 분당 읽는 글자 수. 읽는 시간 추정에 쓰인다.
  charsPerMinute: 500,

  // 미니 웹앱 포트폴리오. 각 항목의 slug 는 apps/{slug}/ 디렉터리와 일치해야 한다
  // (없으면 빌드 실패). 카드는 메인 페이지에 이 순서대로 나온다.
  apps: [
    {
      slug: '2048',
      title: '2048',
      description: '방향키로 숫자 타일을 밀어 합치는 퍼즐 게임. 점수판 포함.',
    },
  ],
};
