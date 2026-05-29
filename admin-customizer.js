(function () {
  const DEFAULT_BRANDING = {
    name: "NovaX",
    tagline: "Demo Exchange",
    eyebrow: "Premium crypto terminal",
    primary: "#ff4ecd",
    secondary: "#925cff",
    accent: "#55eadf",
    background: "#0a0613",
  };

  const originalCacheElements = cacheElements;
  const originalLoadDemoState = loadDemoState;
  const originalSaveDemoState = saveDemoState;
  const originalRenderShell = renderShell;
  const originalAttachEvents = attachEvents;

  function normalizeBranding(value) {
    return {
      ...DEFAULT_BRANDING,
      ...(value || {}),
    };
  }

  cacheElements = function () {
    originalCacheElements();
    [
      "siteNameInput",
      "siteTaglineInput",
      "siteEyebrowInput",
      "primaryColorInput",
      "secondaryColorInput",
      "accentColorInput",
      "backgroundColorInput",
      "saveBranding",
      "resetBranding",
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  };

  loadDemoState = function () {
    originalLoadDemoState();
    try {
      const saved = JSON.parse(localStorage.getItem("novax-demo") || "{}");
      state.branding = normalizeBranding(saved.branding);
    } catch {
      state.branding = normalizeBranding();
    }
    applyBranding();
  };

  saveDemoState = function () {
    originalSaveDemoState();
    const saved = JSON.parse(localStorage.getItem("novax-demo") || "{}");
    saved.branding = normalizeBranding(state.branding);
    localStorage.setItem("novax-demo", JSON.stringify(saved));
  };

  renderShell = function () {
    state.branding = normalizeBranding(state.branding);
    originalRenderShell();
    renderBrandingAdmin();
    applyBranding();
  };

  attachEvents = function () {
    originalAttachEvents();

    [
      "siteNameInput",
      "siteTaglineInput",
      "siteEyebrowInput",
      "primaryColorInput",
      "secondaryColorInput",
      "accentColorInput",
      "backgroundColorInput",
    ].forEach((id) => {
      els[id]?.addEventListener("input", previewBranding);
    });

    els.saveBranding?.addEventListener("click", saveBranding);
    els.resetBranding?.addEventListener("click", resetBranding);
  };

  function previewBranding() {
    state.branding = readBrandingInputs();
    applyBranding();
  }

  function saveBranding() {
    state.branding = readBrandingInputs();
    applyBranding();
    saveDemoState();
    renderBrandingAdmin();
  }

  function resetBranding() {
    state.branding = normalizeBranding();
    applyBranding();
    saveDemoState();
    renderBrandingAdmin(true);
  }

  function readBrandingInputs() {
    const current = normalizeBranding(state.branding);
    return normalizeBranding({
      name: cleanText(els.siteNameInput?.value, current.name),
      tagline: cleanText(els.siteTaglineInput?.value, current.tagline),
      eyebrow: cleanText(els.siteEyebrowInput?.value, current.eyebrow),
      primary: validHex(els.primaryColorInput?.value, current.primary),
      secondary: validHex(els.secondaryColorInput?.value, current.secondary),
      accent: validHex(els.accentColorInput?.value, current.accent),
      background: validHex(els.backgroundColorInput?.value, current.background),
    });
  }

  function renderBrandingAdmin(force = false) {
    if (!els.siteNameInput) return;
    const branding = normalizeBranding(state.branding);
    const active = document.activeElement;
    const textInputs = [els.siteNameInput, els.siteTaglineInput, els.siteEyebrowInput];
    const colorInputs = [els.primaryColorInput, els.secondaryColorInput, els.accentColorInput, els.backgroundColorInput];

    if (force || !textInputs.includes(active)) {
      els.siteNameInput.value = branding.name;
      els.siteTaglineInput.value = branding.tagline;
      els.siteEyebrowInput.value = branding.eyebrow;
    }
    if (force || !colorInputs.includes(active)) {
      els.primaryColorInput.value = branding.primary;
      els.secondaryColorInput.value = branding.secondary;
      els.accentColorInput.value = branding.accent;
      els.backgroundColorInput.value = branding.background;
    }
  }

  function applyBranding() {
    const branding = normalizeBranding(state.branding);
    const root = document.documentElement;
    root.style.setProperty("--pink", branding.primary);
    root.style.setProperty("--violet", branding.secondary);
    root.style.setProperty("--cyan", branding.accent);
    root.style.setProperty("--bg", branding.background);

    document.title = `${branding.name} ${branding.tagline}`.trim();
    document.querySelectorAll("[data-brand-name]").forEach((node) => {
      node.textContent = branding.name;
    });
    document.querySelectorAll("[data-brand-tagline]").forEach((node) => {
      node.textContent = branding.tagline;
    });
    document.querySelectorAll("[data-brand-eyebrow]").forEach((node) => {
      node.textContent = branding.eyebrow;
    });
    document.querySelectorAll("[data-brand-link]").forEach((node) => {
      node.setAttribute("aria-label", branding.name);
    });
  }

  function cleanText(value, fallback) {
    const cleaned = String(value || "").trim().replace(/\s+/g, " ");
    return cleaned || fallback;
  }

  function validHex(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
  }
})();
