const CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbycsH9xuacprLPkDHXFCbmbwyJN7jzg-YhRhGDrubfrvwm9mgHpRyhnCMaVa8ofgMgA/exec",
  localStorageKey: "retro-ins-observaciones-v1",
  maxUploadSizeMb: 10,
  allowedUploadExtensions: [
    "SIR", "DBF", "COL", "ACP", "BIS", "CCC", "CVC", "CAF", "CSB", "FTI",
    "CPO", "CUC", "CAZ", "CFN", "NCC", "CRS", "CCR", "CLM", "CDM", "ADC",
    "CDO", "CIC", "SML", "JNC", "NOG", "CME", "PRO", "CLN", "NEL", "CLP",
    "CRH", "CPC", "CCO", "COC", "HUS", "HET", "HLV", "HOK", "SCL", "HSB",
    "TRA", "CLS", "FCI", "HLM", "FSC", "HCP", "HIJ", "HMS", "HMC", "HBU",
    "HSR", "FSB", "HUM", "HUN", "HSI", "ICB", "INC", "IIR", "IMC", "CMC",
    "MFI", "MEF", "HSJ", "HDB", "HDS", "HCH", "HDF", "JEG", "IMI", "HDT",
    "SAP", "HEN", "TUN", "UMO", "PSS"
  ],
  defaultSheetName: "ENERO_2026",
  // Configura aqui hasta que fecha se puede editar cada hoja.
  // Formato: YYYY-MM-DD
  editDeadlines: {
    ENERO_2026: "2026-05-15",
    FEBRERO_2026: "2026-03-15",
    MARZO_2026: "2026-04-15",
    ABRIL_2026: "2026-05-15",
    MAYO_2026: "2026-06-15",
    JUNIO_2026: "2026-07-15",
    JULIO_2026: "2026-08-15",
    AGOSTO_2026: "2026-09-15",
    SEPTIEMBRE_2026: "2026-10-15",
    OCTUBRE_2026: "2026-11-15",
    NOVIEMBRE_2026: "2026-12-15",
    DICIEMBRE_2026: "2027-01-15"
  },
  availableSheets: [
    "ENERO_2026",
    "FEBRERO_2026",
    "MARZO_2026",
    "ABRIL_2026",
    "MAYO_2026",
    "JUNIO_2026",
    "JULIO_2026",
    "AGOSTO_2026",
    "SEPTIEMBRE_2026",
    "OCTUBRE_2026",
    "NOVIEMBRE_2026",
    "DICIEMBRE_2026"
  ]
};

const state = {
  metadata: null,
  rows: [],
  filteredRows: [],
  usingRemote: false,
  lastLoadUsedFallback: false,
  monthNotEnabled: false,
  editingLocked: false,
  activeDeadline: "",
  currentSheetName: CONFIG.defaultSheetName,
  authorizedEmail: "",
  accessValidated: false
};

const els = {
  metaDepartamento: document.getElementById("metaDepartamento"),
  metaMes: document.getElementById("metaMes"),
  metaUpgd: document.getElementById("metaUpgd"),
  metaFecha: document.getElementById("metaFecha"),
  metaOportunidad: document.getElementById("metaOportunidad"),
  accessBannerText: document.getElementById("accessBannerText"),
  sheetSelect: document.getElementById("sheetSelect"),
  searchInput: document.getElementById("searchInput"),
  btnRecargar: document.getElementById("btnRecargar"),
  backendBadge: document.getElementById("backendBadge"),
  statusMessage: document.getElementById("statusMessage"),
  tablaRetroBody: document.getElementById("tablaRetroBody")
};

document.addEventListener("DOMContentLoaded", () => {
  state.authorizedEmail = getAuthorizedEmailFromUrl();
  if (!state.authorizedEmail) {
    window.location.replace("login.html");
    return;
  }
  populateSheetOptions();
  bindEvents();
  loadAllData();
});

