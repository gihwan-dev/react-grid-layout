// @flow
import { deepEqual } from "fast-equals";
import React from "react";
import type {
  ChildrenArray as ReactChildrenArray,
  Element as ReactElement
} from "react";

export type ResizeHandleAxis =
  | "s"
  | "w"
  | "e"
  | "n"
  | "sw"
  | "nw"
  | "se"
  | "ne";

export interface LayoutChild {
  w: number,
  h: number,
  x: number,
  y: number,
  i: string,
  minW?: number,
  minH?: number,
  maxW?: number,
  maxH?: number,
  moved?: boolean,
  static?: boolean,
  isDraggable?: ?boolean,
  isResizable?: ?boolean,
  resizeHandles?: Array<ResizeHandleAxis>,
  isBounded?: ?boolean;
}

export type LayoutItem = {
  w: number,
  h: number,
  x: number,
  y: number,
  i: string,
  minW?: number,
  minH?: number,
  maxW?: number,
  maxH?: number,
  moved?: boolean,
  static?: boolean,
  isDraggable?: ?boolean,
  isResizable?: ?boolean,
  resizeHandles?: Array<ResizeHandleAxis>,
  isBounded?: ?boolean;
  isGroup?: boolean,
  groupId?: string,
  children?: LayoutChild[],
};

export type Layout = $ReadOnlyArray<LayoutItem>;
export type Position = {
  left: number,
  top: number,
  width: number,
  height: number
};
export type ReactDraggableCallbackData = {
  node: HTMLElement,
  x?: number,
  y?: number,
  deltaX: number,
  deltaY: number,
  lastX?: number,
  lastY?: number
};

export type PartialPosition = { left: number, top: number };
export type DroppingPosition = { left: number, top: number, e: Event };
export type Size = { width: number, height: number };
export type GridDragEvent = {
  e: Event,
  node: HTMLElement,
  newPosition: PartialPosition
};
export type GridResizeEvent = {
  e: Event,
  node: HTMLElement,
  size: Size,
  handle: string
};
export type DragOverEvent = MouseEvent & {
  nativeEvent: {
    layerX: number,
    layerY: number,
    ...Event
  }
};

// TS에서 유용한 포트
export type Pick<FromType, Properties: { [string]: 0 }> = $Exact<
  $ObjMapi<Properties, <K, V>(k: K, v: V) => $ElementType<FromType, K>>
>;

type REl = ReactElement<any>;
export type ReactChildren = ReactChildrenArray<REl>;

// 모든 콜백은 (layout, oldItem, newItem, placeholder, e) 시그니처를 가집니다.
export type EventCallback = (
  Layout,
  oldItem: ?LayoutItem,
  newItem: ?LayoutItem,
  placeholder: ?LayoutItem,
  Event,
  ?HTMLElement
) => void;
export type CompactType = ?("horizontal" | "vertical");

const isProduction = process.env.NODE_ENV === "production";
const DEBUG = false;

/**
 * 레이아웃의 가장 아래 좌표를 반환합니다.
 *
 * @param  {Array} layout 레이아웃 배열.
 * @return {Number}       가장 아래 좌표.
 */
export function bottom(layout: Layout): number {
  let max = 0,
    bottomY;
  for (let i = 0, len = layout.length; i < len; i++) {
    bottomY = layout[i].y + layout[i].h;
    if (bottomY > max) max = bottomY;
  }
  return max;
}

export function cloneLayout(layout: Layout): Layout {
  const newLayout = Array(layout.length);
  for (let i = 0, len = layout.length; i < len; i++) {
    newLayout[i] = cloneLayoutItem(layout[i]);
  }
  return newLayout;
}

// 레이아웃 내의 layoutItem을 수정합니다. 새로운 Layout을 반환하며,
// 기존 레이아웃을 변경하지 않습니다. 다른 모든 LayoutItem들은 수정되지 않은 채로 유지됩니다.
export function modifyLayout(layout: Layout, layoutItem: LayoutItem): Layout {
  const newLayout = Array(layout.length);
  for (let i = 0, len = layout.length; i < len; i++) {
    if (layoutItem.i === layout[i].i) {
      newLayout[i] = layoutItem;
    } else {
      newLayout[i] = layout[i];
    }
  }
  return newLayout;
}

