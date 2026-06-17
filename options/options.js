const api = typeof browser !== "undefined" ? browser : chrome;

const DEFAULT_SETTINGS = {
  applyOnAllPages: true,
  preloadColor: "#0b0d10",
  transitionDurationMs: 1800,
  initialHoldMs: 220,
  tabSwitchTransitionEnabled: true,
  tabSwitchTransitionDurationMs: 1800,
  tabSwitchInitialHoldMs: 220,
  brightnessThreshold: 185,
  siteListMode: "blacklist",
  siteListHosts: "",
  uiLanguage: "auto",
  excludedHosts: ""
};

const SUPPORTED_LANGUAGES = [
  "en",
  "es",
  "pt_BR",
  "fr",
  "de",
  "zh_CN",
  "ja",
  "ko",
  "ru",
  "ar"
];
const RTL_LANGUAGES = ["ar"];
const TRANSLATIONS = {
  en: {
    pageTitle: "Dark Background Anti-Flash Options",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "Configure preload color, page-load and tab-switch transitions, and bright-page detection.",
    languageHeading: "Language",
    languageLabel: "Settings page language",
    languageAuto: "Auto",
    baseGuard: "Base Guard",
    applyOnAllPages: "Apply on all websites",
    preloadColor: "Preload dark color",
    pageLoadTransition: "Page Load Transition",
    transitionDuration: "Transition duration (ms)",
    initialHold: "Delay before transition (ms)",
    tabSwitchTransition: "Tab Switch Transition",
    tabSwitchEnabled: "Apply transition when returning to a tab",
    brightPageDetection: "Bright Page Detection",
    brightnessThreshold: "Brightness threshold (0-255)",
    siteAccess: "Site Access",
    listBehavior: "List behavior",
    blacklistOption: "Disable on listed pages",
    whitelistOption: "Only run on listed pages",
    siteListHosts: "Websites or pages (one per line)",
    siteListPlaceholder: "example.com\nexample.com/docs\nhttps://news.example.org/article",
    saveSettings: "Save Settings",
    resetDefaults: "Reset Defaults",
    saved: "Saved.",
    defaultsRestored: "Defaults restored."
  },
  es: {
    pageTitle: "Opciones de Dark Background Anti-Flash",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "Configura el color de precarga, las transiciones de carga y cambio de pestaña, y la detección de páginas claras.",
    languageHeading: "Idioma",
    languageLabel: "Idioma de la página de opciones",
    languageAuto: "Automático",
    baseGuard: "Protección base",
    applyOnAllPages: "Aplicar en todos los sitios web",
    preloadColor: "Color oscuro de precarga",
    pageLoadTransition: "Transición al cargar la página",
    transitionDuration: "Duración de la transición (ms)",
    initialHold: "Espera antes de la transición (ms)",
    tabSwitchTransition: "Transición al cambiar de pestaña",
    tabSwitchEnabled: "Aplicar transición al volver a una pestaña",
    brightPageDetection: "Detección de páginas claras",
    brightnessThreshold: "Umbral de brillo (0-255)",
    siteAccess: "Acceso a sitios",
    listBehavior: "Comportamiento de la lista",
    blacklistOption: "Desactivar en páginas listadas",
    whitelistOption: "Ejecutar solo en páginas listadas",
    siteListHosts: "Sitios web o páginas (uno por línea)",
    siteListPlaceholder: "ejemplo.com\nejemplo.com/docs\nhttps://noticias.ejemplo.org/articulo",
    saveSettings: "Guardar ajustes",
    resetDefaults: "Restaurar valores",
    saved: "Guardado.",
    defaultsRestored: "Valores restaurados."
  },
  pt_BR: {
    pageTitle: "Opções do Dark Background Anti-Flash",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "Configure a cor de pré-carregamento, as transições ao carregar páginas e trocar abas, e a detecção de páginas claras.",
    languageHeading: "Idioma",
    languageLabel: "Idioma da página de opções",
    languageAuto: "Automático",
    baseGuard: "Proteção base",
    applyOnAllPages: "Aplicar em todos os sites",
    preloadColor: "Cor escura de pré-carregamento",
    pageLoadTransition: "Transição ao carregar página",
    transitionDuration: "Duração da transição (ms)",
    initialHold: "Atraso antes da transição (ms)",
    tabSwitchTransition: "Transição ao trocar de aba",
    tabSwitchEnabled: "Aplicar transição ao voltar para uma aba",
    brightPageDetection: "Detecção de páginas claras",
    brightnessThreshold: "Limite de brilho (0-255)",
    siteAccess: "Acesso a sites",
    listBehavior: "Comportamento da lista",
    blacklistOption: "Desativar nas páginas listadas",
    whitelistOption: "Executar apenas nas páginas listadas",
    siteListHosts: "Sites ou páginas (um por linha)",
    siteListPlaceholder: "exemplo.com\nexemplo.com/docs\nhttps://noticias.exemplo.org/artigo",
    saveSettings: "Salvar configurações",
    resetDefaults: "Restaurar padrões",
    saved: "Salvo.",
    defaultsRestored: "Padrões restaurados."
  },
  fr: {
    pageTitle: "Options de Dark Background Anti-Flash",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "Configurez la couleur de préchargement, les transitions au chargement et au changement d’onglet, et la détection des pages claires.",
    languageHeading: "Langue",
    languageLabel: "Langue de la page des options",
    languageAuto: "Automatique",
    baseGuard: "Protection de base",
    applyOnAllPages: "Appliquer sur tous les sites web",
    preloadColor: "Couleur sombre de préchargement",
    pageLoadTransition: "Transition au chargement de page",
    transitionDuration: "Durée de la transition (ms)",
    initialHold: "Délai avant la transition (ms)",
    tabSwitchTransition: "Transition au changement d’onglet",
    tabSwitchEnabled: "Appliquer la transition au retour sur un onglet",
    brightPageDetection: "Détection des pages claires",
    brightnessThreshold: "Seuil de luminosité (0-255)",
    siteAccess: "Accès aux sites",
    listBehavior: "Comportement de la liste",
    blacklistOption: "Désactiver sur les pages listées",
    whitelistOption: "Exécuter seulement sur les pages listées",
    siteListHosts: "Sites web ou pages (un par ligne)",
    siteListPlaceholder: "exemple.com\nexemple.com/docs\nhttps://actu.exemple.org/article",
    saveSettings: "Enregistrer",
    resetDefaults: "Réinitialiser",
    saved: "Enregistré.",
    defaultsRestored: "Valeurs par défaut restaurées."
  },
  de: {
    pageTitle: "Optionen für Dark Background Anti-Flash",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "Konfiguriere Vorladefarbe, Übergänge beim Laden und Tabwechsel sowie die Erkennung heller Seiten.",
    languageHeading: "Sprache",
    languageLabel: "Sprache der Optionsseite",
    languageAuto: "Automatisch",
    baseGuard: "Basisschutz",
    applyOnAllPages: "Auf allen Websites anwenden",
    preloadColor: "Dunkle Vorladefarbe",
    pageLoadTransition: "Übergang beim Laden der Seite",
    transitionDuration: "Übergangsdauer (ms)",
    initialHold: "Verzögerung vor dem Übergang (ms)",
    tabSwitchTransition: "Übergang beim Tabwechsel",
    tabSwitchEnabled: "Übergang beim Zurückkehren zu einem Tab anwenden",
    brightPageDetection: "Erkennung heller Seiten",
    brightnessThreshold: "Helligkeitsschwelle (0-255)",
    siteAccess: "Website-Zugriff",
    listBehavior: "Listenverhalten",
    blacklistOption: "Auf gelisteten Seiten deaktivieren",
    whitelistOption: "Nur auf gelisteten Seiten ausführen",
    siteListHosts: "Websites oder Seiten (eine pro Zeile)",
    siteListPlaceholder: "beispiel.de\nbeispiel.de/docs\nhttps://news.beispiel.de/artikel",
    saveSettings: "Einstellungen speichern",
    resetDefaults: "Standardwerte",
    saved: "Gespeichert.",
    defaultsRestored: "Standardwerte wiederhergestellt."
  },
  zh_CN: {
    pageTitle: "Dark Background Anti-Flash 选项",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "配置预加载颜色、页面加载和标签页切换过渡，以及亮色页面检测。",
    languageHeading: "语言",
    languageLabel: "设置页面语言",
    languageAuto: "自动",
    baseGuard: "基础保护",
    applyOnAllPages: "应用于所有网站",
    preloadColor: "预加载深色",
    pageLoadTransition: "页面加载过渡",
    transitionDuration: "过渡时长（毫秒）",
    initialHold: "过渡前延迟（毫秒）",
    tabSwitchTransition: "标签页切换过渡",
    tabSwitchEnabled: "返回标签页时应用过渡",
    brightPageDetection: "亮色页面检测",
    brightnessThreshold: "亮度阈值（0-255）",
    siteAccess: "网站访问",
    listBehavior: "列表行为",
    blacklistOption: "在列出的页面上禁用",
    whitelistOption: "仅在列出的页面上运行",
    siteListHosts: "网站或页面（每行一个）",
    siteListPlaceholder: "example.com\nexample.com/docs\nhttps://news.example.org/article",
    saveSettings: "保存设置",
    resetDefaults: "恢复默认值",
    saved: "已保存。",
    defaultsRestored: "已恢复默认值。"
  },
  ja: {
    pageTitle: "Dark Background Anti-Flash オプション",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "プリロード色、ページ読み込みとタブ切り替えのトランジション、明るいページの検出を設定します。",
    languageHeading: "言語",
    languageLabel: "設定ページの言語",
    languageAuto: "自動",
    baseGuard: "基本保護",
    applyOnAllPages: "すべてのウェブサイトに適用",
    preloadColor: "プリロード用の暗い色",
    pageLoadTransition: "ページ読み込み時のトランジション",
    transitionDuration: "トランジション時間 (ms)",
    initialHold: "トランジション前の待機時間 (ms)",
    tabSwitchTransition: "タブ切り替え時のトランジション",
    tabSwitchEnabled: "タブに戻るときにトランジションを適用",
    brightPageDetection: "明るいページの検出",
    brightnessThreshold: "明るさのしきい値 (0-255)",
    siteAccess: "サイトアクセス",
    listBehavior: "リストの動作",
    blacklistOption: "リスト内のページで無効にする",
    whitelistOption: "リスト内のページでのみ実行",
    siteListHosts: "ウェブサイトまたはページ（1 行に 1 つ）",
    siteListPlaceholder: "example.com\nexample.com/docs\nhttps://news.example.org/article",
    saveSettings: "設定を保存",
    resetDefaults: "既定値に戻す",
    saved: "保存しました。",
    defaultsRestored: "既定値を復元しました。"
  },
  ko: {
    pageTitle: "Dark Background Anti-Flash 옵션",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "사전 로드 색상, 페이지 로드 및 탭 전환 효과, 밝은 페이지 감지를 설정합니다.",
    languageHeading: "언어",
    languageLabel: "설정 페이지 언어",
    languageAuto: "자동",
    baseGuard: "기본 보호",
    applyOnAllPages: "모든 웹사이트에 적용",
    preloadColor: "사전 로드 어두운 색상",
    pageLoadTransition: "페이지 로드 전환",
    transitionDuration: "전환 시간 (ms)",
    initialHold: "전환 전 지연 (ms)",
    tabSwitchTransition: "탭 전환 효과",
    tabSwitchEnabled: "탭으로 돌아올 때 전환 적용",
    brightPageDetection: "밝은 페이지 감지",
    brightnessThreshold: "밝기 임계값 (0-255)",
    siteAccess: "사이트 접근",
    listBehavior: "목록 동작",
    blacklistOption: "목록의 페이지에서 비활성화",
    whitelistOption: "목록의 페이지에서만 실행",
    siteListHosts: "웹사이트 또는 페이지 (한 줄에 하나)",
    siteListPlaceholder: "example.com\nexample.com/docs\nhttps://news.example.org/article",
    saveSettings: "설정 저장",
    resetDefaults: "기본값 복원",
    saved: "저장됨.",
    defaultsRestored: "기본값이 복원되었습니다."
  },
  ru: {
    pageTitle: "Параметры Dark Background Anti-Flash",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "Настройте цвет предварительной заливки, переходы при загрузке страниц и переключении вкладок, а также обнаружение светлых страниц.",
    languageHeading: "Язык",
    languageLabel: "Язык страницы настроек",
    languageAuto: "Авто",
    baseGuard: "Базовая защита",
    applyOnAllPages: "Применять на всех сайтах",
    preloadColor: "Темный цвет предварительной заливки",
    pageLoadTransition: "Переход при загрузке страницы",
    transitionDuration: "Длительность перехода (мс)",
    initialHold: "Задержка перед переходом (мс)",
    tabSwitchTransition: "Переход при смене вкладки",
    tabSwitchEnabled: "Применять переход при возврате на вкладку",
    brightPageDetection: "Обнаружение светлых страниц",
    brightnessThreshold: "Порог яркости (0-255)",
    siteAccess: "Доступ к сайтам",
    listBehavior: "Поведение списка",
    blacklistOption: "Отключать на страницах из списка",
    whitelistOption: "Работать только на страницах из списка",
    siteListHosts: "Сайты или страницы (по одному в строке)",
    siteListPlaceholder: "example.com\nexample.com/docs\nhttps://news.example.org/article",
    saveSettings: "Сохранить настройки",
    resetDefaults: "Сбросить настройки",
    saved: "Сохранено.",
    defaultsRestored: "Настройки по умолчанию восстановлены."
  },
  ar: {
    pageTitle: "خيارات Dark Background Anti-Flash",
    appTitle: "Dark Background Anti-Flash",
    subtitle: "اضبط لون التحميل المسبق وانتقالات تحميل الصفحات وتبديل الألسنة واكتشاف الصفحات الساطعة.",
    languageHeading: "اللغة",
    languageLabel: "لغة صفحة الإعدادات",
    languageAuto: "تلقائي",
    baseGuard: "الحماية الأساسية",
    applyOnAllPages: "التطبيق على كل المواقع",
    preloadColor: "لون داكن للتحميل المسبق",
    pageLoadTransition: "انتقال تحميل الصفحة",
    transitionDuration: "مدة الانتقال (مللي ثانية)",
    initialHold: "التأخير قبل الانتقال (مللي ثانية)",
    tabSwitchTransition: "انتقال تبديل اللسان",
    tabSwitchEnabled: "تطبيق الانتقال عند الرجوع إلى لسان",
    brightPageDetection: "اكتشاف الصفحات الساطعة",
    brightnessThreshold: "حد السطوع (0-255)",
    siteAccess: "الوصول إلى المواقع",
    listBehavior: "سلوك القائمة",
    blacklistOption: "تعطيل على الصفحات المدرجة",
    whitelistOption: "التشغيل فقط على الصفحات المدرجة",
    siteListHosts: "مواقع أو صفحات (واحد في كل سطر)",
    siteListPlaceholder: "example.com\nexample.com/docs\nhttps://news.example.org/article",
    saveSettings: "حفظ الإعدادات",
    resetDefaults: "استعادة الافتراضي",
    saved: "تم الحفظ.",
    defaultsRestored: "تمت استعادة الإعدادات الافتراضية."
  }
};