function bindEvents() {
  els.sheetSelect.addEventListener("change", event => {
    state.currentSheetName = event.target.value;
    loadAllData(true);
  });
  els.searchInput.addEventListener("input", handleSearch);
  els.btnRecargar.addEventListener("click", () => loadAllData(true));
}

function populateSheetOptions() {
  els.sheetSelect.innerHTML = CONFIG.availableSheets
    .map(sheetName => `<option value="${escapeHtml(sheetName)}">${escapeHtml(formatSheetLabel(sheetName))}</option>`)
    .join("");

  els.sheetSelect.value = state.currentSheetName;
}

async function loadAllData(forceRemoteRefresh = false) {
  if (!state.authorizedEmail) {
    window.location.replace("login.html");
    return;
  }

  updateAccessBanner(`Correo validandose para ${formatSheetLabel(state.currentSheetName)}: ${state.authorizedEmail}`);
  setScreenStatus("Cargando informacion del formulario...");
  toggleReload(true);

  try {
    const payload = await fetchDataset(forceRemoteRefresh);
    refreshEditingRules();
    state.metadata = payload.metadata || {};
    state.rows = normalizeRows(payload.rows || []);
    state.filteredRows = [...state.rows];
    state.accessValidated = Boolean(payload.success !== false && !payload.accessDenied);
    renderMetadata();
    renderRows();
    updateBackendBadge();
    if (payload.accessDenied) {
      updateAccessBanner(`Sin acceso para ${state.authorizedEmail} en ${formatSheetLabel(state.currentSheetName)}.`);
      renderEmpty(payload.message || "El correo ingresado no tiene instituciones asignadas en este mes.");
      setScreenStatus(payload.message || "Correo no autorizado para este mes.");
    } else if (state.monthNotEnabled) {
      updateAccessBanner(`Correo autorizado: ${state.authorizedEmail}.`);
      setScreenStatus(`Este mes todavia no esta habilitado: ${formatSheetLabel(state.currentSheetName)}.`);
    } else if (state.editingLocked) {
      updateAccessBanner(`Correo autorizado: ${state.authorizedEmail}.`);
      setScreenStatus(`Edicion deshabilitada para ${formatSheetLabel(state.currentSheetName)}. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.`);
    } else if (state.usingRemote) {
      updateAccessBanner(`Correo autorizado: ${state.authorizedEmail}.`);
      setScreenStatus(
        normalizeEmail(state.authorizedEmail) === "infeccionesasociadassaludiaas@gmail.com"
          ? `Acceso administrador activo. Se cargaron ${state.rows.length} instituciones.`
          : `Se cargaron ${state.rows.length} instituciones asociadas a ${state.authorizedEmail}.`
      );
    } else if (state.lastLoadUsedFallback) {
      updateAccessBanner(`Correo autorizado: ${state.authorizedEmail}.`);
      setScreenStatus(`Se cargaron ${state.rows.length} instituciones desde el respaldo local porque la conexion remota fallo.`);
    } else {
      updateAccessBanner(`Correo autorizado: ${state.authorizedEmail}.`);
      setScreenStatus(`Se cargaron ${state.rows.length} instituciones en modo local.`);
    }
  } catch (error) {
    console.error("No fue posible cargar la informacion:", error);
    renderEmpty("No fue posible cargar la informacion. Revisa la configuracion del origen de datos.");
    updateAccessBanner(`No fue posible validar el correo ${state.authorizedEmail}.`);
    setScreenStatus("Error cargando datos.");
  } finally {
    toggleReload(false);
  }
}

