const CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbyqjkcbhWoiGCR3yMjH8zwKCpW6dS2uJ7uSak8ikJnTrnGwxVsmmCOgo-9HNp6FVzm2/exec",
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
    ENERO_2026: "2026-05-05",
    FEBRERO_2026: "2026-05-16",
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
    const isReadOnlyGlobal = Boolean(payload.readOnlyGlobal);
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
    } else if (isReadOnlyGlobal) {
      updateAccessBanner(`Correo autorizado: ${state.authorizedEmail}.`);
      setScreenStatus(`Acceso global de solo lectura activo. Se cargaron ${state.rows.length} instituciones.`);
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
    labResponse: row.labResponse || "",
    supportUrl: row.supportUrl || "",
    supportName: row.supportName || "",
    canEditObservation: Boolean(row.canEditObservation),
    canEditLabResponse: Boolean(row.canEditLabResponse),
    canUploadSupport: row.canUploadSupport !== false && Boolean(row.canEditObservation),
    selectedFileName: "",
    supportMessage: "",
    isSaving: false,
    isUploading: false,
    isGeneratingPdf: false,
    observationStatusText: getFieldInitialStatusText("observation", row),
    labResponseStatusText: getFieldInitialStatusText("labResponse", row)
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
    const observationStatusClass = getFieldStatusClass(row.observationStatusText, row.observation);
    const labResponseStatusClass = getFieldStatusClass(row.labResponseStatusText, row.labResponse);
    const supportInputId = getSupportInputId(row);
    const observationDisabled = state.editingLocked || !row.canEditObservation;
    const labResponseDisabled = state.editingLocked || !row.canEditLabResponse;
    const supportDisabled = state.editingLocked || !row.canUploadSupport;
    const saveDisabled = state.editingLocked || row.isSaving || !canSaveRow(row);

    return `
      <tr data-row-key="${escapeHtml(getRowKey(row))}">
        <td class="cell-institution">${escapeHtml(row.institution)}</td>
        <td class="cell-feedback">${escapeHtml(row.feedback).replace(/\n/g, "<br>")}</td>
        <td class="cell-observation">
          <textarea
            class="row-textarea row-observation"
            data-role="observation"
            data-row-key="${escapeHtml(getRowKey(row))}"
            placeholder="Escribe aqui las observaciones de epidemiologia..."
            ${observationDisabled ? "disabled" : ""}
          >${escapeHtml(row.observation)}</textarea>
          <div class="row-status ${observationStatusClass}" data-role="observationStatus" data-row-key="${escapeHtml(getRowKey(row))}">
            ${escapeHtml(getRenderedFieldStatusText(row, "observation"))}
          </div>
        </td>
        <td class="cell-lab-response">
          <textarea
            class="row-textarea row-lab-response"
            data-role="labResponse"
            data-row-key="${escapeHtml(getRowKey(row))}"
            placeholder="Escribe aqui las observaciones de laboratorio..."
            ${labResponseDisabled ? "disabled" : ""}
          >${escapeHtml(row.labResponse)}</textarea>
          <div class="row-status ${labResponseStatusClass}" data-role="labResponseStatus" data-row-key="${escapeHtml(getRowKey(row))}">
            ${escapeHtml(getRenderedFieldStatusText(row, "labResponse"))}
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
              ${supportDisabled ? "disabled" : ""}
            />
            <label
              class="support-picker ${supportDisabled ? "support-picker-disabled" : ""}"
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
              ${row.isUploading || row.isGeneratingPdf || supportDisabled ? "disabled" : ""}
            >${row.isUploading ? "Subiendo..." : "Subir soporte"}</button>
            <button
              type="button"
              class="support-button support-button-secondary"
              data-role="generatePdf"
              data-row-key="${escapeHtml(getRowKey(row))}"
              ${row.isGeneratingPdf || row.isUploading || supportDisabled ? "disabled" : ""}
            >${row.isGeneratingPdf ? "Generando..." : "Generar PDF"}</button>
            ${row.supportUrl ? `<div class="support-badge">Soporte cargado</div>` : ""}
            <div class="support-error" data-row-key="${escapeHtml(getRowKey(row))}" style="${getSupportMessage(row) ? "" : "display:none;"}">${escapeHtml(getSupportMessage(row))}</div>
          </div>
        </td>
        <td>
          <button
            type="button"
            class="save-button"
            data-role="save"
            data-row-key="${escapeHtml(getRowKey(row))}"
            ${saveDisabled ? "disabled" : ""}
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

  els.tablaRetroBody.querySelectorAll('[data-role="generatePdf"]').forEach(button => {
    button.addEventListener("click", () => generatePdfSupport(button.dataset.rowKey));
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
      if (!row || !row.canEditObservation) {
        return;
      }

      row.observation = event.target.value;
      row.observationStatusText = "Cambios pendientes por guardar.";
      syncFilteredRow(row);
      updateFieldStatus(row, "observation", "pending");
      autoResizeTextarea(textarea);
    });
  });

  els.tablaRetroBody.querySelectorAll('[data-role="labResponse"]').forEach(textarea => {
    textarea.addEventListener("input", event => {
      const row = state.rows.find(item => getRowKey(item) === textarea.dataset.rowKey);
      if (!row || !row.canEditLabResponse) {
        return;
      }

      row.labResponse = event.target.value;
      row.labResponseStatusText = "Cambios pendientes por guardar.";
      syncFilteredRow(row);
      updateFieldStatus(row, "labResponse", "pending");
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
    const joined = `${row.institution} ${row.feedback} ${row.observation} ${row.labResponse}`.toLowerCase();
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

  if (!canSaveRow(row)) {
    setScreenStatus("Este correo solo tiene permiso de lectura para esta fila.");
    return;
  }

  row.isSaving = true;
  if (row.canEditObservation) {
    row.observationStatusText = "Guardando cambios...";
  }
  if (row.canEditLabResponse) {
    row.labResponseStatusText = "Guardando cambios...";
  }
  syncFilteredRow(row);
  renderRows();

  try {
    if (state.usingRemote) {
      await saveObservationRemote(row);
    } else {
      saveObservationLocal(row);
    }

    if (row.canEditObservation) {
      row.observationStatusText = getSavedFieldStatusText(row.observation);
    }
    if (row.canEditLabResponse) {
      row.labResponseStatusText = getSavedFieldStatusText(row.labResponse);
    }
  } catch (error) {
    console.error("Error guardando observacion:", error);
    if (row.canEditObservation) {
      row.observationStatusText = "No se pudo guardar la informacion.";
    }
    if (row.canEditLabResponse) {
      row.labResponseStatusText = "No se pudo guardar la informacion.";
    }
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
      observation: row.observation,
      labResponse: row.labResponse
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
  savedMap[getRowKey(row)] = {
    observation: row.canEditObservation ? row.observation : "",
    labResponse: row.canEditLabResponse ? row.labResponse : ""
  };
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

  if (!row.canUploadSupport) {
    row.supportMessage = "Solo el correo autorizado por UPGD puede cargar soportes.";
    syncFilteredRow(row);
    updateSupportUi(row);
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

function getSavedFieldStatusText(value) {
  return String(value || "").trim() ? "Informacion cargada." : "Sin informacion registrada.";
}

function getFieldInitialStatusText(fieldName, row) {
  if (!canEditField(row, fieldName)) {
    return getReadOnlyFieldStatusText(fieldName);
  }

  const value = fieldName === "labResponse" ? row.labResponse : row.observation;
  return getSavedFieldStatusText(value);
}

function getRenderedFieldStatusText(row, fieldName) {
  if (state.editingLocked) {
    return `Edicion cerrada. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.`;
  }

  if (!canEditField(row, fieldName)) {
    return getReadOnlyFieldStatusText(fieldName);
  }

  return fieldName === "labResponse" ? row.labResponseStatusText : row.observationStatusText;
}

function getReadOnlyFieldStatusText(fieldName) {
  return fieldName === "labResponse"
    ? "Solo lectura. Este campo lo edita laboratorio."
    : "Solo lectura. Este campo lo edita la UPGD.";
}

function canEditField(row, fieldName) {
  return fieldName === "labResponse" ? row.canEditLabResponse : row.canEditObservation;
}

function canSaveRow(row) {
  return Boolean(row && (row.canEditObservation || row.canEditLabResponse));
}

function getSupportMessage(row) {
  if (row.supportMessage) {
    return row.supportMessage;
  }

  if (!state.editingLocked && !row.canUploadSupport) {
    return "Solo el correo autorizado por UPGD puede cargar soportes.";
  }

  return "";
}

async function generatePdfSupport(rowKey) {
  if (state.editingLocked) {
    setScreenStatus(`Edicion deshabilitada para ${formatSheetLabel(state.currentSheetName)}. Fecha limite: ${formatDeadlineForDisplay(state.activeDeadline)}.`);
    return;
  }

  const row = state.rows.find(item => getRowKey(item) === rowKey);
  if (!row) {
    return;
  }

  row.isGeneratingPdf = true;
  row.supportMessage = "Generando PDF de soporte...";
  syncFilteredRow(row);
  renderRows();

  try {
    const currentRow = getCurrentRowValues(row);
    Object.assign(row, currentRow);
    const fileName = buildPdfFileName(row);
    await downloadSupportPdfFromCurrentPage(row, fileName);
    row.supportName = fileName;
    row.selectedFileName = row.supportName;
    row.supportMessage = "PDF generado y descargado.";
    setScreenStatus(`PDF descargado para ${row.institution}.`);
  } catch (error) {
    console.error("Error generando PDF:", error);
    row.supportMessage = error.message || "No fue posible generar el PDF.";
  } finally {
    row.isGeneratingPdf = false;
    syncFilteredRow(row);
    renderRows();
  }
}

function getCurrentRowValues(row) {
  const rowKey = getRowKey(row);
  const observationNode = els.tablaRetroBody.querySelector(`[data-role="observation"][data-row-key="${CSS.escape(rowKey)}"]`);
  const labResponseNode = els.tablaRetroBody.querySelector(`[data-role="labResponse"][data-row-key="${CSS.escape(rowKey)}"]`);

  return {
    ...row,
    observation: observationNode ? observationNode.value : row.observation,
    labResponse: labResponseNode ? labResponseNode.value : row.labResponse
  };
}

function buildPdfFileName(row) {
  const baseName = `soporte_${state.currentSheetName}_${row.institution || "institucion"}_${row.rowNumber}`;
  return `${sanitizeFileName(baseName)}.pdf`;
}

async function downloadSupportPdfFromCurrentPage(row, fileName) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error("No se cargo la libreria para descargar PDF. Revisa la conexion a internet e intenta nuevamente.");
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "portrait" });
  await renderSupportPdf(doc, row, fileName);
  doc.save(fileName);
}

function cleanupPrintableSupport() {
  document.body.classList.remove("printing-support");
  const existingPrintArea = document.getElementById("printSupportArea");
  if (existingPrintArea) {
    existingPrintArea.remove();
  }
  const existingPrintStyle = document.getElementById("printSupportStyle");
  if (existingPrintStyle) {
    existingPrintStyle.remove();
  }
}

async function renderSupportPdf(doc, row, fileName) {
  const metadata = state.metadata || {};
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setDrawColor(31, 59, 99);
  doc.setLineWidth(1.3);
  doc.rect(margin, y, contentWidth, pageHeight - margin * 2);

  const logoDataUrl = await getImageDataUrl("IMAGE/encabezado.png");
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", margin + 115, y + 12, 330, 82);
    y += 106;
  } else {
    y += 18;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("RETROALIMENTACIÓN CONTROL DE CALIDAD DE LAS BASES DE DATOS", pageWidth / 2, y, { align: "center" });
  doc.text("WHONET", pageWidth / 2, y + 14, { align: "center" });
  y += 32;

  y = drawMetadataTable(doc, metadata, margin + 12, y, contentWidth - 24);
  y += 10;

  y = drawFeedbackTable(doc, row, margin + 12, y, contentWidth - 24, pageHeight - margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(`Archivo sugerido: ${fileName} | Generado: ${formatPdfDate(new Date())}`, pageWidth - margin - 12, pageHeight - margin - 8, { align: "right" });
}

function drawMetadataTable(doc, metadata, x, y, width) {
  const labels = [
    "DEPARTAMENTO",
    "MES DE NOTIFICACIÓN",
    "NO. UPGD QUE NOTIFICAN",
    "FECHA DE NOTIFICACIÓN",
    "OPORTUNIDAD EN EL TIEMPO DE NOTIFICACIÓN"
  ];
  const values = [
    metadata.departamento || "Sin dato",
    metadata.mesNotificacion || "Sin dato",
    metadata.numeroUpgd || "Sin dato",
    metadata.fechaNotificacion || "Sin dato",
    metadata.oportunidad || "Sin dato"
  ];
  const labelWidth = width * 0.32;
  const valueWidth = width - labelWidth;
  const rowHeight = 18;

  doc.setLineWidth(0.7);
  labels.forEach((label, index) => {
    const rowY = y + index * rowHeight;
    doc.setFillColor(255, 255, 255);
    doc.rect(x, rowY, labelWidth, rowHeight, "FD");
    doc.setFillColor(169, 196, 230);
    doc.rect(x + labelWidth, rowY, valueWidth, rowHeight, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(0, 0, 0);
    doc.text(wrapPdfLine(doc, label, labelWidth - 8), x + labelWidth / 2, rowY + 11, { align: "center" });
    doc.text(wrapPdfLine(doc, values[index], valueWidth - 8), x + labelWidth + valueWidth / 2, rowY + 11, { align: "center" });
  });

  return y + labels.length * rowHeight;
}

function drawFeedbackTable(doc, row, x, y, width, bottomLimit) {
  const columns = [
    { title: "INSTITUCIÓN", value: row.institution || "Sin dato", width: width * 0.19 },
    { title: "RETROALIMENTACIÓN DE LAS VARIABLES A EVALUAR", value: row.feedback || "Sin información registrada.", width: width * 0.31 },
    { title: "OBSERVACIONES DE EPIDEMIOLOGIA", value: row.observation || "Sin información registrada.", width: width * 0.25 },
    { title: "OBSERVACIONES DE LABORATORIO", value: row.labResponse || "Sin información registrada.", width: width * 0.25 }
  ];
  const headerHeight = 28;
  const bodyMinHeight = 96;
  const bodyY = y + headerHeight;
  const bodyHeight = Math.max(bodyMinHeight, bottomLimit - bodyY - 22);
  let currentX = x;

  doc.setLineWidth(0.7);
  columns.forEach(column => {
    doc.setFillColor(22, 57, 98);
    doc.rect(currentX, y, column.width, headerHeight, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.3);
    doc.setTextColor(255, 255, 255);
    const titleLines = doc.splitTextToSize(column.title, column.width - 8);
    doc.text(titleLines, currentX + column.width / 2, y + 10, { align: "center" });

    doc.setFillColor(255, 255, 255);
    doc.rect(currentX, bodyY, column.width, bodyHeight, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(0, 0, 0);
    const textLines = doc.splitTextToSize(String(column.value), column.width - 8);
    doc.text(textLines, currentX + 4, bodyY + 11);
    currentX += column.width;
  });

  return bodyY + bodyHeight;
}

function wrapPdfLine(doc, text, maxWidth) {
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  return lines.length > 1 ? lines : String(text || "");
}

async function getImageDataUrl(path) {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = new URL(path, window.location.href).href;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.warn("No fue posible cargar el encabezado para el PDF:", error);
    return "";
  }
}

function buildPrintableSupportMarkup(row, fileName) {
  const metadata = state.metadata || {};
  const generatedAt = formatPdfDate(new Date());
  const logoUrl = new URL("IMAGE/encabezado.png", window.location.href).href;

  return `
    <style id="printSupportStyle">
      @page {
        size: letter;
        margin: 8mm;
      }

      #printSupportArea,
      #printSupportArea * {
        box-sizing: border-box;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      #printSupportArea {
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        z-index: 999999;
        width: 760px;
        margin: 0;
        font-family: Arial, sans-serif;
        background: #fff;
        color: #000;
        font-size: 10.5px;
        line-height: 1.25;
        box-shadow: 0 0 0 9999px #fff;
      }

      body.printing-support {
        overflow: hidden;
      }

      body.printing-support > :not(#printSupportArea):not(#printSupportStyle) {
        visibility: hidden;
      }

      #printSupportArea .sheet-card {
        width: 100%;
        max-width: 100%;
        border: 2px solid #1f3b63;
        background: #fff;
        overflow: hidden;
      }

      #printSupportArea .hero {
        padding: 8px 10px 6px;
        background: #fff;
      }

      #printSupportArea .hero-logo {
        display: block;
        max-width: 430px;
        width: 100%;
        height: auto;
        margin: 0 auto 6px;
        object-fit: contain;
      }

      #printSupportArea .hero h1 {
        margin: 0;
        color: #000;
        font-size: 14px;
        line-height: 1.25;
        text-align: center;
        text-transform: uppercase;
      }

      #printSupportArea .meta-board {
        display: grid;
        grid-template-columns: 32% 68%;
        margin: 8px 10px 10px;
      }

      #printSupportArea .meta-labels,
      #printSupportArea .meta-values {
        display: grid;
      }

      #printSupportArea .meta-label-cell,
      #printSupportArea .meta-value-cell {
        min-height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 3px 6px;
        border: 1px solid #000;
        font-size: 9.5px;
        font-weight: 700;
        line-height: 1.15;
        text-align: center;
        text-transform: uppercase;
      }

      #printSupportArea .meta-label-cell {
        background: #ffffff;
        border-right: 0;
      }

      #printSupportArea .meta-value-cell {
        background: #a9c4e6;
      }

      #printSupportArea .table-panel {
        padding: 0 10px 10px;
      }

      #printSupportArea table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      #printSupportArea th,
      #printSupportArea td {
        border: 1px solid #111;
        padding: 5px 5px;
        vertical-align: top;
        background: #fff;
        font-size: 9.5px;
        word-break: break-word;
      }

      #printSupportArea th {
        background: #163962;
        color: #fff;
        font-weight: 700;
        text-align: center;
        text-transform: uppercase;
      }

      #printSupportArea .col-institution {
        width: 19%;
      }

      #printSupportArea .col-feedback {
        width: 31%;
      }

      #printSupportArea .col-observation {
        width: 25%;
      }

      #printSupportArea .col-lab {
        width: 25%;
      }

      #printSupportArea .cell-text {
        min-height: 96px;
        white-space: pre-wrap;
      }

      #printSupportArea .footer {
        padding: 0 10px 10px;
        color: #555;
        font-size: 8.5px;
        text-align: right;
      }

      @media print {}
    </style>
    <div id="printSupportArea">
      <main class="sheet-card">
        <header class="hero">
          <img src="${escapeHtml(logoUrl)}" alt="Salud e Instituto Nacional de Salud" class="hero-logo" />
          <h1>Retroalimentación control de calidad de las bases de datos WHONET</h1>
        </header>

        <section class="meta-board">
          <div class="meta-labels">
            <div class="meta-label-cell">Departamento</div>
            <div class="meta-label-cell">Mes de notificación</div>
            <div class="meta-label-cell">No. UPGD que notifican</div>
            <div class="meta-label-cell">Fecha de notificación</div>
            <div class="meta-label-cell">Oportunidad en el tiempo de notificación</div>
          </div>
          <div class="meta-values">
            <div class="meta-value-cell">${escapeHtml(metadata.departamento || "Sin dato")}</div>
            <div class="meta-value-cell">${escapeHtml(metadata.mesNotificacion || "Sin dato")}</div>
            <div class="meta-value-cell">${escapeHtml(metadata.numeroUpgd || "Sin dato")}</div>
            <div class="meta-value-cell">${escapeHtml(metadata.fechaNotificacion || "Sin dato")}</div>
            <div class="meta-value-cell">${escapeHtml(metadata.oportunidad || "Sin dato")}</div>
          </div>
        </section>

        <section class="table-panel">
          <table>
            <thead>
              <tr>
                <th class="col-institution">Institución</th>
                <th class="col-feedback">Retroalimentación de las variables a evaluar</th>
                <th class="col-observation">Observaciones de epidemiologia</th>
                <th class="col-lab">Observaciones de laboratorio</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${escapeHtml(row.institution || "Sin dato")}</td>
                <td class="cell-text">${escapeHtml(row.feedback || "Sin información registrada.")}</td>
                <td class="cell-text">${escapeHtml(row.observation || "Sin información registrada.")}</td>
                <td class="cell-text">${escapeHtml(row.labResponse || "Sin información registrada.")}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <div class="footer">Archivo sugerido: ${escapeHtml(fileName)} | Generado: ${escapeHtml(generatedAt)}</div>
      </main>
    </div>
  `;
}

function buildPrintableSupportHtml(row, fileName) {
  const metadata = state.metadata || {};
  const generatedAt = formatPdfDate(new Date());
  const logoUrl = new URL("IMAGE/encabezado.png", window.location.href).href;

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>${escapeHtml(fileName)}</title>
      <style>
        @page {
          size: letter;
          margin: 16mm;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #fff;
          color: #111;
          font-size: 12px;
          line-height: 1.4;
        }

        .sheet-card {
          width: 100%;
          border: 2px solid #1f3b63;
        }

        .hero {
          padding: 12px 16px 8px;
          background: #fff;
        }

        .hero-logo {
          display: block;
          max-width: 440px;
          width: 100%;
          height: auto;
          margin: 0 auto 10px;
          object-fit: contain;
        }

        .hero h1 {
          margin: 0;
          font-size: 17px;
          line-height: 1.25;
          text-align: center;
          text-transform: uppercase;
        }

        .meta-board {
          display: grid;
          grid-template-columns: 32% 68%;
          gap: 0;
          margin: 10px 16px 12px;
        }

        .meta-labels,
        .meta-values {
          display: grid;
        }

        .meta-label-cell,
        .meta-value-cell {
          min-height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px 8px;
          border: 1px solid #000;
          font-size: 11px;
          line-height: 1.15;
          text-transform: uppercase;
          text-align: center;
        }

        .meta-label-cell {
          background: #fff;
          font-weight: 700;
          border-right: 0;
        }

        .meta-value-cell {
          background: #a9c4e6;
          font-weight: 700;
        }

        .table-panel {
          padding: 0 16px 16px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        th,
        td {
          border: 1px solid #111;
          padding: 7px 6px;
          vertical-align: top;
          font-size: 11px;
          background: #fff;
          word-break: break-word;
        }

        th {
          background: #163962;
          color: #fff;
          font-weight: 700;
          text-align: center;
          text-transform: uppercase;
        }

        .col-institution {
          width: 18%;
        }

        .col-feedback {
          width: 28%;
        }

        .col-observation {
          width: 21%;
        }

        .col-lab {
          width: 21%;
        }

        .col-support {
          width: 12%;
        }

        .cell-text {
          white-space: pre-wrap;
          min-height: 110px;
        }

        .footer {
          padding: 0 16px 14px;
          color: #555;
          font-size: 10px;
          text-align: right;
        }

        .print-actions {
          margin: 0 0 14px;
          text-align: right;
        }

        .print-actions button {
          min-height: 36px;
          padding: 8px 14px;
          border: 0;
          border-radius: 6px;
          background: #163962;
          color: #fff;
          font-weight: 700;
          cursor: pointer;
        }

        @media print {
          .print-actions {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="print-actions">
        <button type="button" onclick="window.print()">Guardar como PDF</button>
      </div>

      <main class="sheet-card">
        <header class="hero">
          <img src="${escapeHtml(logoUrl)}" alt="Salud e Instituto Nacional de Salud" class="hero-logo" />
          <h1>Retroalimentación control de calidad de las bases de datos WHONET</h1>
        </header>

        <section class="meta-board">
          <div class="meta-labels">
            <div class="meta-label-cell">Departamento</div>
            <div class="meta-label-cell">Mes de notificación</div>
            <div class="meta-label-cell">No. UPGD que notifican</div>
            <div class="meta-label-cell">Fecha de notificación</div>
            <div class="meta-label-cell">Oportunidad en el tiempo de notificación</div>
          </div>
          <div class="meta-values">
            <div class="meta-value-cell">${escapeHtml(metadata.departamento || "Sin dato")}</div>
            <div class="meta-value-cell">${escapeHtml(metadata.mesNotificacion || "Sin dato")}</div>
            <div class="meta-value-cell">${escapeHtml(metadata.numeroUpgd || "Sin dato")}</div>
            <div class="meta-value-cell">${escapeHtml(metadata.fechaNotificacion || "Sin dato")}</div>
            <div class="meta-value-cell">${escapeHtml(metadata.oportunidad || "Sin dato")}</div>
          </div>
        </section>

        <section class="table-panel">
          <table>
            <thead>
              <tr>
                <th class="col-institution">Institución</th>
                <th class="col-feedback">Retroalimentación de las variables a evaluar</th>
                <th class="col-observation">Observaciones de epidemiologia</th>
                <th class="col-lab">Observaciones de laboratorio</th>
                <th class="col-support">URL soporte</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${escapeHtml(row.institution || "Sin dato")}</td>
                <td class="cell-text">${escapeHtml(row.feedback || "Sin información registrada.")}</td>
                <td class="cell-text">${escapeHtml(row.observation || "Sin información registrada.")}</td>
                <td class="cell-text">${escapeHtml(row.labResponse || "Sin información registrada.")}</td>
                <td>${escapeHtml(row.supportUrl || "PDF generado desde el formulario")}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <div class="footer">Archivo sugerido: ${escapeHtml(fileName)} | Generado: ${escapeHtml(generatedAt)}</div>
      </main>
      <script>
        window.addEventListener("load", () => setTimeout(() => window.print(), 250));
      </script>
    </body>
    </html>
  `;
}

