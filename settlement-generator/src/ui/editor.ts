import type { Settlement, Point } from '../core/types';

export type EditorMode = 'select' | 'move' | 'add' | 'delete';

export interface EditorState {
  mode: EditorMode;
  selectedIds: Set<string>;
  hoveredId: string | null;
  isDragging: boolean;
  dragStart: Point | null;
}

export function createEditor(
  _canvas: HTMLCanvasElement,
  _settlement: Settlement,
): EditorState {
  return {
    mode: 'select',
    selectedIds: new Set(),
    hoveredId: null,
    isDragging: false,
    dragStart: null,
  };
}