async function fetchDataset(forceRemoteRefresh) {
  if (CONFIG.appsScriptUrl) {
    try {
      const url = new URL(CONFIG.appsScriptUrl);
      url.searchParams.set("action", "list");
      url.searchParams.set("sheet", state.currentSheetName);
      url.searchParams.set("email", state.authorizedEmail);
      if (forceRemoteRefresh) {
        url.searchParams.set("t", Date.now().toString());
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error(`Respuesta no valida del servicio remoto: ${response.status}`);
      }

      const payload = await response.json();
      state.usingRemote = true;
      state.lastLoadUsedFallback = false;
      state.monthNotEnabled = false;
      return payload;
    } catch (error) {
      console.warn("Fallo la carga remota. Se usara el respaldo local.", error);
    }
  }

  // Solo usamos el respaldo embebido para la hoja por defecto.
  // Si el usuario cambia a otro mes y la conexion remota falla,
  // devolvemos un dataset vacio para no mezclar datos de otra hoja.
  if (state.currentSheetName !== CONFIG.defaultSheetName) {
    state.usingRemote = false;
    state.lastLoadUsedFallback = Boolean(CONFIG.appsScriptUrl);
    state.monthNotEnabled = true;
    return {
      success: true,
      metadata: {
        activeSheetName: state.currentSheetName,
        departamento: "",
        mesNotificacion: formatSheetLabel(state.currentSheetName),
        numeroUpgd: "",
        fechaNotificacion: "",
        oportunidad: ""
      },
      rows: [],
      accessDenied: false
    };
  }

  throw new Error("No fue posible validar el correo autorizado porque la conexion con Google Sheets fallo.");
}

function normalizeRows(rows) {
  return rows.map((row, index) => ({
    rowNumber: row.rowNumber || index + 1,
    institution: (row.institution || "").trim(),
    feedback: (row.feedback || "").trim(),
    observation: row.observation || "",
    supportUrl: row.supportUrl || "",
    supportName: row.supportName || "",
    selectedFileName: "",
    supportMessage: "",
    isSaving: false,
    isUploading: false,
    statusText: row.observation ? "Observacion cargada." : "Sin observacion registrada."
  }));
}

function renderMetadata() {
  const metadata = state.metadata || {};
  els.metaDepartamento.textContent = metadata.departamento || "Sin dato";
  els.metaMes.textContent = metadata.mesNotificacion || "Sin dato";
  els.metaUpgd.textContent = metadata.numeroUpgd || "Sin dato";
  els.metaFecha.textContent = metadata.fechaNotificacion || "Sin dato";
  els.metaOportunidad.textContent = metadata.oportunidad || "Sin dato";
  if (metadata.activeSheetName && CONFIG.availableSheets.includes(metadata.activeSheetName)) {
    state.currentSheetName = metadata.activeSheetName;
    els.sheetSelect.value = metadata.activeSheetName;
  }
}

function updateAccessBanner(message) {
  if (!els.accessBannerText) {
    return;
  }

  els.accessBannerText.textContent = message;
}

