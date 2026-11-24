/**
 * 公考智囊 AI · 手机端前端展示交互逻辑
 */

const STORAGE_KEY_FAV = "gongkao_rag_favorites_v1";

const state = {
  currentSubject: "全部",
  kbSubject: "全部",
  kbSearch: "",
  isGenerating: false,
  favorites: loadFavorites(),
  quiz: {
    stage: "setup",
    selectedType: "all",
    selectedCount: 3,
    questions: [],
    currentIndex: 0,
    answers: {},
    elapsedSec: 0,
    timerId: null
  }
};

// DOM 引用
const chatMessagesEl = document.getElementById("chat-messages");
const chatInputEl = document.getElementById("chat-input");
const btnSendEl = document.getElementById("btn-send");
const btnResetChatEl = document.getElementById("btn-reset-chat");
const kbListEl = document.getElementById("kb-list");
const kbSearchInputEl = document.getElementById("kb-search-input");
const favListEl = document.getElementById("fav-list");
const btnClearFavEl = document.getElementById("btn-clear-fav");
const quizContainerEl = document.getElementById("quiz-container");
const toastEl = document.getElementById("toast");

// 引用抽屉 DOM
const citationBackdropEl = document.getElementById("citation-backdrop");
const btnCloseSheetEl = document.getElementById("btn-close-sheet");
const sheetCategoryEl = document.getElementById("sheet-category");
const sheetScoreEl = document.getElementById("sheet-score");
const sheetTitleEl = document.getElementById("sheet-title");
const sheetContentEl = document.getElementById("sheet-content");

// 初始化
function init() {
  updateStatusTime();
  setInterval(updateStatusTime, 30000);
  renderWelcomeCard();
  renderQuiz();
  renderKnowledgeBase();
  renderFavorites();
  bindEvents();
}

function updateStatusTime() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const timeEl = document.getElementById("status-time");
  if (timeEl) timeEl.textContent = `${hh}:${mm}`;
}

function bindEvents() {
  // 底部 Tab 切换
  document.querySelectorAll(".tab-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.target);
    });
  });

  // 聊天科目筛选
  document.querySelectorAll("#chat-subject-bar .filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#chat-subject-bar .filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.currentSubject = pill.dataset.subject;
      renderWelcomeQuickPrompts();
    });
  });

  // 知识库科目筛选
  document.querySelectorAll("#kb-subject-bar .filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#kb-subject-bar .filter-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      state.kbSubject = pill.dataset.subject;
      renderKnowledgeBase();
    });
  });

  // 知识库搜索
  kbSearchInputEl.addEventListener("input", (e) => {
    state.kbSearch = e.target.value.trim().toLowerCase();
    renderKnowledgeBase();
  });

  // 发送问题
  btnSendEl.addEventListener("click", () => handleSend(chatInputEl.value));
  chatInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend(chatInputEl.value);
  });

  // 重置新对话
  btnResetChatEl.addEventListener("click", () => {
    if (state.isGenerating) return;
    chatMessagesEl.innerHTML = "";
    renderWelcomeCard();
    showToast("已开启新对话");
  });

  // 清空收藏
  btnClearFavEl.addEventListener("click", () => {
    state.favorites = [];
    saveFavorites();
    renderFavorites();
    showToast("已清空收藏夹");
  });

  // 关闭引用抽屉
  btnCloseSheetEl.addEventListener("click", closeCitationSheet);
  citationBackdropEl.addEventListener("click", (e) => {
    if (e.target === citationBackdropEl) closeCitationSheet();
  });
}

function switchTab(targetId) {
  document.querySelectorAll(".tab-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.target === targetId);
  });
  document.querySelectorAll(".tab-view").forEach((v) => {
    v.classList.toggle("active", v.id === targetId);
  });
  if (targetId === "view-fav") {
    renderFavorites();
  } else if (targetId === "view-quiz" && state.quiz.stage === "setup") {
    renderQuiz();
  }
}

// 渲染欢迎卡片
function renderWelcomeCard() {
  const card = document.createElement("div");
  card.className = "welcome-card";
  card.id = "welcome-card";
  card.innerHTML = `
    <span class="welcome-badge">RAG 考公问答演示壳</span>
    <h2>你好，今天想攻克哪个考公难点？</h2>
    <p>我会先检索历年真题、考纲讲义与时政库，再为你生成有依据的结构化解析。点击下方问题即可体验：</p>
    <div class="quick-prompts" id="quick-prompts-list"></div>
  `;
  chatMessagesEl.appendChild(card);
  renderWelcomeQuickPrompts();
}