function normalizePdfText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function sanitizeFileName(value) {
  return normalizePdfText(value)
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "soporte";
}

function formatPdfDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getFieldStatusClass(statusText, value) {
  if (String(statusText || "").includes("Solo lectura")) {
    return "";
  }

  if (String(statusText || "").includes("pendientes") || String(statusText || "").includes("Guardando")) {
    return "pending";
  }

  return String(value || "").trim() ? "success" : "";
}

function updateFieldStatus(row, fieldName, className) {
  const role = fieldName === "labResponse" ? "labResponseStatus" : "observationStatus";
  const statusNode = els.tablaRetroBody.querySelector(`[data-role="${role}"][data-row-key="${CSS.escape(getRowKey(row))}"]`);
  if (!statusNode) {
    return;
  }

  statusNode.textContent = fieldName === "labResponse" ? row.labResponseStatusText : row.observationStatusText;
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
      <td colspan="6" class="empty-state">${escapeHtml(message)}</td>
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
  els.tablaRetroBody.querySelectorAll(".row-textarea").forEach(autoResizeTextarea);
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
    const message = getSupportMessage(row);
    errorNode.textContent = message;
    errorNode.style.display = message ? "block" : "none";
  }
}

function getAuthorizedEmailFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeEmail(params.get("email") || "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}