function renderRows() {
  if (!state.filteredRows.length) {
    renderEmpty(
      state.monthNotEnabled
        ? "Este mes todavia no esta habilitado."
        : state.editingLocked
          ? `No hay instituciones para mostrar. Edicion cerrada hasta ${formatDeadlineForDisplay(state.activeDeadline)}.`
        : "No hay instituciones para mostrar con el filtro actual."
    );
    return;
  }

  const html = state.filteredRows.map(row => {
    const saveLabel = state.editingLocked ? "Bloqueado" : row.isSaving ? "Guardando..." : "Guardar";
    const statusClass = row.isSaving ? "pending" : row.observation.trim() ? "success" : "";
    const supportInputId = getSupportInputId(row);

    return `
      <tr data-row-key="${escapeHtml(getRowKey(row))}">
        <td class="cell-institution">${escapeHtml(row.institution)}</td>
        <td class="cell-feedback">${escapeHtml(row.feedback).replace(/\n/g, "<br>")}</td>
        <td class="cell-observation">
          <textarea
            class="row-observation"
            data-role="observation"
            data-row-key="${escapeHtml(getRowKey(row))}"
            placeholder="Escribe aqui las observaciones de la UPGD..."
            ${state.editingLocked ? "disabled" : ""}
          >${escapeHtml(row.observation)}</textarea>
          <div class="row-status ${statusClass}" data-role="status" data-row-key="${escapeHtml(getRowKey(row))}">
            ${escapeHtml(state.editingLocked ? `Edicion cerrada. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.` : row.statusText)}
          </div>
        </td>
        <td class="cell-support">
          <div class="support-panel">
            <input
              type="file"
              class="support-input support-input-hidden"
              id="${escapeHtml(supportInputId)}"
              data-role="file"
              data-row-key="${escapeHtml(getRowKey(row))}"
              accept="${escapeHtml(getAllowedExtensionsAccept())}"
              ${state.editingLocked ? "disabled" : ""}
            />
            <label
              class="support-picker ${state.editingLocked ? "support-picker-disabled" : ""}"
              for="${escapeHtml(supportInputId)}"
            >
              <span class="support-picker-main">Seleccionar archivo</span>
              <span class="support-picker-note">Solo archivos .SIR, .DBF o con letras de la institucion.</span>
            </label>
            <input
              type="text"
              class="support-filename-field"
              data-row-key="${escapeHtml(getRowKey(row))}"
              value="${escapeHtml(row.selectedFileName || row.supportName || "Sin archivo cargado.")}"
              readonly
            />
            <button
              type="button"
              class="support-button"
              data-role="upload"
              data-row-key="${escapeHtml(getRowKey(row))}"
              ${row.isUploading || state.editingLocked ? "disabled" : ""}
            >${row.isUploading ? "Subiendo..." : "Subir soporte"}</button>
            ${row.supportUrl ? `<div class="support-badge">Soporte cargado</div>` : ""}
            <div class="support-error" data-row-key="${escapeHtml(getRowKey(row))}" style="${row.supportMessage ? "" : "display:none;"}">${escapeHtml(row.supportMessage || "")}</div>
          </div>
        </td>
        <td>
          <button
            type="button"
            class="save-button"
            data-role="save"
            data-row-key="${escapeHtml(getRowKey(row))}"
            ${row.isSaving || state.editingLocked ? "disabled" : ""}
          >${saveLabel}</button>
        </td>
      </tr>
    `;
  }).join("");

  els.tablaRetroBody.innerHTML = html;
  bindRowEvents();
  autoResizeAllTextareas();
}

function bindRowEvents() {
  if (state.editingLocked) {
    return;
  }

  els.tablaRetroBody.querySelectorAll('[data-role="upload"]').forEach(button => {
    button.addEventListener("click", () => uploadSupport(button.dataset.rowKey));
  });

  els.tablaRetroBody.querySelectorAll('[data-role="file"]').forEach(input => {
    input.addEventListener("change", event => {
      const row = state.rows.find(item => getRowKey(item) === input.dataset.rowKey);
      if (!row) {
        return;
      }

      const file = event.target.files && event.target.files[0];
      if (file && !isAllowedUploadFile(file.name)) {
        event.target.value = "";
        row.selectedFileName = "";
        row.supportMessage = "Archivo no permitido. Solo se reciben .SIR, .DBF o archivos con letras de la institucion.";
        syncFilteredRow(row);
        updateSupportUi(row);
        return;
      }

      row.selectedFileName = file ? file.name : "";
      row.supportMessage = "";
      syncFilteredRow(row);
      updateSupportUi(row);
    });
  });

  els.tablaRetroBody.querySelectorAll('[data-role="save"]').forEach(button => {
    button.addEventListener("click", () => saveRow(button.dataset.rowKey));
  });

  els.tablaRetroBody.querySelectorAll('[data-role="observation"]').forEach(textarea => {
    textarea.addEventListener("input", event => {
      const row = state.rows.find(item => getRowKey(item) === textarea.dataset.rowKey);
      if (!row) {
        return;
      }

      row.observation = event.target.value;
      row.statusText = "Cambios pendientes por guardar.";
      syncFilteredRow(row);
      updateRowStatus(row, "pending");
      autoResizeTextarea(textarea);
    });
  });
}

function syncFilteredRow(sourceRow) {
  state.filteredRows = state.filteredRows.map(row => (
    getRowKey(row) === getRowKey(sourceRow) ? sourceRow : row
  ));
}