const form = document.getElementById("settings-form");
const status = document.getElementById("status");

const fields = {
  uiLanguage: document.getElementById("uiLanguage"),
  applyOnAllPages: document.getElementById("applyOnAllPages"),
  preloadColor: document.getElementById("preloadColor"),
  preloadColorText: document.getElementById("preloadColorText"),
  transitionDurationMs: document.getElementById("transitionDurationMs"),
  initialHoldMs: document.getElementById("initialHoldMs"),
  tabSwitchTransitionEnabled: document.getElementById("tabSwitchTransitionEnabled"),
  tabSwitchTransitionDurationMs: document.getElementById("tabSwitchTransitionDurationMs"),
  tabSwitchInitialHoldMs: document.getElementById("tabSwitchInitialHoldMs"),
  brightnessThreshold: document.getElementById("brightnessThreshold"),
  siteListMode: document.getElementById("siteListMode"),
  siteListHosts: document.getElementById("siteListHosts"),
  resetDefaults: document.getElementById("resetDefaults")
};
let currentLanguage = "en";

function storageGet(defaults) {
  try {
    const result = api.storage.sync.get(defaults);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch (error) {
    // Fall back to callback style.
  }

  return new Promise((resolve) => {
    api.storage.sync.get(defaults, (value) => resolve(value));
  });
}

function storageSet(value) {
  try {
    const result = api.storage.sync.set(value);
    if (result && typeof result.then === "function") {
      return result;
    }
  } catch (error) {
    // Fall back to callback style.
  }

  return new Promise((resolve) => {
    api.storage.sync.set(value, () => resolve());
  });
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;
  if (!hexPattern.test(normalized)) {
    return fallback;
  }
  if (normalized.length === 4) {
    return (
      "#" +
      normalized[1] +
      normalized[1] +
      normalized[2] +
      normalized[2] +
      normalized[3] +
      normalized[3]
    );
  }
  return normalized;
}

function syncColorInputs(colorInput, textInput) {
  colorInput.addEventListener("input", () => {
    textInput.value = colorInput.value;
  });

  textInput.addEventListener("input", () => {
    // Keep the color picker usable even while the text field is being edited.
    const normalized = normalizeHexColor(textInput.value, colorInput.value);
    if (normalized !== colorInput.value) {
      colorInput.value = normalized;
    }
  });
}

function normalizeSiteListMode(value) {
  return value === "whitelist" ? "whitelist" : "blacklist";
}

function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value) ? value : "auto";
}