// 레이아웃 아이템을 수정하기 위해 호출되는 함수입니다.
// 레이아웃이 수정되지 않도록 방어적 복제를 수행합니다.
export function withLayoutItem(
  layout: Layout,
  itemKey: string,
  cb: LayoutItem => LayoutItem
): [Layout, ?LayoutItem] {
  let item = getLayoutItem(layout, itemKey);
  if (!item) return [layout, null];
  item = cb(cloneLayoutItem(item)); // 방어적 복제 후 수정
  // FIXME 인덱스를 미리 알고 있다면 더 빠르게 할 수 있음
  layout = modifyLayout(layout, item);
  return [layout, item];
}

// 단형적이므로 복제를 위한 빠른 경로
export function cloneLayoutItem(layoutItem: LayoutItem): LayoutItem {
  return {
    w: layoutItem.w,
    h: layoutItem.h,
    x: layoutItem.x,
    y: layoutItem.y,
    i: layoutItem.i,
    minW: layoutItem.minW,
    maxW: layoutItem.maxW,
    minH: layoutItem.minH,
    maxH: layoutItem.maxH,
    moved: Boolean(layoutItem.moved),
    static: Boolean(layoutItem.static),
    // 이들은 null/undefined일 수 있음
    isDraggable: layoutItem.isDraggable,
    isResizable: layoutItem.isResizable,
    resizeHandles: layoutItem.resizeHandles,
    isBounded: layoutItem.isBounded,
    // 그룹화 관련 필드
    isGroup: layoutItem.isGroup,
    groupId: layoutItem.groupId,
    children: layoutItem.children
  };
}

/**
 * React `children`을 비교하는 것은 조금 어렵습니다. 이 함수는 그것을 잘 비교합니다.
 * key, 순서, 길이의 차이를 잡아냅니다.
 */
export function childrenEqual(a: ReactChildren, b: ReactChildren): boolean {
  return (
    deepEqual(
      React.Children.map(a, c => c?.key),
      React.Children.map(b, c => c?.key)
    ) &&
    deepEqual(
      React.Children.map(a, c => c?.props["data-grid"]),
      React.Children.map(b, c => c?.props["data-grid"])
    )
  );
}

/**
 * `fastRGLPropsEqual.js`를 참조하세요.
 * 이 함수는 자주 호출되므로 가능한 한 빠르게 실행되어야 하며,
 * 우리가 추가하는 새로운 props에 대해 탄력적이어야 합니다. 따라서
 * props 비교에 적합하지 않은 lodash.isEqual을 호출하는 대신,
 * preval과 함께 이 특수 함수를 사용하여 우리의 props에 정확히 맞춰진
 * 가능한 한 가장 빠른 비교 함수를 생성합니다.
 */
type FastRGLPropsEqual = (Object, Object, Function) => boolean;
export const fastRGLPropsEqual: FastRGLPropsEqual = require("./fastRGLPropsEqual");