function renderWelcomeQuickPrompts() {
  const listEl = document.getElementById("quick-prompts-list");
  if (!listEl) return;

  const filtered = QUICK_PROMPTS.filter(
    (p) => state.currentSubject === "全部" || p.subject === state.currentSubject
  );
  const items = filtered.length > 0 ? filtered : QUICK_PROMPTS;

  listEl.innerHTML = "";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "quick-prompt-btn";
    btn.innerHTML = `
      <span>${item.text}</span>
      <span class="quick-prompt-tag">${item.subject}</span>
    `;
    btn.addEventListener("click", () => handleSend(item.text));
    listEl.appendChild(btn);
  });
}

// 处理发送提问
function handleSend(rawText) {
  const query = rawText.trim();
  if (!query || state.isGenerating) return;

  state.isGenerating = true;
  chatInputEl.value = "";

  // 1. 渲染用户气泡
  appendUserMessage(query);

  // 2. 渲染 RAG 检索三步加载动画
  const loadingId = "rag-loading-" + Date.now();
  appendRagLoading(loadingId);

  const step1 = document.querySelector(`#${loadingId} [data-step="1"]`);
  const step2 = document.querySelector(`#${loadingId} [data-step="2"]`);
  const step3 = document.querySelector(`#${loadingId} [data-step="3"]`);

  setTimeout(() => {
    if (step1) step1.className = "rag-step done";
    if (step2) step2.className = "rag-step active";
  }, 260);

  setTimeout(() => {
    if (step2) step2.className = "rag-step done";
    if (step3) step3.className = "rag-step active";
  }, 560);

  setTimeout(() => {
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    const answerData = matchRagAnswer(query, state.currentSubject);
    appendAiMessage(answerData);
    state.isGenerating = false;
  }, 900);
}

function appendUserMessage(text) {
  const row = document.createElement("div");
  row.className = "msg-row user";
  row.innerHTML = `<div class="msg-bubble-user">${escapeHtml(text)}</div>`;
  chatMessagesEl.appendChild(row);
  scrollToBottom();
}

function appendRagLoading(id) {
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.id = id;
  row.innerHTML = `
    <div class="rag-loading-card">
      <div class="rag-step active" data-step="1">● 正在检索考公真题与政策库...</div>
      <div class="rag-step" data-step="2">● 匹配高相关考点片段...</div>
      <div class="rag-step" data-step="3">● 结合检索依据生成结构化解析...</div>
    </div>
  `;
  chatMessagesEl.appendChild(row);
  scrollToBottom();
}

