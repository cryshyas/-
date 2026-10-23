/**
 * submit.js — 채점·상태 관리·선택적 전송
 *
 * ─── 교사용 전송 설정 안내 ───────────────────────────────────────
 * 아래 SUBMISSION_ENDPOINT에 Google Apps Script 웹 앱 주소를 넣으면
 * 학생의 퀴즈 결과(반, 번호, 점수, 문항별 응답)가 자동으로 전송됩니다.
 *
 *   예) const SUBMISSION_ENDPOINT = 'https://script.google.com/macros/s/…/exec';
 *
 * ⚠ 개인정보 처리 안내 (교사용)
 *   반·번호는 다른 정보와 결합하면 학생을 식별할 수 있는 개인정보입니다.
 *   외부 서버(Google 스프레드시트 등)로 전송·보관하기 전에 다음을 확인하세요.
 *     1. 수집 목적: 학습 진단·피드백 제공 등 구체적 목적이 있는가?
 *     2. 적법한 근거: 학교의 개인정보 처리 지침에 따라 수집이 허용되는가?
 *     3. 열람 권한: 결과를 열람할 수 있는 사람을 제한했는가?
 *     4. 보유 기간 및 삭제: 활동 종료 후 데이터를 언제, 어떻게 삭제하는가?
 *   전송 주소가 비어 있으면 어떠한 네트워크 요청도 하지 않습니다.
 * ──────────────────────────────────────────────────────────────────
 */
const SUBMISSION_ENDPOINT = 'https://script.google.com/macros/s/AKfycbw8WPYNwH7NY1ZntxOq9ErGqlnEdpNEqken5TTrJTK3rzEVCdY0_lY_aGC6r2vW56hr3Q/exec';

/* ───── 게임 상태 ───── */
const state = {
  classNumber: null,
  studentNumber: null,
  currentIndex: 0,
  score: 0,
  combo: 0,
  maxCombo: 0,
  correctCount: 0,
  level: 1,
  answers: [],        // { questionId, selectedIndex, isCorrect }
  answered: false,     // 현재 문항 응답 여부(중복 클릭 방지)
  submitted: false     // 이번 판 전송 완료 여부(중복 전송 방지)
};

/* ───── 유틸리티 ───── */
function isValidClassOrNumber(v) {
  if (v === '' || v == null) return false;
  var n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 99;
}

function getLevel(correctCount) {
  if (correctCount >= 9) return 4;
  if (correctCount >= 6) return 3;
  if (correctCount >= 3) return 2;
  return 1;
}

function getGrade(accuracy) {
  if (accuracy === 100) return '챔피언';
  if (accuracy >= 80)  return '골드';
  if (accuracy >= 60)  return '실버';
  if (accuracy >= 40)  return '성장 중';
  return '도전자';
}

/* ───── 반·번호 검증 ───── */
function validateInput(inputEl, errorEl) {
  var val = inputEl.value.trim();
  if (val === '') {
    errorEl.textContent = '빈칸이에요! 숫자를 넣어 주세요.';
    errorEl.hidden = false;
    return false;
  }
  if (!isValidClassOrNumber(val)) {
    errorEl.textContent = '1~99 사이의 숫자만 넣어 주세요.';
    errorEl.hidden = false;
    return false;
  }
  errorEl.textContent = '';
  errorEl.hidden = true;
  return true;
}

function tryStart() {
  var classInput  = document.getElementById('input-class');
  var numInput    = document.getElementById('input-number');
  var classErr    = document.getElementById('error-class');
  var numErr      = document.getElementById('error-number');

  var classOk  = validateInput(classInput, classErr);
  var numOk    = validateInput(numInput, numErr);

  if (!classOk) { classInput.focus(); return; }
  if (!numOk)   { numInput.focus();  return; }

  state.classNumber   = parseInt(classInput.value, 10);
  state.studentNumber = parseInt(numInput.value, 10);

  startGame();
}