function getBrowserLanguages() {
  const languages = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en"];
  return languages.map((language) => language.replace("-", "_"));
}

function resolveLanguage(selectedLanguage) {
  const normalized = normalizeLanguage(selectedLanguage);
  if (normalized !== "auto") {
    return normalized;
  }

  for (const browserLanguage of getBrowserLanguages()) {
    if (SUPPORTED_LANGUAGES.includes(browserLanguage)) {
      return browserLanguage;
    }

    const baseLanguage = browserLanguage.split("_")[0];
    if (baseLanguage === "pt") {
      return "pt_BR";
    }
    if (baseLanguage === "zh") {
      return "zh_CN";
    }
    if (SUPPORTED_LANGUAGES.includes(baseLanguage)) {
      return baseLanguage;
    }
  }

  return "en";
}

function translate(key) {
  return TRANSLATIONS[currentLanguage][key] || TRANSLATIONS.en[key] || key;
}

function applyTranslations(selectedLanguage) {
  currentLanguage = resolveLanguage(selectedLanguage);
  document.documentElement.lang = currentLanguage.replace("_", "-");
  document.documentElement.dir = RTL_LANGUAGES.includes(currentLanguage) ? "rtl" : "ltr";
  document.title = translate("pageTitle");

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = translate(element.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = translate(element.dataset.i18nPlaceholder);
  });
}