function appendAiMessage(data) {
  const row = document.createElement("div");
  row.className = "msg-row assistant";

  const isSaved = state.favorites.some((f) => f.question === data.question);
  const pointsHtml = data.points.map((p) => `<li>${escapeHtml(p)}</li>`).join("");

  const card = document.createElement("div");
  card.className = "msg-card-ai";
  card.innerHTML = `
    <div class="ai-status-header">
      <span>✓ 已命中 ${data.citations.length} 份考公知识库依据 · ${escapeHtml(data.subject)}</span>
    </div>
    <div class="ai-section-title">核心结论</div>
    <p class="ai-text">${escapeHtml(data.conclusion)}</p>
    <div class="ai-section-title">详细解析</div>
    <ul class="ai-list">${pointsHtml}</ul>
    <div class="citations-box">
      <div class="citations-label">参考来源（点击查看原文片段）：</div>
      <div class="citation-chips"></div>
    </div>
    <div class="ai-actions">
      <button class="action-btn btn-copy">复制解析</button>
      <button class="action-btn btn-fav ${isSaved ? "saved" : ""}">
        ${isSaved ? "★ 已收藏" : "☆ 收藏问答"}
      </button>
    </div>
  `;

  // 绑定引用标签点击事件
  const chipsContainer = card.querySelector(".citation-chips");
  data.citations.forEach((cite) => {
    const chip = document.createElement("button");
    chip.className = "citation-chip";
    chip.textContent = `📄 ${cite.title}`;
    chip.addEventListener("click", () => openCitationSheet(cite));
    chipsContainer.appendChild(chip);
  });

  // 绑定复制按钮
  card.querySelector(".btn-copy").addEventListener("click", () => {
    const copyText = `【${data.question}】\n核心结论：${data.conclusion}\n详细解析：\n${data.points.join("\n")}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(copyText).catch(() => {});
    }
    showToast("已复制解析内容");
  });

  // 绑定收藏按钮
  const favBtn = card.querySelector(".btn-fav");
  favBtn.addEventListener("click", () => {
    const exists = state.favorites.some((f) => f.question === data.question);
    if (exists) {
      state.favorites = state.favorites.filter((f) => f.question !== data.question);
      favBtn.classList.remove("saved");
      favBtn.textContent = "☆ 收藏问答";
      showToast("已取消收藏");
    } else {
      state.favorites.unshift({
        id: data.id,
        subject: data.subject,
        question: data.question,
        conclusion: data.conclusion
      });
      favBtn.classList.add("saved");
      favBtn.textContent = "★ 已收藏";
      showToast("已保存到收藏夹");
    }
    saveFavorites();
  });

  row.appendChild(card);
  chatMessagesEl.appendChild(row);
  scrollToBottom();
}

// 渲染知识库列表
function renderKnowledgeBase() {
  const filtered = KB_ITEMS.filter((item) => {
    const matchSubject = state.kbSubject === "全部" || item.subject === state.kbSubject;
    const matchText =
      !state.kbSearch ||
      item.title.toLowerCase().includes(state.kbSearch) ||
      item.desc.toLowerCase().includes(state.kbSearch);
    return matchSubject && matchText;
  });

  if (filtered.length === 0) {
    kbListEl.innerHTML = `<div class="empty-state">暂未找到匹配的考公知识点，换个关键词试试吧~</div>`;
    return;
  }

  kbListEl.innerHTML = "";
  filtered.forEach((item) => {
    const card = document.createElement("div");
    card.className = "kb-card";
    card.innerHTML = `
      <div class="kb-card-top">
        <span class="kb-tag">${escapeHtml(item.subject)}</span>
      </div>
      <div class="kb-title">${escapeHtml(item.title)}</div>
      <p class="kb-desc">${escapeHtml(item.desc)}</p>
      <button class="btn-ask-ai">让 AI 详细讲解 →</button>
    `;
    card.querySelector(".btn-ask-ai").addEventListener("click", () => {
      switchTab("view-chat");
      handleSend(item.askText);
    });
    kbListEl.appendChild(card);
  });
}

// 渲染收藏夹
function renderFavorites() {
  if (state.favorites.length === 0) {
    favListEl.innerHTML = `
      <div class="empty-state">
        暂无收藏内容<br />在 AI 问答中点击「☆ 收藏问答」即可保存在这里
      </div>
    `;
    return;
  }

  favListEl.innerHTML = "";
  state.favorites.forEach((item) => {
    const card = document.createElement("div");
    card.className = "fav-card";
    card.innerHTML = `
      <div class="kb-card-top">
        <span class="kb-tag">${escapeHtml(item.subject)}</span>
        <button class="btn-text-danger btn-remove-fav">移除</button>
      </div>
      <div class="kb-title">${escapeHtml(item.question)}</div>
      <p class="kb-desc">${escapeHtml(item.conclusion)}</p>
      <button class="btn-ask-ai">再次向 AI 提问</button>
    `;
    card.querySelector(".btn-remove-fav").addEventListener("click", () => {
      state.favorites = state.favorites.filter((f) => f.question !== item.question);
      saveFavorites();
      renderFavorites();
      showToast("已移除收藏");
    });
    card.querySelector(".btn-ask-ai").addEventListener("click", () => {
      switchTab("view-chat");
      handleSend(item.question);
    });
    favListEl.appendChild(card);
  });
}

// 引用抽屉控制
function openCitationSheet(cite) {
  sheetCategoryEl.textContent = cite.category;
  sheetScoreEl.textContent = `匹配度 ${cite.score}`;
  sheetTitleEl.textContent = cite.title;
  sheetContentEl.textContent = cite.excerpt;
  citationBackdropEl.classList.add("open");
}

function closeCitationSheet() {
  citationBackdropEl.classList.remove("open");
}

// 工具函数
function scrollToBottom() {
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_FAV)) || [];
  } catch {
    return [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_KEY_FAV, JSON.stringify(state.favorites));
  } catch {
    // 忽略隐私模式存储限制
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ================= 模拟测试模块 =================
function renderQuiz() {
  if (!quizContainerEl) return;
  const qz = state.quiz;
  if (qz.stage === "setup") {
    renderQuizSetup();
  } else if (qz.stage === "running") {
    renderQuizRunning();
  } else {
    renderQuizResult();
  }
}

function renderQuizSetup() {
  const qz = state.quiz;
  const typesHtml = QUIZ_TYPES.map((t) => {
    const count = t.id === "all" ? QUIZ_BANK.length : QUIZ_BANK.filter((q) => q.type === t.id).length;
    return `
      <button class="quiz-type-card ${qz.selectedType === t.id ? "active" : ""}" data-type="${t.id}">
        <span class="quiz-type-name">${escapeHtml(t.name)}</span>
        <span class="quiz-type-meta">${escapeHtml(t.tag)} · 题库 ${count} 题</span>
      </button>
    `;
  }).join("");

  quizContainerEl.innerHTML = `
    <div class="quiz-hero">
      <h2>考公题型专项模拟测试</h2>
      <p>选择题型与题量，系统将从对应考公题库中随机抽题，交卷后即时生成模拟成绩与解析报告。</p>
    </div>
    <div class="quiz-section-label">1. 选择测试题型</div>
    <div class="quiz-type-grid">${typesHtml}</div>
    <div class="quiz-section-label">2. 选择抽取题量</div>
    <div class="quiz-count-row">
      <button class="quiz-count-btn ${qz.selectedCount === 3 ? "active" : ""}" data-count="3">3 题（快速体验）</button>
      <button class="quiz-count-btn ${qz.selectedCount === 5 ? "active" : ""}" data-count="5">5 题（标准小测）</button>
    </div>
    <button class="btn-primary-full" id="btn-start-quiz">开始模拟测试</button>
  `;

  quizContainerEl.querySelectorAll(".quiz-type-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      qz.selectedType = btn.dataset.type;
      renderQuizSetup();
    });
  });

  quizContainerEl.querySelectorAll(".quiz-count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      qz.selectedCount = Number(btn.dataset.count);
      renderQuizSetup();
    });
  });

  document.getElementById("btn-start-quiz").addEventListener("click", startQuiz);
}

function startQuiz() {
  const qz = state.quiz;
  qz.questions = drawQuizQuestions(qz.selectedType, qz.selectedCount);
  qz.currentIndex = 0;
  qz.answers = {};
  qz.elapsedSec = 0;
  qz.stage = "running";

  if (qz.timerId) clearInterval(qz.timerId);
  qz.timerId = setInterval(() => {
    qz.elapsedSec += 1;
    const timerEl = document.getElementById("quiz-timer-text");
    if (timerEl) timerEl.textContent = formatDuration(qz.elapsedSec);
  }, 1000);

  renderQuizRunning();
}

function renderQuizRunning() {
  const qz = state.quiz;
  const total = qz.questions.length;
  const q = qz.questions[qz.currentIndex];
  const chosen = qz.answers[q.id];
  const pct = Math.round(((qz.currentIndex + 1) / total) * 100);
  const letters = ["A", "B", "C", "D"];

  const optionsHtml = q.options.map((opt, idx) => `
    <button class="quiz-option-btn ${chosen === idx ? "selected" : ""}" data-idx="${idx}">
      <span class="quiz-option-letter">${letters[idx]}</span>
      <span>${escapeHtml(opt)}</span>
    </button>
  `).join("");

  quizContainerEl.innerHTML = `
    <div class="quiz-top-bar">
      <span>第 <strong>${qz.currentIndex + 1}</strong> / ${total} 题</span>
      <span>用时 <strong id="quiz-timer-text">${formatDuration(qz.elapsedSec)}</strong></span>
      <button class="btn-text-danger" id="btn-quit-quiz">退出</button>
    </div>
    <div class="quiz-progress-track">
      <div class="quiz-progress-fill" style="width: ${pct}%"></div>
    </div>
    <div class="quiz-question-card">
      <span class="quiz-q-tag">${escapeHtml(q.type)}</span>
      <div class="quiz-q-stem">${escapeHtml(q.stem)}</div>
      <div class="quiz-options">${optionsHtml}</div>
    </div>
    <div class="quiz-nav-row">
      <button class="btn-secondary" id="btn-prev-q" ${qz.currentIndex === 0 ? "disabled" : ""}>上一题</button>
      <button class="btn-primary-full" style="flex:1.4" id="btn-next-q">
        ${qz.currentIndex === total - 1 ? "交卷查看成绩" : "下一题"}
      </button>
    </div>
  `;

  quizContainerEl.querySelectorAll(".quiz-option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      qz.answers[q.id] = Number(btn.dataset.idx);
      renderQuizRunning();
    });
  });

  document.getElementById("btn-quit-quiz").addEventListener("click", () => {
    if (qz.timerId) clearInterval(qz.timerId);
    qz.stage = "setup";
    renderQuizSetup();
  });

  document.getElementById("btn-prev-q").addEventListener("click", () => {
    if (qz.currentIndex > 0) {
      qz.currentIndex -= 1;
      renderQuizRunning();
    }
  });

  document.getElementById("btn-next-q").addEventListener("click", () => {
    if (qz.currentIndex < total - 1) {
      qz.currentIndex += 1;
      renderQuizRunning();
    } else {
      finishQuiz();
    }
  });
}

function finishQuiz() {
  const qz = state.quiz;
  if (qz.timerId) {
    clearInterval(qz.timerId);
    qz.timerId = null;
  }
  qz.stage = "result";
  renderQuizResult();
}

function renderQuizResult() {
  const qz = state.quiz;
  const total = qz.questions.length;
  let correctCount = 0;
  qz.questions.forEach((q) => {
    if (qz.answers[q.id] === q.answer) correctCount += 1;
  });

  const score = Math.round((correctCount / total) * 100);
  const badge = score >= 80 ? "表现优秀 · 稳步上岸" : score >= 60 ? "基础良好 · 继续巩固" : "建议结合 AI 复盘错题";
  const letters = ["A", "B", "C", "D"];

  const reviewsHtml = qz.questions.map((q, idx) => {
    const userAns = qz.answers[q.id];
    const isRight = userAns === q.answer;
    const userText = userAns !== undefined ? letters[userAns] : "未作答";
    return `
      <div class="quiz-review-card">
        <div class="kb-card-top">
          <span class="kb-tag">第 ${idx + 1} 题 · ${escapeHtml(q.type)}</span>
          <span class="quiz-review-status ${isRight ? "correct" : "wrong"}">
            ${isRight ? "✓ 回答正确" : `✗ 你的答案: ${userText} | 正确答案: ${letters[q.answer]}`}
          </span>
        </div>
        <div class="kb-title">${escapeHtml(q.stem)}</div>
        <div class="quiz-review-explain"><strong>解析：</strong>${escapeHtml(q.explanation)}</div>
        <button class="btn-ask-ai" data-prompt="${escapeHtml(q.aiPrompt)}">让 AI 深度讲解相关考点 →</button>
      </div>
    `;
  }).join("");

  quizContainerEl.innerHTML = `
    <div class="quiz-score-card">
      <div style="font-size:12px;opacity:0.9;">本次模拟测试成绩</div>
      <div class="quiz-score-num">${score} 分</div>
      <div style="font-size:13px;font-weight:600;">${badge}</div>
      <div class="quiz-score-stats">
        <span>答对 ${correctCount} / ${total} 题</span>
        <span>总用时 ${formatDuration(qz.elapsedSec)}</span>
      </div>
    </div>
    <div class="quiz-nav-row">
      <button class="btn-secondary" id="btn-quiz-reselect">重选题型</button>
      <button class="btn-primary-full" style="flex:1.2" id="btn-quiz-retry">再测一组</button>
    </div>
    <div class="quiz-section-label">逐题解析与复盘</div>
    ${reviewsHtml}
  `;

  document.getElementById("btn-quiz-reselect").addEventListener("click", () => {
    qz.stage = "setup";
    renderQuizSetup();
  });

  document.getElementById("btn-quiz-retry").addEventListener("click", startQuiz);

  quizContainerEl.querySelectorAll(".btn-ask-ai").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab("view-chat");
      handleSend(btn.dataset.prompt);
    });
  });
}

function formatDuration(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

document.addEventListener("DOMContentLoaded", init);