function handleSearch(event) {
  const query = (event.target.value || "").trim().toLowerCase();

  if (!query) {
    state.filteredRows = [...state.rows];
    renderRows();
    return;
  }

  state.filteredRows = state.rows.filter(row => {
    const joined = `${row.institution} ${row.feedback} ${row.observation}`.toLowerCase();
    return joined.includes(query);
  });

  renderRows();
}

async function saveRow(rowKey) {
  if (state.editingLocked) {
    setScreenStatus(`Edicion deshabilitada para ${formatSheetLabel(state.currentSheetName)}. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.`);
    return;
  }

  const row = state.rows.find(item => getRowKey(item) === rowKey);
  if (!row) {
    return;
  }

  row.isSaving = true;
  row.statusText = "Guardando cambios...";
  syncFilteredRow(row);
  renderRows();

  try {
    if (state.usingRemote) {
      await saveObservationRemote(row);
    } else {
      saveObservationLocal(row);
    }

    row.statusText = "Observacion guardada correctamente.";
  } catch (error) {
    console.error("Error guardando observacion:", error);
    row.statusText = "No se pudo guardar la observacion.";
  } finally {
    row.isSaving = false;
    syncFilteredRow(row);
    renderRows();
  }
}

async function saveObservationRemote(row) {
  const response = await fetch(CONFIG.appsScriptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "saveObservation",
      sheetName: state.currentSheetName,
      email: state.authorizedEmail,
      rowNumber: row.rowNumber,
      institution: row.institution,
      observation: row.observation
    })
  });

  if (!response.ok) {
    throw new Error(`Respuesta no valida al guardar: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.message || "No fue posible guardar la observacion.");
  }

  if (payload.supportUrl) {
    row.supportUrl = payload.supportUrl;
  }
}

function saveObservationLocal(row) {
  const savedMap = getLocalObservationMap();
  savedMap[getRowKey(row)] = row.observation;
  localStorage.setItem(getLocalStorageKey(), JSON.stringify(savedMap));
}

function getLocalObservationMap() {
  try {
    const raw = localStorage.getItem(getLocalStorageKey());
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("No fue posible leer localStorage:", error);
    return {};
  }
}

function getLocalStorageKey() {
  return `${CONFIG.localStorageKey}::${state.currentSheetName}`;
}

async function uploadSupport(rowKey) {
  if (state.editingLocked) {
    setScreenStatus(`Edicion deshabilitada para ${formatSheetLabel(state.currentSheetName)}. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.`);
    return;
  }

  if (!state.usingRemote) {
    setScreenStatus("La carga de soportes solo esta disponible con Google Sheets conectado.");
    return;
  }

  const row = state.rows.find(item => getRowKey(item) === rowKey);
  if (!row) {
    return;
  }

  const fileInput = els.tablaRetroBody.querySelector(`[data-role="file"][data-row-key="${CSS.escape(rowKey)}"]`);
  const file = fileInput && fileInput.files && fileInput.files[0];

  if (!file) {
    row.supportMessage = "Selecciona un archivo antes de subir el soporte.";
    syncFilteredRow(row);
    updateSupportUi(row);
    return;
  }

  if (!isAllowedUploadFile(file.name)) {
    row.supportMessage = "Archivo no permitido. Solo se reciben .SIR, .DBF o archivos con letras de la institucion.";
    syncFilteredRow(row);
    updateSupportUi(row);
    return;
  }

  const maxBytes = CONFIG.maxUploadSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    setScreenStatus(`El archivo supera el limite de ${CONFIG.maxUploadSizeMb} MB.`);
    return;
  }

  row.isUploading = true;
  row.selectedFileName = file.name;
  row.supportMessage = "";
  syncFilteredRow(row);
  renderRows();

  try {
    const base64Data = await fileToBase64(file);
    const payload = await uploadSupportRemote(row, file, base64Data);
    row.supportUrl = payload.supportUrl || row.supportUrl;
    row.supportName = payload.supportName || file.name;
    row.selectedFileName = row.supportName;
    row.supportMessage = "";
    setScreenStatus(`Soporte cargado correctamente para ${row.institution}.`);
  } catch (error) {
    console.error("Error subiendo soporte:", error);
    row.supportMessage = error.message || "No fue posible subir el soporte.";
  } finally {
    row.isUploading = false;
    syncFilteredRow(row);
    renderRows();
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("No fue posible leer el archivo seleccionado."));
    reader.readAsDataURL(file);
  });
}

async function uploadSupportRemote(row, file, base64Data) {
  const response = await fetch(CONFIG.appsScriptUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action: "uploadSupport",
      sheetName: state.currentSheetName,
      email: state.authorizedEmail,
      rowNumber: row.rowNumber,
      institution: row.institution,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      base64Data
    })
  });

  if (!response.ok) {
    throw new Error(`Respuesta no valida al subir soporte: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.message || "No fue posible subir el soporte.");
  }

  return payload;
}