function populateForm(settings) {
  fields.uiLanguage.value = normalizeLanguage(settings.uiLanguage);
  applyTranslations(fields.uiLanguage.value);
  fields.applyOnAllPages.checked = settings.applyOnAllPages;
  fields.preloadColor.value = settings.preloadColor;
  fields.preloadColorText.value = settings.preloadColor;
  fields.transitionDurationMs.value = settings.transitionDurationMs;
  fields.initialHoldMs.value = settings.initialHoldMs;
  fields.tabSwitchTransitionEnabled.checked = settings.tabSwitchTransitionEnabled;
  fields.tabSwitchTransitionDurationMs.value = settings.tabSwitchTransitionDurationMs;
  fields.tabSwitchInitialHoldMs.value = settings.tabSwitchInitialHoldMs;
  fields.brightnessThreshold.value = settings.brightnessThreshold;
  fields.siteListMode.value = normalizeSiteListMode(settings.siteListMode);
  fields.siteListHosts.value = settings.siteListHosts || "";
}

function readForm() {
  return {
    uiLanguage: normalizeLanguage(fields.uiLanguage.value),
    applyOnAllPages: fields.applyOnAllPages.checked,
    preloadColor: normalizeHexColor(
      fields.preloadColorText.value,
      DEFAULT_SETTINGS.preloadColor
    ),
    transitionDurationMs: clamp(
      fields.transitionDurationMs.value,
      0,
      10000,
      DEFAULT_SETTINGS.transitionDurationMs
    ),
    initialHoldMs: clamp(
      fields.initialHoldMs.value,
      0,
      5000,
      DEFAULT_SETTINGS.initialHoldMs
    ),
    tabSwitchTransitionEnabled: fields.tabSwitchTransitionEnabled.checked,
    tabSwitchTransitionDurationMs: clamp(
      fields.tabSwitchTransitionDurationMs.value,
      0,
      10000,
      DEFAULT_SETTINGS.tabSwitchTransitionDurationMs
    ),
    tabSwitchInitialHoldMs: clamp(
      fields.tabSwitchInitialHoldMs.value,
      0,
      5000,
      DEFAULT_SETTINGS.tabSwitchInitialHoldMs
    ),
    brightnessThreshold: clamp(
      fields.brightnessThreshold.value,
      0,
      255,
      DEFAULT_SETTINGS.brightnessThreshold
    ),
    siteListMode: normalizeSiteListMode(fields.siteListMode.value),
    siteListHosts: fields.siteListHosts.value,
    excludedHosts: ""
  };
}

function showStatus(message) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 1800);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = readForm();
  await storageSet(values);
  populateForm(values);
  showStatus(translate("saved"));
});

fields.resetDefaults.addEventListener("click", async () => {
  await storageSet(DEFAULT_SETTINGS);
  populateForm(DEFAULT_SETTINGS);
  showStatus(translate("defaultsRestored"));
});

fields.uiLanguage.addEventListener("change", async () => {
  const uiLanguage = normalizeLanguage(fields.uiLanguage.value);
  applyTranslations(uiLanguage);
  await storageSet({ uiLanguage });
});

syncColorInputs(fields.preloadColor, fields.preloadColorText);

(async () => {
  const stored = await storageGet({});
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  if (stored.siteListHosts === undefined && stored.excludedHosts) {
    settings.siteListHosts = stored.excludedHosts;
  }
  populateForm(settings);
})();