// 위와 비슷하지만 훨씬 간단합니다.
export function fastPositionEqual(a: Position, b: Position): boolean {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

/**
 * 두 layoutitem이 충돌하는지 확인합니다.
 */
export function collides(l1: LayoutItem, l2: LayoutItem): boolean {
  if (l1.i === l2.i) return false; // 동일한 요소
  if (l1.x + l1.w <= l2.x) return false; // l1이 l2의 왼쪽에 있음
  if (l1.x >= l2.x + l2.w) return false; // l1이 l2의 오른쪽에 있음
  if (l1.y + l1.h <= l2.y) return false; // l1이 l2의 위에 있음
  if (l1.y >= l2.y + l2.h) return false; // l1이 l2의 아래에 있음
  return true; // 박스들이 겹침
}

/**
 * 레이아웃을 압축(compact)합니다. 각 y 좌표를 따라 내려가며 아이템 사이의 빈 공간을 제거합니다.
 *
 * 레이아웃 아이템을 수정하지 않습니다(복제함). 새로운 레이아웃 배열을 만듭니다.
 *
 * @param  {Array} layout 레이아웃.
 * @param  {Boolean} verticalCompact 레이아웃을 수직으로 압축할지 여부.
 * @param  {Boolean} allowOverlap 겹침을 허용할지 여부.
 * @return {Array}       압축된 레이아웃.
 */
export function compact(
  layout: Layout,
  compactType: CompactType,
  cols: number,
  allowOverlap: ?boolean
): Layout {
  // Static 요소들은 아이템들이 그 주위로 흐르도록 compareWith 배열에 즉시 들어갑니다.
  const compareWith = getStatics(layout);
  // 아이템들을 행과 열로 순회합니다.
  const sorted = sortLayoutItems(layout, compactType);
  // 새 아이템들을 보관합니다.
  const out = Array(layout.length);

  for (let i = 0, len = sorted.length; i < len; i++) {
    let l = cloneLayoutItem(sorted[i]);

    // static 요소는 이동하지 않습니다
    if (!l.static) {
      l = compactItem(compareWith, l, compactType, cols, sorted, allowOverlap);

      // 비교 배열에 추가합니다. 이전 아이템들과만 충돌합니다.
      // Static 요소들은 이미 이 배열에 있습니다.
      compareWith.push(l);
    }

    // 올바른 순서로 나오도록 출력 배열에 추가합니다.
    out[layout.indexOf(sorted[i])] = l;

    // moved 플래그가 있다면 지웁니다.
    l.moved = false;
  }

  return out;
}

const heightWidth = { x: "w", y: "h" };
/**
 * 아이템을 아래로 이동하기 전에, 이동이 충돌을 일으킬지 확인하고 해당 아이템들을 먼저 아래로 이동시킵니다.
 */
function resolveCompactionCollision(
  layout: Layout,
  item: LayoutItem,
  moveToCoord: number,
  axis: "x" | "y"
) {
  const sizeProp = heightWidth[axis];
  item[axis] += 1;
  const itemIndex = layout
    .map(layoutItem => {
      return layoutItem.i;
    })
    .indexOf(item.i);

  // 충돌하는 각 아이템을 순회합니다.
  for (let i = itemIndex + 1; i < layout.length; i++) {
    const otherItem = layout[i];
    // static 아이템은 무시합니다
    if (otherItem.static) continue;

    // 최적화: 이 요소를 지나쳤다는 것을 알면 일찍 중단할 수 있습니다
    // 정렬된 레이아웃이므로 이렇게 할 수 있습니다
    if (otherItem.y > item.y + item.h) break;

    if (collides(item, otherItem)) {
      resolveCompactionCollision(
        layout,
        otherItem,
        moveToCoord + item[sizeProp],
        axis
      );
    }
  }

  item[axis] = moveToCoord;
}

/**
 * 아이템을 레이아웃에서 압축합니다.
 *
 * 아이템을 수정합니다.
 *
 */
export function compactItem(
  compareWith: Layout,
  l: LayoutItem,
  compactType: CompactType,
  cols: number,
  fullLayout: Layout,
  allowOverlap: ?boolean
): LayoutItem {
  const compactV = compactType === "vertical";
  const compactH = compactType === "horizontal";
  if (compactV) {
    // 가능한 가장 아래 'y'는 레이아웃의 바닥입니다.
    // 이를 통해 {y: Infinity}와 같은 멋진 설정이 가능합니다
    // 올바른 바닥 `y`를 얻기 위해 레이아웃이 정렬되어야 하므로 여기에 있습니다.
    l.y = Math.min(bottom(compareWith), l.y);
    // 충돌하지 않는 선에서 요소를 최대한 위로 이동시킵니다.
    while (l.y > 0 && !getFirstCollision(compareWith, l)) {
      l.y--;
    }
  } else if (compactH) {
    // 충돌하지 않는 선에서 요소를 최대한 왼쪽으로 이동시킵니다.
    while (l.x > 0 && !getFirstCollision(compareWith, l)) {
      l.x--;
    }
  }

  // 아래로 이동시키고, 충돌하는 동안 계속 아래로 이동시킵니다.
  let collides;
  // 겹침이 허용될 때 레이아웃이 깨지는 것을 방지하기 위해 compactType null 값을 확인합니다.
  while (
    (collides = getFirstCollision(compareWith, l)) &&
    !(compactType === null && allowOverlap)
  ) {
    if (compactH) {
      resolveCompactionCollision(fullLayout, l, collides.x + collides.w, "x");
    } else {
      resolveCompactionCollision(fullLayout, l, collides.y + collides.h, "y");
    }
    // 수평으로 무제한 확장할 수 없으므로, 오버플로우가 발생하면 아래로 이동하고 다시 시도합니다.
    if (compactH && l.x + l.w > cols) {
      l.x = cols - l.w;
      l.y++;
      // 또한 요소를 가능한 한 왼쪽으로 이동시킵니다
      while (l.x > 0 && !getFirstCollision(compareWith, l)) {
        l.x--;
      }
    }
  }

  // 음수 위치가 없도록 보장합니다
  l.y = Math.max(l.y, 0);
  l.x = Math.max(l.x, 0);

  return l;
}

/**
 * 레이아웃의 모든 요소가 경계 내에 들어오도록 보정합니다.
 *
 * 레이아웃 아이템을 수정합니다.
 *
 * @param  {Array} layout 레이아웃 배열.
 * @param  {Number} bounds 컬럼 수.
 */
export function correctBounds(
  layout: Layout,
  bounds: { cols: number }
): Layout {
  const collidesWith = getStatics(layout);
  for (let i = 0, len = layout.length; i < len; i++) {
    const l = layout[i];
    // 오른쪽으로 오버플로우
    if (l.x + l.w > bounds.cols) l.x = bounds.cols - l.w;
    // 왼쪽으로 오버플로우
    if (l.x < 0) {
      l.x = 0;
      l.w = bounds.cols;
    }
    if (!l.static) collidesWith.push(l);
    else {
      // static이고 다른 static과 충돌하면 아래로 이동시켜야 합니다.
      // 단순히 겹치게 두는 것보다 더 나은 처리를 해야 합니다.
      while (getFirstCollision(collidesWith, l)) {
        l.y++;
      }
    }
  }
  return layout;
}

/**
 * ID로 레이아웃 아이템을 가져옵니다. 필요시 오버라이드할 수 있도록 사용합니다.
 *
 * @param  {Array}  layout 레이아웃 배열.
 * @param  {String} id     ID
 * @return {LayoutItem}    해당 ID의 아이템.
 */
export function getLayoutItem(layout: Layout, id: string): ?LayoutItem {
  for (let i = 0, len = layout.length; i < len; i++) {
    if (layout[i].i === id) return layout[i];
  }
}

/**
 * 이 레이아웃이 충돌하는 첫 번째 아이템을 반환합니다.
 * 어떤 순서로 접근해도 상관없는 것처럼 보이지만, 어쩌면 잘못된 것일 수도 있습니다.
 *
 * @param  {Object} layoutItem 레이아웃 아이템.
 * @return {Object|undefined}  충돌하는 레이아웃 아이템 또는 undefined.
 */
export function getFirstCollision(
  layout: Layout,
  layoutItem: LayoutItem
): ?LayoutItem {
  for (let i = 0, len = layout.length; i < len; i++) {
    if (collides(layout[i], layoutItem)) return layout[i];
  }
}

export function getAllCollisions(
  layout: Layout,
  layoutItem: LayoutItem
): Array<LayoutItem> {
  return layout.filter(l => collides(l, layoutItem));
}

/**
 * 모든 static 요소를 가져옵니다.
 * @param  {Array} layout 레이아웃 객체 배열.
 * @return {Array}        static 레이아웃 아이템 배열.
 */
export function getStatics(layout: Layout): Array<LayoutItem> {
  return layout.filter(l => l.static);
}

/**
 * 요소를 이동시킵니다. 다른 요소들의 연쇄적인 이동을 처리합니다.
 *
 * 레이아웃 아이템을 수정합니다.
 *
 * @param  {Array}      layout            전체 레이아웃.
 * @param  {LayoutItem} l                 이동할 요소.
 * @param  {Number}     [x]               그리드 단위의 X 위치.
 * @param  {Number}     [y]               그리드 단위의 Y 위치.
 */
export function moveElement(
  layout: Layout,
  l: LayoutItem,
  x: ?number,
  y: ?number,
  isUserAction: ?boolean,
  preventCollision: ?boolean,
  compactType: CompactType,
  cols: number,
  allowOverlap: ?boolean
): Layout {
  // static이고 명시적으로 draggable로 활성화되지 않았다면,
  // 이동이 불가능하므로 즉시 단축할 수 있습니다.
  if (l.static && l.isDraggable !== true) return layout;

  // 할 일이 없으면 단축합니다.
  if (l.y === y && l.x === x) return layout;

  log(
    `Moving element ${l.i} to [${String(x)},${String(y)}] from [${l.x},${l.y}]`
  );
  const oldX = l.x;
  const oldY = l.y;

  // 객체를 확장하는 것보다 훨씬 빠릅니다
  if (typeof x === "number") l.x = x;
  if (typeof y === "number") l.y = y;
  l.moved = true;

  // 무언가와 충돌하면 이동시킵니다.
  // 이 비교를 수행할 때, 여러 충돌의 경우
  // 가장 가까운 충돌을 얻기 위해 비교할 아이템들을 정렬해야 합니다.
  let sorted = sortLayoutItems(layout, compactType);
  const movingUp =
    compactType === "vertical" && typeof y === "number"
      ? oldY >= y
: compactType === "horizontal" && typeof x === "number"
        ? oldX >= x
        : false;
  // $FlowIgnore 최근에 복제된 읽기 전용 배열의 허용 가능한 수정
  if (movingUp) sorted = sorted.reverse();
  const collisions = getAllCollisions(sorted, l);
  const hasCollisions = collisions.length > 0;

  // 충돌이 있을 수 있습니다. 충돌을 끄거나
  // 겹침을 허용했다면 단축할 수 있습니다.
  if (hasCollisions && allowOverlap) {
    // 쉽습니다. 충돌을 해결할 필요가 없습니다. 하지만 레이아웃을 *변경했으므로*,
    // 나가는 길에 복제합니다.
    return cloneLayout(layout);
  } else if (hasCollisions && preventCollision) {
    // 충돌을 방지하지만 겹침을 허용하지 않는다면,
    // 사용자가 원하는 위치가 아닌 원래 위치로
    // 이 요소의 위치를 되돌려야 합니다.
    log(`Collision prevented on ${l.i}, reverting.`);
    l.x = oldX;
    l.y = oldY;
    l.moved = false;
    return layout; // 변경되지 않았으므로 복제하지 않음
  }

  // 이 요소와 충돌하는 각 아이템을 멀리 이동시킵니다.
  for (let i = 0, len = collisions.length; i < len; i++) {
    const collision = collisions[i];
    log(
      `Resolving collision between ${l.i} at [${l.x},${l.y}] and ${collision.i} at [${collision.x},${collision.y}]`
    );

    // 무한 루프를 방지하기 위한 단축
    if (collision.moved) continue;

    // static 아이템은 이동하지 않습니다 - *이* 요소를 멀리 이동시켜야 합니다
    if (collision.static) {
      layout = moveElementAwayFromCollision(
        layout,
        collision,
        l,
        isUserAction,
        compactType,
        cols
      );
    } else {
      layout = moveElementAwayFromCollision(
        layout,
        l,
        collision,
        isUserAction,
        compactType,
        cols
      );
    }
  }

  return layout;
}

/**
 * 충돌이 발생했을 때, 해당 충돌로부터 요소를 이동시키는 곳입니다.
 * 위로 이동할 공간이 있으면 위로, 아니면 아래로 이동합니다.
 *
 * @param  {Array} layout            전체 레이아웃.
 * @param  {LayoutItem} collidesWith 충돌한 레이아웃 아이템.
 * @param  {LayoutItem} itemToMove   이동할 레이아웃 아이템.
 */
export function moveElementAwayFromCollision(
  layout: Layout,
  collidesWith: LayoutItem,
  itemToMove: LayoutItem,
  isUserAction: ?boolean,
  compactType: CompactType,
  cols: number
): Layout {
  const compactH = compactType === "horizontal";
  // 수평으로 설정되지 않았다면 수직으로 압축
  const compactV = compactType === "vertical";
  const preventCollision = collidesWith.static; // 이미 충돌 중입니다 (static 아이템 제외)

  // 충돌 위에 이 요소를 놓을 충분한 공간이 있다면 그곳으로 이동시킵니다.
  // 연쇄 반응에서 이상하게 작동하고 원치 않는 교환 동작을 일으킬 수 있으므로
  // 주 충돌에서만 이를 수행합니다.
  if (isUserAction) {
    // 더 이상 주 충돌에 있지 않으므로 isUserAction 플래그를 재설정합니다.
    isUserAction = false;

    // 여기서 아이템을 수정하지 않고 moveElement에서만 수정하도록 모의 아이템을 만듭니다.
    const fakeItem: LayoutItem = {
      x: compactH ? Math.max(collidesWith.x - itemToMove.w, 0) : itemToMove.x,
      y: compactV ? Math.max(collidesWith.y - itemToMove.h, 0) : itemToMove.y,
      w: itemToMove.w,
      h: itemToMove.h,
      i: "-1"
    };

    const firstCollision = getFirstCollision(layout, fakeItem);
    const collisionNorth =
      firstCollision && firstCollision.y + firstCollision.h > collidesWith.y;
    const collisionWest =
      firstCollision && collidesWith.x + collidesWith.w > firstCollision.x;

    // 충돌이 없나요? 그렇다면 위로 갈 수 있습니다; 그렇지 않으면 평상시처럼 아래로 이동하게 됩니다
    if (!firstCollision) {
      log(
        `Doing reverse collision on ${itemToMove.i} up to [${fakeItem.x},${fakeItem.y}].`
      );
      return moveElement(
        layout,
        itemToMove,
        compactH ? fakeItem.x : undefined,
        compactV ? fakeItem.y : undefined,
        isUserAction,
        preventCollision,
        compactType,
        cols
      );
    } else if (collisionNorth && compactV) {
      return moveElement(
        layout,
        itemToMove,
        undefined,
        collidesWith.y + 1,
        isUserAction,
        preventCollision,
        compactType,
        cols
      );
    } else if (collisionNorth && compactType == null) {
      collidesWith.y = itemToMove.y;
      itemToMove.y = itemToMove.y + itemToMove.h;

      return layout;
    } else if (collisionWest && compactH) {
      return moveElement(
        layout,
        collidesWith,
        itemToMove.x,
        undefined,
        isUserAction,
        preventCollision,
        compactType,
        cols
      );
    }
  }

  const newX = compactH ? itemToMove.x + 1 : undefined;
  const newY = compactV ? itemToMove.y + 1 : undefined;

  if (newX == null && newY == null) {
    return layout;
  }
  return moveElement(
    layout,
    itemToMove,
    compactH ? itemToMove.x + 1 : undefined,
    compactV ? itemToMove.y + 1 : undefined,
    isUserAction,
    preventCollision,
    compactType,
    cols
  );
}

/**
 * 숫자를 백분율 문자열로 변환하는 헬퍼 함수.
 *
 * @param  {Number} num 아무 숫자
 * @return {String}     백분율 문자열.
 */
export function perc(num: number): string {
  return num * 100 + "%";
}

/**
 * GridItem의 크기와 위치를 제한하는 헬퍼 함수들
 */
const constrainWidth = (
  left: number,
  currentWidth: number,
  newWidth: number,
  containerWidth: number
) => {
  return left + newWidth > containerWidth ? currentWidth : newWidth;
};

const constrainHeight = (
  top: number,
  currentHeight: number,
  newHeight: number
) => {
  return top < 0 ? currentHeight : newHeight;
};

const constrainLeft = (left: number) => Math.max(0, left);

const constrainTop = (top: number) => Math.max(0, top);

const resizeNorth = (currentSize, { left, height, width }, _containerWidth) => {
  const top = currentSize.top - (height - currentSize.height);

  return {
    left,
    width,
    height: constrainHeight(top, currentSize.height, height),
    top: constrainTop(top)
  };
};

const resizeEast = (
  currentSize,
  { top, left, height, width },
  containerWidth
) => ({
  top,
  height,
  width: constrainWidth(
    currentSize.left,
    currentSize.width,
    width,
    containerWidth
  ),
  left: constrainLeft(left)
});

const resizeWest = (currentSize, { top, height, width }, containerWidth) => {
  const left = currentSize.left - (width - currentSize.width);

  return {
    height,
    width:
      left < 0
        ? currentSize.width
        : constrainWidth(
            currentSize.left,
            currentSize.width,
            width,
            containerWidth
          ),
    top: constrainTop(top),
    left: constrainLeft(left)
  };
};

const resizeSouth = (
  currentSize,
  { top, left, height, width },
  containerWidth
) => ({
  width,
  left,
  height: constrainHeight(top, currentSize.height, height),
  top: constrainTop(top)
});

const resizeNorthEast = (...args) =>
  resizeNorth(args[0], resizeEast(...args), args[2]);
const resizeNorthWest = (...args) =>
  resizeNorth(args[0], resizeWest(...args), args[2]);
const resizeSouthEast = (...args) =>
  resizeSouth(args[0], resizeEast(...args), args[2]);
const resizeSouthWest = (...args) =>
  resizeSouth(args[0], resizeWest(...args), args[2]);

const ordinalResizeHandlerMap = {
  n: resizeNorth,
  ne: resizeNorthEast,
  e: resizeEast,
  se: resizeSouthEast,
  s: resizeSouth,
  sw: resizeSouthWest,
  w: resizeWest,
  nw: resizeNorthWest
};

/**
 * 아이템을 리사이즈할 때, 방향에 따라 width와 position을 제한하는 헬퍼 함수.
 */
export function resizeItemInDirection(
  direction: ResizeHandleAxis,
  currentSize: Position,
  newSize: Position,
  containerWidth: number
): Position {
  const ordinalHandler = ordinalResizeHandlerMap[direction];
  // 타입상 불가능해야 하지만, 그렇다고 해서 하드 실패하지는 않습니다
  if (!ordinalHandler) return newSize;
  return ordinalHandler(
    currentSize,
    { ...currentSize, ...newSize },
    containerWidth
  );
}

export function setTransform({ top, left, width, height }: Position): Object {
  // 단위 없는 항목을 px로 바꿉니다
  const translate = `translate(${left}px,${top}px)`;
  return {
    transform: translate,
    WebkitTransform: translate,
    MozTransform: translate,
    msTransform: translate,
    OTransform: translate,
    width: `${width}px`,
    height: `${height}px`,
    position: "absolute"
  };
}

export function setTopLeft({ top, left, width, height }: Position): Object {
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    height: `${height}px`,
    position: "absolute"
  };
}

