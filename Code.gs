const SPREADSHEET_ID = "1Al3rfNNGN9u90GRcM1ludmrSE-1FKMpo863NRs5bm5U";
const DEFAULT_SHEET_NAME = "ENERO_2026";
const DATA_START_ROW = 16;

const META_MAP = {
  departamento: "B9",
  mesNotificacion: "B10",
  numeroUpgd: "B11",
  fechaNotificacion: "B12",
  oportunidad: "B13"
};

const DRIVE_FOLDER_IDS = {
  ENERO: "1bCucxgyksD-8tf66cNaHchlCj1j0IeyE",
  FEBRERO: "1bCucxgyksD-8tf66cNaHchlCj1j0IeyE",
  MARZO: "1__j1EXxgFIDFmeBfYsblNYnFmIMXLCeT",
  ABRIL: "1XFH2oRT8emi9momMOEye5TErfYEk4Ezl",
  MAYO: "1jvki1xYIRgmTNZs2gdTvpwAH1bjNAdnK",
  JUNIO: "1z8Qoa1gMM4IFAKT_8AfVyMJ6w8J4wCNz",
  JULIO: "1ive1d-yxrlq6NjORce2CM994TBOrXQnO",
  AGOSTO: "1EaYtjCDcgHMV0jZSfDX3GXAEXHdyKaNN",
  SEPTIEMBRE: "1_fEquehR5GQfPzc6Tvqm1RA1ouTM-FPs",
  OCTUBRE: "1U_H2ZbfFl_Wi7Q4-p9Wq_lL0DbWugQjj",
  NOVIEMBRE: "1AX9mxLM1crEtBGhLXPiCXV_fOJCgSH0B",
  DICIEMBRE: "1DY3b8D2Kl_CcFPXBOsekVe2fDKA0UYXi"
};

const ALLOWED_UPLOAD_EXTENSIONS = [
  "SIR", "DBF", "COL", "ACP", "BIS", "CCC", "CVC", "CAF", "CSB", "FTI",
  "CPO", "CUC", "CAZ", "CFN", "NCC", "CRS", "CCR", "CLM", "CDM", "ADC",
  "CDO", "CIC", "SML", "JNC", "NOG", "CME", "PRO", "CLN", "NEL", "CLP",
  "CRH", "CPC", "CCO", "COC", "HUS", "HET", "HLV", "HOK", "SCL", "HSB",
  "TRA", "CLS", "FCI", "HLM", "FSC", "HCP", "HIJ", "HMS", "HMC", "HBU",
  "HSR", "FSB", "HUM", "HUN", "HSI", "ICB", "INC", "IIR", "IMC", "CMC",
  "MFI", "MEF", "HSJ", "HDB", "HDS", "HCH", "HDF", "JEG", "IMI", "HDT",
  "SAP", "HEN", "TUN", "UMO", "PSS"
];

const ADMIN_EMAILS = [
  "infeccionesasociadassaludiaas@gmail.com"
];