function getFileExtension(fileName) {
  const match = String(fileName || "").trim().match(/\.([A-Za-z0-9]+)$/);
  return match ? match[1].toUpperCase() : "";
}

function isAllowedUploadFile(fileName) {
  const extension = getFileExtension(fileName);
  return Boolean(extension) && CONFIG.allowedUploadExtensions.includes(extension);
}

function getAllowedExtensionsAccept() {
  return CONFIG.allowedUploadExtensions.map(ext => `.${ext.toLowerCase()}`).join(",");
}

function getSupportInputId(row) {
  return `support-file-${row.rowNumber}`;
}

function formatSheetLabel(sheetName) {
  return String(sheetName || "")
    .replace(/_/g, " ")
    .toUpperCase();
}

function refreshEditingRules() {
  const deadline = CONFIG.editDeadlines[state.currentSheetName] || "";
  state.activeDeadline = deadline;
  state.editingLocked = isEditingLocked(deadline);
}

function isEditingLocked(deadline) {
  if (!deadline) {
    return false;
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayString = `${year}-${month}-${day}`;
  return todayString > deadline;
}

function formatDeadlineForDisplay(deadline) {
  if (!deadline) {
    return "sin fecha limite";
  }

  const match = String(deadline).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return deadline;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function updateRowStatus(row, className) {
  const statusNode = els.tablaRetroBody.querySelector(`[data-role="status"][data-row-key="${CSS.escape(getRowKey(row))}"]`);
  if (!statusNode) {
    return;
  }

  statusNode.textContent = row.statusText;
  statusNode.className = `row-status ${className || ""}`.trim();
}

function updateBackendBadge() {
  if (state.usingRemote) {
    els.backendBadge.textContent = "Google Sheets";
    return;
  }

  els.backendBadge.textContent = state.lastLoadUsedFallback ? "Respaldo local" : "Modo local";
}

function setScreenStatus(message) {
  els.statusMessage.textContent = message;
}

function toggleReload(disabled) {
  els.btnRecargar.disabled = disabled;
}

function renderEmpty(message) {
  els.tablaRetroBody.innerHTML = `
    <tr>
      <td colspan="5" class="empty-state">${escapeHtml(message)}</td>
    </tr>
  `;
}

function getRowKey(row) {
  return `${row.rowNumber}::${row.institution}`;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function autoResizeAllTextareas() {
  els.tablaRetroBody.querySelectorAll(".row-observation").forEach(autoResizeTextarea);
}

function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 128)}px`;
}

function updateSupportUi(row) {
  const rowKey = getRowKey(row);
  const fileNameField = els.tablaRetroBody.querySelector(`.support-filename-field[data-row-key="${CSS.escape(rowKey)}"]`);
  if (fileNameField) {
    fileNameField.value = row.selectedFileName || row.supportName || "Sin archivo cargado.";
  }

  const errorNode = els.tablaRetroBody.querySelector(`.support-error[data-row-key="${CSS.escape(rowKey)}"]`);
  if (errorNode) {
    errorNode.textContent = row.supportMessage || "";
    errorNode.style.display = row.supportMessage ? "block" : "none";
  }
}

function getAuthorizedEmailFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeEmail(params.get("email") || "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