/**
 * 레이아웃 아이템을 좌상단에서 우하단 순으로 정렬합니다.
 *
 * @return {Array} 레이아웃 객체 배열.
 * @return {Array}        정렬된 레이아웃, static 아이템이 먼저 옴.
 */
export function sortLayoutItems(
  layout: Layout,
  compactType: CompactType
): Layout {
  if (compactType === "horizontal") return sortLayoutItemsByColRow(layout);
  if (compactType === "vertical") return sortLayoutItemsByRowCol(layout);
  else return layout;
}

/**
 * row 오름차순, column 오름차순으로 레이아웃 아이템을 정렬합니다.
 *
 * Layout을 수정하지 않습니다.
 */
export function sortLayoutItemsByRowCol(layout: Layout): Layout {
  // sort가 수정하므로 배열을 복제하기 위해 slice합니다
  return layout.slice(0).sort(function (a, b) {
    if (a.y > b.y || (a.y === b.y && a.x > b.x)) {
      return 1;
    } else if (a.y === b.y && a.x === b.x) {
      // 이것이 없으면 IE와 Chrome/FF에서 다른 정렬 결과를 얻을 수 있습니다
      return 0;
    }
    return -1;
  });
}

/**
 * column 오름차순, row 오름차순으로 레이아웃 아이템을 정렬합니다.
 *
 * Layout을 수정하지 않습니다.
 */