function getSheetName_(sheetName) {
  const cleaned = String(sheetName || "").trim();
  return cleaned || DEFAULT_SHEET_NAME;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_(sheetName) {
  const spreadsheet = getSpreadsheet_();
  const targetSheetName = getSheetName_(sheetName);
  const sheet = spreadsheet.getSheetByName(targetSheetName);

  if (!sheet) {
    throw new Error(`No existe la hoja ${targetSheetName}.`);
  }

  return sheet;
}

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "list";
  const sheetName = (e && e.parameter && e.parameter.sheet) || DEFAULT_SHEET_NAME;
  const email = normalizeEmail_((e && e.parameter && e.parameter.email) || "");

  if (action === "list") {
    return jsonOutput(buildDataset_(sheetName, email));
  }

  if (action === "validateEmail") {
    return jsonOutput(validateEmailAccess_(email));
  }

  return jsonOutput({
    success: false,
    message: "Accion no soportada."
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = payload.action || "";

    if (action === "saveObservation") {
      return saveObservation_(payload);
    }

    if (action === "uploadSupport") {
      return uploadSupport_(payload);
    }

    return jsonOutput({
      success: false,
      message: "Accion no soportada."
    });
  } catch (error) {
    return jsonOutput({
      success: false,
      message: error.message || "No fue posible procesar la solicitud."
    });
  }
}

function saveObservation_(payload) {
  const sheetName = payload.sheetName || DEFAULT_SHEET_NAME;
  const sheet = getSheet_(sheetName);
  const rowNumber = Number(payload.rowNumber);
  const email = normalizeEmail_(payload.email || "");

  if (!rowNumber || rowNumber < DATA_START_ROW) {
    throw new Error("Numero de fila no valido.");
  }

  assertRowEmailAuthorized_(sheet, rowNumber, email);

  sheet.getRange(rowNumber, 3).setValue(payload.observation || "");

  return jsonOutput({
    success: true,
    message: "Observacion guardada correctamente.",
    rowNumber,
    activeSheetName: getSheetName_(sheetName),
    supportUrl: sheet.getRange(rowNumber, 4).getDisplayValue()
  });
}

function uploadSupport_(payload) {
  const sheetName = payload.sheetName || DEFAULT_SHEET_NAME;
  const sheet = getSheet_(sheetName);
  const rowNumber = Number(payload.rowNumber);
  const email = normalizeEmail_(payload.email || "");
  const base64Data = payload.base64Data || "";
  const fileName = payload.fileName || "archivo";
  const mimeType = payload.mimeType || "application/octet-stream";

  if (!rowNumber || rowNumber < DATA_START_ROW) {
    throw new Error("Numero de fila no valido.");
  }

  if (!base64Data) {
    throw new Error("No se recibio el archivo.");
  }

  assertRowEmailAuthorized_(sheet, rowNumber, email);
  validateUploadExtension_(fileName);

  const monthFolder = getMonthFolder_(sheetName);
  const finalName = buildSupportFileName_(fileName);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    mimeType,
    finalName
  );

  const file = monthFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  sheet.getRange(rowNumber, 4).setValue(file.getUrl());

  return jsonOutput({
    success: true,
    message: "Soporte cargado correctamente.",
    rowNumber,
    activeSheetName: getSheetName_(sheetName),
    supportUrl: file.getUrl(),
    supportName: file.getName()
  });
}

function buildDataset_(sheetName, email) {
  const activeSheetName = getSheetName_(sheetName);
  const sheet = getSheet_(activeSheetName);
  const lastRow = sheet.getLastRow();
  const totalRows = Math.max(lastRow - DATA_START_ROW + 1, 0);

  const values = totalRows > 0
    ? sheet.getRange(DATA_START_ROW, 1, totalRows, 5).getDisplayValues()
    : [];

  const normalizedEmail = normalizeEmail_(email);
  const isAdmin = isAdminEmail_(normalizedEmail);

  const baseRows = values
    .map((row, index) => ({
      rowNumber: DATA_START_ROW + index,
      institution: row[0] || "",
      feedback: row[1] || "",
      observation: row[2] || "",
      supportUrl: row[3] || "",
      supportName: row[3] ? "Soporte cargado" : "",
      authorizedEmail: row[4] || ""
    }))
    .filter(row => row.institution || row.feedback || row.observation || row.supportUrl || row.authorizedEmail);

  const rows = isAdmin
    ? baseRows
    : normalizedEmail
      ? baseRows.filter(row => isAuthorizedForRow_(row.authorizedEmail, normalizedEmail))
      : baseRows;

  if (normalizedEmail && !isAdmin && rows.length === 0) {
    return {
      success: true,
      accessDenied: true,
      message: `El correo ${normalizedEmail} no cuenta con acceso.`,
      metadata: {
        activeSheetName,
        departamento: sheet.getRange(META_MAP.departamento).getDisplayValue(),
        mesNotificacion: sheet.getRange(META_MAP.mesNotificacion).getDisplayValue(),
        numeroUpgd: sheet.getRange(META_MAP.numeroUpgd).getDisplayValue(),
        fechaNotificacion: sheet.getRange(META_MAP.fechaNotificacion).getDisplayValue(),
        oportunidad: sheet.getRange(META_MAP.oportunidad).getDisplayValue()
      },
      rows: []
    };
  }

  return {
    success: true,
    accessDenied: false,
    metadata: {
      activeSheetName,
      departamento: sheet.getRange(META_MAP.departamento).getDisplayValue(),
      mesNotificacion: sheet.getRange(META_MAP.mesNotificacion).getDisplayValue(),
      numeroUpgd: sheet.getRange(META_MAP.numeroUpgd).getDisplayValue(),
      fechaNotificacion: sheet.getRange(META_MAP.fechaNotificacion).getDisplayValue(),
      oportunidad: sheet.getRange(META_MAP.oportunidad).getDisplayValue()
    },
    rows
  };
}

