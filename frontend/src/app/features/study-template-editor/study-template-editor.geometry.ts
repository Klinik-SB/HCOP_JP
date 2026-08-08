import { ArrowGeometry, CanvasPoint, CircleGeometry, RectangleGeometry, ShapeAnnotation, ShapeGeometry, StudyTemplateCatalogItem } from './study-template-editor.models';

type JsonRecord = Record<string, unknown>;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : minimum, minimum), maximum);
}

export function normalizeCanvasPoint(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  canvasWidth: number,
  canvasHeight: number
): CanvasPoint {
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  return {
    x: clamp((clientX - bounds.left) * (canvasWidth / width), 0, canvasWidth),
    y: clamp((clientY - bounds.top) * (canvasHeight / height), 0, canvasHeight)
  };
}

export function shapeGeometry(command: ShapeAnnotation): ShapeGeometry {
  const { start, end } = command;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  if (command.shape === 'circle') {
    const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const width = (deltaX < 0 ? -1 : 1) * size;
    const height = (deltaY < 0 ? -1 : 1) * size;
    return { kind: 'circle', centerX: start.x + width / 2, centerY: start.y + height / 2, radius: size / 2 } satisfies CircleGeometry;
  }
  if (command.shape === 'rectangle') {
    return { kind: 'rectangle', x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(deltaX), height: Math.abs(deltaY) } satisfies RectangleGeometry;
  }
  const length = Math.hypot(deltaX, deltaY);
  if (!length) return { kind: 'arrow', length: 0, points: [] } satisfies ArrowGeometry;
  const unitX = deltaX / length;
  const unitY = deltaY / length;
  const perpendicularX = -unitY;
  const perpendicularY = unitX;
  const lineWidth = Math.max(1, command.width);
  const headLength = Math.min(Math.max(lineWidth * 4, length * .28), length * .55);
  const headHalfWidth = Math.min(Math.max(lineWidth * 2.1, length * .12), length * .32);
  const shaftHalfWidth = Math.min(Math.max(lineWidth * .62, 1.5), headHalfWidth * .46);
  const neck = { x: end.x - unitX * headLength, y: end.y - unitY * headLength };
  const offset = (point: CanvasPoint, amount: number): CanvasPoint => ({ x: point.x + perpendicularX * amount, y: point.y + perpendicularY * amount });
  return {
    kind: 'arrow', length,
    points: [offset(start, shaftHalfWidth), offset(neck, shaftHalfWidth), offset(neck, headHalfWidth), end, offset(neck, -headHalfWidth), offset(neck, -shaftHalfWidth), offset(start, -shaftHalfWidth)]
  } satisfies ArrowGeometry;
}

export function isDrawableShape(command: ShapeAnnotation): boolean {
  const geometry = shapeGeometry(command);
  const width = Math.max(1, command.width);
  if (geometry.kind === 'circle') return geometry.radius >= Math.max(2, width * .75);
  if (geometry.kind === 'rectangle') return Math.min(geometry.width, geometry.height) >= 2 && Math.hypot(geometry.width, geometry.height) >= Math.max(6, width * 1.5);
  return geometry.length >= Math.max(6, width * 2);
}

export function normalizeTemplateCatalog(payload: unknown): readonly StudyTemplateCatalogItem[] {
  return array(record(payload)['templates']).map((value): StudyTemplateCatalogItem => {
    const item = record(value);
    const definition = record(item['definition']);
    const file = safeStudyImageUrl(firstText(item, definition, ['file', 'fileUrl']));
    const thumbnail = safeStudyImageUrl(firstText(item, definition, ['thumbnail', 'thumbnailUrl'])) || file;
    return {
      id: firstText(item, definition, ['id']) || text(item['configurationId']),
      title: firstText(item, definition, ['title', 'name']) || 'Plantilla anatómica',
      category: firstText(item, definition, ['category']), description: firstText(item, definition, ['description']),
      tags: firstArray(item, definition, ['tags']).map(text).filter(Boolean), imageUrl: file, thumbnailUrl: thumbnail,
      active: boolean(item['active']) ?? true, available: (boolean(item['available']) ?? true) && Boolean(file)
    };
  }).filter((item) => item.id && item.title && item.active)
    .sort((left, right) => left.category.localeCompare(right.category, 'es-AR') || left.title.localeCompare(right.title, 'es-AR'));
}

export function safeStudyImageUrl(value: unknown): string {
  const url = text(value);
  if (!url || url.includes('\\') || /[\u0000-\u001f]/.test(url) || /(^|\/)\.\.?(\/|$)/.test(url)) return '';
  if (url.startsWith('/api/media/images/') || url.startsWith('/assets/study-templates/')) return url;
  if (url.startsWith('assets/study-templates/')) return `/${url}`;
  return '';
}

export function normalizedSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR').trim();
}

export function safePngName(value: string): string {
  const base = value.replace(/\.[a-z0-9]{1,8}$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'imagen-clinica';
  return `${base}-anotada.png`;
}

export function fitRasterSize(width: number, height: number, maxDimension = 4096, maxPixels = 16_000_000): CanvasPoint {
  const safeWidth = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  const safeHeight = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  const dimensionScale = Math.min(1, maxDimension / Math.max(safeWidth, safeHeight));
  const pixelScale = Math.min(1, Math.sqrt(maxPixels / (safeWidth * safeHeight)));
  const scale = Math.min(dimensionScale, pixelScale);
  return { x: Math.max(1, Math.round(safeWidth * scale)), y: Math.max(1, Math.round(safeHeight * scale)) };
}

function record(value: unknown): JsonRecord { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
function boolean(value: unknown): boolean | null { return typeof value === 'boolean' ? value : null; }
function firstText(item: JsonRecord, definition: JsonRecord, keys: readonly string[]): string {
  for (const key of keys) { const found = text(item[key]) || text(definition[key]); if (found) return found; }
  return '';
}
function firstArray(item: JsonRecord, definition: JsonRecord, keys: readonly string[]): readonly unknown[] {
  for (const key of keys) { const found = array(item[key]); if (found.length) return found; const nested = array(definition[key]); if (nested.length) return nested; }
  return [];
}