export function sortLayoutItemsByColRow(layout: Layout): Layout {
  return layout.slice(0).sort(function (a, b) {
    if (a.x > b.x || (a.x === b.x && a.y > b.y)) {
      return 1;
    }
    return -1;
  });
}

/**
 * initialLayout과 children을 템플릿으로 사용하여 레이아웃을 생성합니다.
 * 누락된 항목은 추가되고, 불필요한 항목은 잘립니다.
 *
 * initialLayout을 수정하지 않습니다.
 *
 * @param  {Array}  initialLayout props로 전달된 레이아웃.
 * @param  {String} breakpoint    현재 반응형 breakpoint.
 * @param  {?String} compact      압축 옵션.
 * @return {Array}                동작하는 레이아웃.
 */
export function synchronizeLayoutWithChildren(
  initialLayout: Layout,
  children: ReactChildren,
  cols: number,
  compactType: CompactType,
  allowOverlap: ?boolean
): Layout {
  initialLayout = initialLayout || [];

  // 각 child마다 하나의 레이아웃 아이템을 생성합니다.
  const layout: LayoutItem[] = [];
  React.Children.forEach(children, (child: ReactElement<any>) => {
    // Child가 존재하지 않을 수 있습니다
    if (child?.key == null) return;

    const exists = getLayoutItem(initialLayout, String(child.key));
    const g = child.props["data-grid"];
    // 이미 초기 레이아웃에 있다면 레이아웃 아이템을 덮어쓰지 않습니다.
    // `data-grid` 속성이 있다면 레이아웃에 있는 것보다 그것을 우선합니다.
    if (exists && g == null) {
      layout.push(cloneLayoutItem(exists));
    } else {
      // 이 아이템에 data-grid 속성이 있습니다. 그것을 사용하세요.
      if (g) {
        if (!isProduction) {
          validateLayout([g], "ReactGridLayout.children");
        }
        // FIXME 여기서는 복제가 실제로 필요하지 않습니다
        layout.push(cloneLayoutItem({ ...g, i: child.key }));
      } else {
        // 아무것도 제공되지 않았습니다: 이것이 하단에 추가되도록 보장합니다
        // FIXME 여기서는 복제가 실제로 필요하지 않습니다
        layout.push(
          cloneLayoutItem({
            w: 1,
            h: 1,
            x: 0,
            y: bottom(layout),
            i: String(child.key)
          })
        );
      }
    }
  });

  // 레이아웃을 수정합니다.
  const correctedLayout = correctBounds(layout, { cols: cols });
  return allowOverlap
    ? correctedLayout
    : compact(correctedLayout, compactType, cols);
}