function validateEmailAccess_(email) {
  const normalizedEmail = normalizeEmail_(email);
  if (!normalizedEmail) {
    return {
      success: false,
      accessGranted: false,
      message: "Debes ingresar un correo."
    };
  }

  if (isAdminEmail_(normalizedEmail)) {
    return {
      success: true,
      accessGranted: true,
      message: "Correo administrador autorizado.",
      email: normalizedEmail,
      sheets: getSpreadsheet_().getSheets().map(sheet => sheet.getName()),
      isAdmin: true
    };
  }

  const spreadsheet = getSpreadsheet_();
  const matchingSheets = spreadsheet.getSheets()
    .map(sheet => sheet.getName())
    .filter(name => {
      try {
        return buildDataset_(name, normalizedEmail).rows.length > 0;
      } catch (error) {
        return false;
      }
    });

  if (!matchingSheets.length) {
    return {
      success: true,
      accessGranted: false,
      message: `El correo ${normalizedEmail} no cuenta con acceso.`
    };
  }

  return {
    success: true,
    accessGranted: true,
    message: "Correo autorizado.",
    email: normalizedEmail,
    sheets: matchingSheets
  };
}

function assertRowEmailAuthorized_(sheet, rowNumber, email) {
  const normalizedEmail = normalizeEmail_(email);
  if (!normalizedEmail) {
    throw new Error("No se recibio un correo autorizado.");
  }

  if (isAdminEmail_(normalizedEmail)) {
    return;
  }

  const authorizedCell = sheet.getRange(rowNumber, 5).getDisplayValue();
  if (!isAuthorizedForRow_(authorizedCell, normalizedEmail)) {
    throw new Error("El correo no tiene permiso para modificar esta institucion.");
  }
}

function isAuthorizedForRow_(authorizedCell, email) {
  const normalizedEmail = normalizeEmail_(email);
  if (!normalizedEmail) {
    return false;
  }

  const options = String(authorizedCell || "")
    .split(/[,;\n]/)
    .map(item => normalizeEmail_(item))
    .filter(item => item && item !== "-" && item !== "--" && item !== "---" && item !== "-----------");

  return options.includes(normalizedEmail);
}

function isAdminEmail_(email) {
  const normalizedEmail = normalizeEmail_(email);
  return ADMIN_EMAILS.includes(normalizedEmail);
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function getMonthFolder_(sheetName) {
  const monthFolderName = getMonthFolderName_(sheetName);
  const folderId = DRIVE_FOLDER_IDS[monthFolderName];

  if (!folderId) {
    throw new Error(`No hay carpeta configurada para el mes ${monthFolderName}.`);
  }

  return DriveApp.getFolderById(folderId);
}

function getMonthFolderName_(sheetName) {
  return String(sheetName || DEFAULT_SHEET_NAME)
    .split("_")[0]
    .trim()
    .toUpperCase();
}

function buildSupportFileName_(originalFileName) {
  return sanitizeFileNamePreservingExtension_(originalFileName || "archivo");
}

function validateUploadExtension_(fileName) {
  const extension = getFileExtension_(fileName);

  if (!extension || ALLOWED_UPLOAD_EXTENSIONS.indexOf(extension) === -1) {
    throw new Error("Extension no permitida.");
  }
}

function getFileExtension_(fileName) {
  const match = String(fileName || "").trim().match(/\.([A-Za-z0-9]+)$/);
  return match ? match[1].toUpperCase() : "";
}

function sanitizeFileNamePreservingExtension_(fileName) {
  const match = String(fileName || "").trim().match(/^(.*?)(\.[A-Za-z0-9]+)?$/);
  const baseName = match ? match[1] : "archivo";
  const extension = match && match[2] ? match[2] : "";

  const cleanBase = String(baseName || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "archivo";

  return `${cleanBase}${extension}`;
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function autorizarDrive() {
  const folder = DriveApp.getFolderById("1bCucxgyksD-8tf66cNaHchlCj1j0IeyE");
  const tempFile = folder.createFile("permiso_tmp.txt", "ok");
  tempFile.setTrashed(true);
  SpreadsheetApp.openById(SPREADSHEET_ID);
}
