export type StudyAnnotationTool = 'draw' | 'eraser' | 'text' | 'circle' | 'rectangle' | 'arrow';
export type StudyAnnotationFill = 'none' | 'solid';

export interface StudyTemplateEditorSource {
  readonly url?: string;
  readonly file?: File | Blob;
  readonly name?: string;
  readonly title?: string;
}

export interface StudyTemplateCatalogItem {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly imageUrl: string;
  readonly thumbnailUrl: string;
  readonly active: boolean;
  readonly available: boolean;
}

export interface CanvasPoint { readonly x: number; readonly y: number; }

export interface StrokeAnnotation {
  readonly type: 'stroke' | 'eraser';
  readonly points: readonly CanvasPoint[];
  readonly color: string;
  readonly width: number;
}

export interface TextAnnotation {
  readonly type: 'text';
  readonly point: CanvasPoint;
  readonly text: string;
  readonly color: string;
  readonly fontSize: number;
}

export interface ShapeAnnotation {
  readonly type: 'shape';
  readonly shape: 'circle' | 'rectangle' | 'arrow';
  readonly start: CanvasPoint;
  readonly end: CanvasPoint;
  readonly color: string;
  readonly width: number;
  readonly filled: boolean;
}

export type StudyAnnotation = StrokeAnnotation | TextAnnotation | ShapeAnnotation;
export interface RectangleGeometry { readonly kind: 'rectangle'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface CircleGeometry { readonly kind: 'circle'; readonly centerX: number; readonly centerY: number; readonly radius: number; }
export interface ArrowGeometry { readonly kind: 'arrow'; readonly length: number; readonly points: readonly CanvasPoint[]; }
export type ShapeGeometry = RectangleGeometry | CircleGeometry | ArrowGeometry;