/**
 * 레이아웃을 검증합니다. 에러가 있으면 throw합니다.
 *
 * @param  {Array}  layout        레이아웃 아이템 배열.
 * @param  {String} [contextName] 에러 메시지에 사용할 컨텍스트 이름.
 * @throw  {Error}                검증 에러.
 */
export function validateLayout(
  layout: Layout,
  contextName: string = "Layout"
): void {
  const subProps = ["x", "y", "w", "h"];
  if (!Array.isArray(layout))
    throw new Error(contextName + " must be an array!");
  for (let i = 0, len = layout.length; i < len; i++) {
    const item = layout[i];
    for (let j = 0; j < subProps.length; j++) {
      const key = subProps[j];
      const value = item[key];
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(
          `ReactGridLayout: ${contextName}[${i}].${key} must be a number! Received: ${value} (${typeof value})`
        );
      }
    }
    if (typeof item.i !== "undefined" && typeof item.i !== "string") {
      throw new Error(
        `ReactGridLayout: ${contextName}[${i}].i must be a string! Received: ${
          item.i
        } (${typeof item.i})`
      );
    }
  }
}

// verticalCompact: false에 대한 레거시 지원
export function compactType(
  props: ?{ verticalCompact: boolean, compactType: CompactType }
): CompactType {
  const { verticalCompact, compactType } = props || {};
  return verticalCompact === false ? null : compactType;
}

export function getCombinedSize(dragging: LayoutItem, dropping: LayoutItem) {
  const minX = Math.min(dragging.x, dropping.x);
  const maxX = Math.max(dragging.x + dragging.w, dropping.x + dropping.w);

  const minY = Math.min(dragging.y, dropping.y);
  const maxY = Math.max(dragging.y + dragging.h, dropping.y + dropping.h);

  return {
    w: maxX - minX,
    h: maxY - minY
  }
}

function log(...args) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(...args);
}

export const noop = () => {};