/* ───── 게임 진행 ───── */
function resetState() {
  state.classNumber   = null;
  state.studentNumber = null;
  state.currentIndex  = 0;
  state.score         = 0;
  state.combo         = 0;
  state.maxCombo      = 0;
  state.correctCount  = 0;
  state.level         = 1;
  state.answers       = [];
  state.answered      = false;
  state.submitted     = false;
}

function processAnswer(selectedIndex) {
  if (state.answered) return null;
  state.answered = true;

  var q = window.QUIZ_DATA.questions[state.currentIndex];
  var isCorrect = selectedIndex === q.answer;
  var pointsEarned = 0;
  var bonusPoints  = 0;

  if (isCorrect) {
    state.combo++;
    state.correctCount++;
    pointsEarned = 100;
    if (state.combo >= 2) {
      bonusPoints = Math.min(state.combo, 5) * 20;
    }
    state.score += pointsEarned + bonusPoints;
    if (state.combo > state.maxCombo) {
      state.maxCombo = state.combo;
    }
  } else {
    state.combo = 0;
  }

  state.level = getLevel(state.correctCount);

  state.answers.push({
    questionId: q.id,
    selectedIndex: selectedIndex,
    isCorrect: isCorrect
  });

  return {
    isCorrect: isCorrect,
    correctIndex: q.answer,
    explanation: q.explanation,
    pointsEarned: pointsEarned,
    bonusPoints: bonusPoints,
    combo: state.combo,
    score: state.score,
    level: state.level
  };
}

function advanceQuestion() {
  state.answered = false;
  state.currentIndex++;
}

function isLastQuestion() {
  return state.currentIndex >= window.QUIZ_DATA.questions.length - 1;
}

function getResultData() {
  var totalQ    = window.QUIZ_DATA.questions.length;
  var accuracy  = Math.round((state.correctCount / totalQ) * 100);
  var grade     = getGrade(accuracy);
  return {
    score: state.score,
    correctCount: state.correctCount,
    totalQuestions: totalQ,
    accuracy: accuracy,
    maxCombo: state.maxCombo,
    grade: grade,
    classNumber: state.classNumber,
    studentNumber: state.studentNumber
  };
}

function getWrongAnswers() {
  var wrong = [];
  for (var i = 0; i < state.answers.length; i++) {
    if (!state.answers[i].isCorrect) {
      var q = window.QUIZ_DATA.questions[i];
      wrong.push({
        index: i,
        question: q.question,
        options: q.options,
        correctIndex: q.answer,
        selectedIndex: state.answers[i].selectedIndex,
        explanation: q.explanation
      });
    }
  }
  return wrong;
}

/* ───── 제출 데이터 규격 (변경 금지) ───── */
function buildSubmissionPayload() {
  if (!isValidClassOrNumber(state.classNumber) || !isValidClassOrNumber(state.studentNumber)) {
    return null;
  }
  var totalQ   = window.QUIZ_DATA.questions.length;
  var accuracy = Math.round((state.correctCount / totalQ) * 100);
  return {
    quizTitle:      window.QUIZ_DATA.title,
    classNumber:    state.classNumber,
    studentNumber:  state.studentNumber,
    score:          state.score,
    correctCount:   state.correctCount,
    totalQuestions: totalQ,
    accuracy:       accuracy,
    maxCombo:       state.maxCombo,
    grade:          getGrade(accuracy),
    answers:        state.answers.slice()   // 방어적 복사
  };
}

/* ───── 전송 (선택적) ───── */
function submitResult(statusCallback) {
  if (!SUBMISSION_ENDPOINT) return;          // 주소 없으면 전송 안 함
  if (state.submitted) return;               // 중복 전송 방지

  var payload = buildSubmissionPayload();
  if (!payload) return;

  state.submitted = true;
  if (statusCallback) statusCallback('sending');   // '기록 중…'

  fetch(SUBMISSION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  })
  .then(function (res) { return res.json(); })
  .then(function (data) {
    if (data && data.ok === true) {
      if (statusCallback) statusCallback('done');   // '기록 완료'
    } else {
      if (statusCallback) statusCallback('error');
    }
  })
  .catch(function () {
    if (statusCallback) statusCallback('error');     // '기록하지 못했어요…'
  });
}
