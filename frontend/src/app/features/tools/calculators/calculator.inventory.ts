import { CalculatorInventoryItem, CalculatorOrigin } from './calculator.models';

const APP_JS = 'src/main/resources/static/herramientas/js/app.js';
const GENERAL_JS = 'src/main/resources/static/herramientas/js/oncology-tools-general.js';
const GYNECOLOGY_JS = 'src/main/resources/static/herramientas/js/oncology-tools-gyne.js';
const GI_THORAX_JS = 'src/main/resources/static/herramientas/js/oncology-tools-gi-thorax.js';
const RADIOTHERAPY_JS = 'src/main/resources/static/herramientas/js/radiotherapy-tools.js';

function item<const TId extends string>(
  ordinal: number,
  id: TId,
  title: string,
  origin: CalculatorOrigin,
  legacySource: string,
  migrationStatus: CalculatorInventoryItem['migrationStatus'] = 'pending'
): CalculatorInventoryItem<TId> {
  return { ordinal, id, title, origin, legacySource, migrationStatus };
}

export const CALCULATOR_INVENTORY = [
  item(1, 'bsa', 'Superficie corporal — Mosteller', 'legacy-app-js', APP_JS, 'ported'),
  item(2, 'bmi', 'Índice de masa corporal', 'legacy-app-js', APP_JS, 'ported'),
  item(3, 'calvert', 'Carboplatino - formula de Calvert', 'legacy-app-js', APP_JS, 'ported'),
  item(4, 'ecog', 'ECOG / Karnofsky', 'legacy-app-js', APP_JS, 'ported'),
  item(5, 'charlson', 'Charlson comorbidity index', 'legacy-app-js', APP_JS, 'ported'),
  item(6, 'g8-carg', 'G8 / CARG', 'legacy-app-js', APP_JS, 'ported'),
  item(7, 'ipss-shim', 'IPSS / SHIM', 'legacy-app-js', APP_JS, 'ported'),
  item(8, 'damico', 'EAU 2026 — riesgo prostático', 'legacy-app-js', APP_JS, 'ported'),
  item(9, 'capra', 'CAPRA / CAPRA-S', 'legacy-app-js', APP_JS, 'ported'),
  item(10, 'partin', 'Partin tables', 'legacy-app-js', APP_JS, 'ported'),
  item(11, 'nodal-risk', 'Roach nodal / Briganti oficial', 'legacy-app-js', APP_JS, 'ported'),
  item(12, 'mskcc-prostate', 'Nomogramas MSKCC próstata', 'legacy-app-js', APP_JS, 'ported'),
  item(13, 'biopsy-risk', 'PBCG — riesgo antes de biopsia', 'legacy-app-js', APP_JS, 'ported'),
  item(14, 'psa-kinetics', 'PSA-D / PSA doubling time / BCR', 'legacy-app-js', APP_JS, 'ported'),
  item(15, 'chaarted-latitude', 'CHAARTED / LATITUDE', 'legacy-app-js', APP_JS, 'ported'),
  item(16, 'nmibc', 'NMIBC EAU / EORTC / CUETO', 'legacy-app-js', APP_JS, 'ported'),
  item(17, 'cystectomy', 'Post-cistectomía', 'legacy-app-js', APP_JS, 'ported'),
  item(18, 'cisplatin', 'Aptitud para cisplatino y platinum', 'legacy-app-js', APP_JS, 'ported'),
  item(19, 'utuc', 'UTUC — riesgo EAU 2026', 'legacy-app-js', APP_JS, 'ported'),
  item(20, 'renal-complexity', 'RENAL / PADUA', 'legacy-app-js', APP_JS, 'ported'),
  item(21, 'leibovich', 'Leibovich 2003 / UISS localizado', 'legacy-app-js', APP_JS, 'ported'),
  item(22, 'imdc', 'IMDC — carcinoma renal metastásico', 'legacy-app-js', APP_JS, 'ported'),
  item(23, 'igcccg', 'IGCCCG testículo', 'legacy-app-js', APP_JS, 'ported'),

  item(24, 'renal-function-oncology', 'Función renal: Cockcroft–Gault y CKD-EPI 2021', 'oncology-general', GENERAL_JS, 'ported'),
  item(25, 'anc-ctcae-v6', 'Recuento absoluto de neutrófilos — CTCAE v6', 'oncology-general', GENERAL_JS, 'ported'),
  item(26, 'khorana-vte', 'Khorana — riesgo de VTE', 'oncology-general', GENERAL_JS, 'ported'),
  item(27, 'mascc-febrile-neutropenia', 'MASCC — neutropenia febril', 'oncology-general', GENERAL_JS, 'ported'),
  item(28, 'cisne-febrile-neutropenia', 'CISNE — neutropenia febril estable', 'oncology-general', GENERAL_JS, 'ported'),
  item(29, 'palliative-prognostic-index', 'Palliative Prognostic Index — PPI', 'oncology-general', GENERAL_JS, 'ported'),
  item(30, 'bed-eqd2', 'BED y EQD2 del fraccionamiento', 'oncology-general', GENERAL_JS, 'ported'),
  item(31, 'qtc-fridericia', 'QT corregido — Fridericia', 'oncology-general', GENERAL_JS, 'ported'),
  item(32, 'nottingham-prognostic-index', 'Nottingham Prognostic Index — NPI', 'oncology-general', GENERAL_JS, 'ported'),
  item(33, 'residual-cancer-burden-experimental', 'Residual Cancer Burden — RCB experimental', 'oncology-general', GENERAL_JS, 'ported'),
  item(34, 'pepi-breast', 'PEPI — Preoperative Endocrine Prognostic Index', 'oncology-general', GENERAL_JS, 'ported'),
  item(35, 'cts5-breast', 'CTS5 — recurrencia tardía', 'oncology-general', GENERAL_JS, 'ported'),
  item(36, 'monarche-cohort-1', 'monarchE — criterios de cohorte 1', 'oncology-general', GENERAL_JS),
  item(37, 'olympia-cpseg', 'OlympiA y CPS+EG', 'oncology-general', GENERAL_JS),
  item(38, 'international-prognostic-index', 'International Prognostic Index — IPI', 'oncology-general', GENERAL_JS),
  item(39, 'r2-iss-myeloma', 'R2-ISS — mieloma múltiple', 'oncology-general', GENERAL_JS),

  item(40, 'gyne-sedlis', 'Cuello uterino — criterios de Sedlis', 'oncology-gynecology', GYNECOLOGY_JS),
  item(41, 'gyne-peters', 'Cuello uterino — criterios de Peters', 'oncology-gynecology', GYNECOLOGY_JS),
  item(42, 'gyne-promise', 'Endometrio — ProMisE / ESGO 2025', 'oncology-gynecology', GYNECOLOGY_JS),
  item(43, 'gyne-rmi-i', 'Masa anexial — RMI I', 'oncology-gynecology', GYNECOLOGY_JS),
  item(44, 'gyne-fagotti', 'Ovario — Fagotti PIV clásico', 'oncology-gynecology', GYNECOLOGY_JS),
  item(45, 'gyne-ago-desktop', 'Ovario recurrente — AGO / DESKTOP III', 'oncology-gynecology', GYNECOLOGY_JS),

  item(46, 'thorax_brock', 'Brock / PanCan — nódulo pulmonar', 'oncology-gi-thorax', GI_THORAX_JS),
  item(47, 'thorax_mayo_herder', 'Mayo-Herder con PET-FDG', 'oncology-gi-thorax', GI_THORAX_JS),
  item(48, 'thorax_lung_gpa_2022', 'Lung GPA 2022', 'oncology-gi-thorax', GI_THORAX_JS),
  item(49, 'thorax_lipi', 'LIPI', 'oncology-gi-thorax', GI_THORAX_JS),
  item(50, 'digestive_albi', 'ALBI / mALBI', 'oncology-gi-thorax', GI_THORAX_JS),
  item(51, 'digestive_french_afp_hcc', 'AFP francés para trasplante en HCC', 'oncology-gi-thorax', GI_THORAX_JS),
  item(52, 'digestive_game', 'GAME — metástasis hepáticas colorrectales', 'oncology-gi-thorax', GI_THORAX_JS),
  item(53, 'digestive_pci', 'Índice de cáncer peritoneal (PCI)', 'oncology-gi-thorax', GI_THORAX_JS),

  item(54, 'rt-dose-per-fraction-target', 'Dosis por fracción desde BED o EQD2', 'radiotherapy', RADIOTHERAPY_JS),
  item(55, 'rt-fractions-target', 'Número de fracciones desde BED o EQD2', 'radiotherapy', RADIOTHERAPY_JS),
  item(56, 'rt-simultaneous-2-volumes', 'Fraccionamiento simultáneo · 2 volúmenes', 'radiotherapy', RADIOTHERAPY_JS),
  item(57, 'rt-simultaneous-3-volumes', 'Fraccionamiento simultáneo · 3 volúmenes', 'radiotherapy', RADIOTHERAPY_JS)
] as const;

export type CalculatorInventoryId = (typeof CALCULATOR_INVENTORY)[number]['id'];

export const EXPECTED_CALCULATOR_ORIGIN_COUNTS: Readonly<Record<CalculatorOrigin, number>> = {
  'legacy-app-js': 23,
  'oncology-general': 16,
  'oncology-gynecology': 6,
  'oncology-gi-thorax': 8,
  radiotherapy: 4
};
