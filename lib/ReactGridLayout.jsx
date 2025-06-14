// @flow
import type {
  ChildrenArray as ReactChildrenArray,
  Element as ReactElement
} from "react";
import * as React from "react";

import { deepEqual } from "fast-equals";
import clsx from "clsx";
// Types
import type {
  CompactType,
  DragOverEvent,
  DroppingPosition,
  GridDragEvent,
  GridResizeEvent,
  Layout,
  LayoutChild,
  LayoutItem
} from "./utils";
import {
  bottom,
  childrenEqual,
  cloneLayoutItem,
  compact,
  compactType,
  fastRGLPropsEqual,
  getAllCollisions,
  getLayoutItem,
  moveElement,
  noop,
  synchronizeLayoutWithChildren,
  withLayoutItem
} from "./utils";

import type { PositionParams } from "./calculateUtils";
import { calcGridItemPosition, calcXY } from "./calculateUtils";

import GridItem from "./GridItem";
import type { DefaultProps, Props } from "./ReactGridLayoutPropTypes";
import ReactGridLayoutPropTypes from "./ReactGridLayoutPropTypes";

type State = {
  activeDrag: ?LayoutItem,
  layout: Layout,
  mounted: boolean,
  oldDragItem: ?LayoutItem,
  oldLayout: ?Layout,
  oldResizeItem: ?LayoutItem,
  resizing: boolean,
  droppingDOMNode: ?ReactElement<any>,
  droppingPosition?: DroppingPosition,
  // Mirrored props
  children: ReactChildrenArray<ReactElement<any>>,
  compactType?: CompactType,
  propsLayout?: Layout,
  // Grouping related states
  groupingTarget: ?string, // 현재 드래그 중인 아이템이 위치한 타겟 아이템 ID
  groupingTimer: ?TimeoutID, // 1초 타이머 ID
  isGroupDroppable: boolean // 그룹 드롭 가능 상태
};

// End Types

const layoutClassName = "react-grid-layout";
let isFirefox = false;
// Try...catch will protect from navigator not existing (e.g. node) or a bad implementation of navigator
try {
  isFirefox = /firefox/i.test(navigator.userAgent);
} catch (e) {
  /* Ignore */
}

/**
 * A reactive, fluid grid layout with draggable, resizable components.
 */

export default class ReactGridLayout extends React.Component<Props, State> {
  // TODO publish internal ReactClass displayName transform
  static displayName: ?string = "ReactGridLayout";

  // Refactored to another module to make way for preval
  static propTypes = ReactGridLayoutPropTypes;

  static defaultProps: DefaultProps = {
    autoSize: true,
    cols: 12,
    className: "",
    style: {},
    draggableHandle: "",
    draggableCancel: "",
    containerPadding: null,
    rowHeight: 150,
    maxRows: Infinity, // infinite vertical growth
    layout: [],
    margin: [10, 10],
    isBounded: false,
    isDraggable: true,
    isResizable: true,
    allowOverlap: false,
    isDroppable: false,
    useCSSTransforms: true,
    transformScale: 1,
    verticalCompact: true,
    compactType: "vertical",
    preventCollision: false,
    droppingItem: {
      i: "__dropping-elem__",
      h: 1,
      w: 1
    },
    resizeHandles: ["se"],
    onLayoutChange: noop,
    onDragStart: noop,
    onDrag: noop,
    onDragStop: noop,
    onResizeStart: noop,
    onResize: noop,
    onResizeStop: noop,
    onDrop: noop,
    onDropDragOver: noop
  };

  state: State = {
    activeDrag: null,
    layout: synchronizeLayoutWithChildren(
      this.props.layout,
      this.props.children,
      this.props.cols,
      // Legacy support for verticalCompact: false
      compactType(this.props),
      this.props.allowOverlap
    ),
    mounted: false,
    oldDragItem: null,
    oldLayout: null,
    oldResizeItem: null,
    resizing: false,
    droppingDOMNode: null,
    children: [],
    groupingTarget: null,
    groupingTimer: null,
    isGroupDroppable: false
  };

  dragEnterCounter: number = 0;

  static getDerivedStateFromProps(
    nextProps: Props,
    prevState: State
  ): $Shape<State> | null {
    let newLayoutBase;

    if (prevState.activeDrag) {
      return null;
    }

    // Legacy support for compactType
    // Allow parent to set layout directly.
    if (
      !deepEqual(nextProps.layout, prevState.propsLayout) ||
      nextProps.compactType !== prevState.compactType
    ) {
      newLayoutBase = nextProps.layout;
    } else if (!childrenEqual(nextProps.children, prevState.children)) {
      // If children change, also regenerate the layout. Use our state
      // as the base in case because it may be more up to date than
      // what is in props.
      newLayoutBase = prevState.layout;
    }

    // We need to regenerate the layout.
    if (newLayoutBase) {
      const newLayout = synchronizeLayoutWithChildren(
        newLayoutBase,
        nextProps.children,
        nextProps.cols,
        compactType(nextProps),
        nextProps.allowOverlap
      );

      return {
        layout: newLayout,
        // We need to save these props to state for using
        // getDerivedStateFromProps instead of componentDidMount (in which we would get extra rerender)
        compactType: nextProps.compactType,
        children: nextProps.children,
        propsLayout: nextProps.layout
      };
    }

    return null;
  }

  componentDidMount() {
    this.setState({ mounted: true });
    // Possibly call back with layout on mount. This should be done after correcting the layout width
    // to ensure we don't rerender with the wrong width.
    this.onLayoutMaybeChanged(this.state.layout, this.props.layout);
  }

  shouldComponentUpdate(nextProps: Props, nextState: State): boolean {
    return (
      // NOTE: this is almost always unequal. Therefore the only way to get better performance
      // from SCU is if the user intentionally memoizes children. If they do, and they can
      // handle changes properly, performance will increase.
      this.props.children !== nextProps.children ||
      !fastRGLPropsEqual(this.props, nextProps, deepEqual) ||
      this.state.activeDrag !== nextState.activeDrag ||
      this.state.mounted !== nextState.mounted ||
      this.state.droppingPosition !== nextState.droppingPosition ||
      // 그룹화 관련 상태들 추가
      this.state.groupingTarget !== nextState.groupingTarget ||
      this.state.isGroupDroppable !== nextState.isGroupDroppable
    );
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (!this.state.activeDrag) {
      const newLayout = this.state.layout;
      const oldLayout = prevState.layout;

      this.onLayoutMaybeChanged(newLayout, oldLayout);
    }
  }

  /**
   * Calculates a pixel value for the container.
   * @return {String} Container height in pixels.
   */
  containerHeight(): ?string {
    if (!this.props.autoSize) return;
    const nbRow = bottom(this.state.layout);
    const containerPaddingY = this.props.containerPadding
      ? this.props.containerPadding[1]
      : this.props.margin[1];
    return (
      nbRow * this.props.rowHeight +
      (nbRow - 1) * this.props.margin[1] +
      containerPaddingY * 2 +
      "px"
    );
  }

  /**
   * When dragging starts
   * @param {String} i Id of the child
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDragStart: (i: string, x: number, y: number, GridDragEvent) => void = (
    i: string,
    x: number,
    y: number,
    { e, node }: GridDragEvent
  ) => {
    const { layout } = this.state;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    // Create placeholder (display only)
    const placeholder = {
      w: l.w,
      h: l.h,
      x: l.x,
      y: l.y,
      placeholder: true,
      i: i
    };

    // 그룹화 상태 초기화
    if (this.state.groupingTimer) {
      clearTimeout(this.state.groupingTimer);
    }

    this.setState({
      oldDragItem: cloneLayoutItem(l),
      oldLayout: layout,
      activeDrag: placeholder,
      groupingTarget: null,
      groupingTimer: null,
      isGroupDroppable: false
    });

    return this.props.onDragStart(layout, l, l, null, e, node);
  };

  /**
   * Each drag movement create a new dragelement and move the element to the dragged location
   * @param {String} i Id of the child
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDrag: (i: string, x: number, y: number, GridDragEvent) => void = (
    i,
    x,
    y,
    { e, node }
  ) => {
    const { layout } = this.state;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    // 그룹화 타겟 추적 로직 (마우스 이벤트 기반)
    if (e && node) {
      this.handleGroupingTarget(i, e, node);
    }
  };

  /**
   * When dragging stops, figure out which position the element is closest to and update its x and y.
   * @param  {String} i Index of the child.
   * @param {Number} x X position of the move
   * @param {Number} y Y position of the move
   * @param {Event} e The mousedown event
   * @param {Element} node The current dragging DOM element
   */
  onDragStop: (i: string, x: number, y: number, GridDragEvent) => void = (
    i,
    x,
    y,
    { e, node }
  ) => {
    if (!this.state.activeDrag) return;

    const { oldDragItem } = this.state;
    let { layout } = this.state;
    const { cols, preventCollision, allowOverlap } = this.props;
    const { isGroupDroppable, groupingTarget } = this.state;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    if (isGroupDroppable && groupingTarget !== null) {
      layout = this.performGrouping(
        layout,
        i,
        groupingTarget,
        cols,
        allowOverlap
      );
    }

    // 그룹화가 일어나지 않았다면 일반적인 드래그 이동 처리
    if (!isGroupDroppable || groupingTarget === null) {
      // Move the element here
      const isUserAction = true;
      layout = moveElement(
        layout,
        l,
        x,
        y,
        isUserAction,
        preventCollision,
        compactType(this.props),
        cols,
        allowOverlap
      );
    }

    // Set state
    const newLayout = allowOverlap
      ? layout
      : compact(layout, compactType(this.props), cols);

    this.props.onDragStop(newLayout, oldDragItem, l, null, e, node);

    // 그룹화 타이머 정리
    if (this.state.groupingTimer) {
      clearTimeout(this.state.groupingTimer);
    }

    const { oldLayout } = this.state;
    this.setState({
      activeDrag: null,
      layout: newLayout,
      oldDragItem: null,
      oldLayout: null,
      groupingTarget: null,
      groupingTimer: null,
      isGroupDroppable: false
    });

    this.onLayoutMaybeChanged(newLayout, oldLayout);
  };

  onLayoutMaybeChanged(newLayout: Layout, oldLayout: ?Layout) {
    if (!oldLayout) oldLayout = this.state.layout;

    if (!deepEqual(oldLayout, newLayout)) {
      this.props.onLayoutChange(newLayout);
    }
  }

  onResizeStart: (i: string, w: number, h: number, GridResizeEvent) => void = (
    i,
    w,
    h,
    { e, node }
  ) => {
    const { layout } = this.state;
    const l = getLayoutItem(layout, i);
    if (!l) return;

    this.setState({
      oldResizeItem: cloneLayoutItem(l),
      oldLayout: this.state.layout,
      resizing: true
    });

    this.props.onResizeStart(layout, l, l, null, e, node);
  };

  onResize: (i: string, w: number, h: number, GridResizeEvent) => void = (
    i,
    w,
    h,
    { e, node, handle }
  ) => {
    const { oldResizeItem } = this.state;
    const { layout } = this.state;
    const { cols, preventCollision, allowOverlap } = this.props;

    let shouldMoveItem = false;
    let finalLayout;
    let x;
    let y;

    const [newLayout, l] = withLayoutItem(layout, i, l => {
      let hasCollisions;
      x = l.x;
      y = l.y;
      if (["sw", "w", "nw", "n", "ne"].indexOf(handle) !== -1) {
        if (["sw", "nw", "w"].indexOf(handle) !== -1) {
          x = l.x + (l.w - w);
          w = l.x !== x && x < 0 ? l.w : w;
          x = x < 0 ? 0 : x;
        }

        if (["ne", "n", "nw"].indexOf(handle) !== -1) {
          y = l.y + (l.h - h);
          h = l.y !== y && y < 0 ? l.h : h;
          y = y < 0 ? 0 : y;
        }

        shouldMoveItem = true;
      }

      // Something like quad tree should be used
      // to find collisions faster
      if (preventCollision && !allowOverlap) {
        const collisions = getAllCollisions(layout, {
          ...l,
          w,
          h,
          x,
          y
        }).filter(layoutItem => layoutItem.i !== l.i);
        hasCollisions = collisions.length > 0;

        // If we're colliding, we need adjust the placeholder.
        if (hasCollisions) {
          // Reset layoutItem dimensions if there were collisions
          y = l.y;
          h = l.h;
          x = l.x;
          w = l.w;
          shouldMoveItem = false;
        }
      }

      l.w = w;
      l.h = h;

      return l;
    });

    // Shouldn't ever happen, but typechecking makes it necessary
    if (!l) return;

    finalLayout = newLayout;
    if (shouldMoveItem) {
      // Move the element to the new position.
      const isUserAction = true;
      finalLayout = moveElement(
        newLayout,
        l,
        x,
        y,
        isUserAction,
        this.props.preventCollision,
        compactType(this.props),
        cols,
        allowOverlap
      );
    }

    // Create placeholder element (display only)
    const placeholder = {
      w: l.w,
      h: l.h,
      x: l.x,
      y: l.y,
      static: true,
      i: i
    };

    this.props.onResize(finalLayout, oldResizeItem, l, placeholder, e, node);

    // Re-compact the newLayout and set the drag placeholder.
    this.setState({
      layout: allowOverlap
        ? finalLayout
        : compact(finalLayout, compactType(this.props), cols),
      activeDrag: placeholder
    });
  };

  onResizeStop: (i: string, w: number, h: number, GridResizeEvent) => void = (
    i,
    w,
    h,
    { e, node }
  ) => {
    const { layout, oldResizeItem } = this.state;
    const { cols, allowOverlap } = this.props;
    const l = getLayoutItem(layout, i);

    // Set state
    const newLayout = allowOverlap
      ? layout
      : compact(layout, compactType(this.props), cols);

    this.props.onResizeStop(newLayout, oldResizeItem, l, null, e, node);

    const { oldLayout } = this.state;
    this.setState({
      activeDrag: null,
      layout: newLayout,
      oldResizeItem: null,
      oldLayout: null,
      resizing: false
    });

    this.onLayoutMaybeChanged(newLayout, oldLayout);
  };

  /**
   * Create a placeholder object.
   * @return {Element} Placeholder div.
   */
  placeholder(): ?ReactElement<any> {
    const { activeDrag } = this.state;
    if (!activeDrag) return null;
    const {
      width,
      cols,
      margin,
      containerPadding,
      rowHeight,
      maxRows,
      useCSSTransforms,
      transformScale
    } = this.props;

    // {...this.state.activeDrag} is pretty slow, actually
    return (
      <GridItem
        w={activeDrag.w}
        h={activeDrag.h}
        x={activeDrag.x}
        y={activeDrag.y}
        i={activeDrag.i}
        className={`react-grid-placeholder ${
          this.state.resizing ? "placeholder-resizing" : ""
        }`}
        containerWidth={width}
        cols={cols}
        margin={margin}
        containerPadding={containerPadding || margin}
        maxRows={maxRows}
        rowHeight={rowHeight}
        isDraggable={false}
        isResizable={false}
        isBounded={false}
        useCSSTransforms={useCSSTransforms}
        transformScale={transformScale}
      >
        <div />
      </GridItem>
    );
  }

  /**
   * Given a grid item, set its style attributes & surround in a <Draggable>.
   * @param  {Element} child React element.
   * @return {Element}       Element wrapped in draggable and properly placed.
   */
  processGridItem(
    child: ReactElement<any>,
    isDroppingItem?: boolean
  ): ?ReactElement<any> {
    if (!child || !child.key) return;
    const l = getLayoutItem(
      this.state.layout,
      this.getCleanedKey(String(child.key))
    );
    if (!l) return null;
    const {
      width,
      cols,
      margin,
      containerPadding,
      rowHeight,
      maxRows,
      isDraggable,
      isResizable,
      isBounded,
      useCSSTransforms,
      transformScale,
      draggableCancel,
      draggableHandle,
      resizeHandles,
      resizeHandle
    } = this.props;
    const { mounted, droppingPosition, groupingTarget, isGroupDroppable } =
      this.state;

    // Determine user manipulations possible.
    // If an item is static, it can't be manipulated by default.
    // Any properties defined directly on the grid item will take precedence.
    const draggable =
      typeof l.isDraggable === "boolean"
        ? l.isDraggable
        : !l.static && isDraggable;
    const resizable =
      typeof l.isResizable === "boolean"
        ? l.isResizable
        : !l.static && isResizable;
    const resizeHandlesOptions = l.resizeHandles || resizeHandles;

    // isBounded set on child if set on parent, and child is not explicitly false
    const bounded = draggable && isBounded && l.isBounded !== false;

    // 그룹화 관련 CSS 클래스 결정
    const isGroupingTarget = groupingTarget === l.i;

    return (
      <GridItem
        key={child.key}
        containerWidth={width}
        cols={cols}
        margin={margin}
        containerPadding={containerPadding || margin}
        maxRows={maxRows}
        rowHeight={rowHeight}
        cancel={draggableCancel}
        handle={draggableHandle}
        onDragStop={this.onDragStop}
        onDragStart={this.onDragStart}
        onDrag={this.onDrag}
        onResizeStart={this.onResizeStart}
        onResize={this.onResize}
        onResizeStop={this.onResizeStop}
        isDraggable={draggable}
        isResizable={resizable}
        isBounded={bounded}
        useCSSTransforms={useCSSTransforms && mounted}
        usePercentages={!mounted}
        transformScale={transformScale}
        w={l.w}
        h={l.h}
        x={l.x}
        y={l.y}
        i={l.i}
        minH={l.minH}
        minW={l.minW}
        maxH={l.maxH}
        maxW={l.maxW}
        static={l.static}
        droppingPosition={isDroppingItem ? droppingPosition : undefined}
        resizeHandles={resizeHandlesOptions}
        resizeHandle={resizeHandle}
        style={{
          position: "relative"
        }}
      >
        <div style={{ position: "relative" }}>
          {isGroupingTarget && isGroupDroppable && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "black",
                opacity: 0.3,
                color: "white"
              }}
            >
              그룹화 가능
            </div>
          )}
          {child}
        </div>
      </GridItem>
    );
  }

  // Called while dragging an element. Part of browser native drag/drop API.
  // Native event target might be the layout itself, or an element within the layout.
  onDragOver: DragOverEvent => void | false = e => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();

    // we should ignore events from layout's children in Firefox
    // to avoid unpredictable jumping of a dropping placeholder
    // FIXME remove this hack
    if (
      isFirefox &&
      // $FlowIgnore can't figure this out
      !e.nativeEvent.target?.classList.contains(layoutClassName)
    ) {
      return false;
    }

    const {
      droppingItem,
      onDropDragOver,
      margin,
      cols,
      rowHeight,
      maxRows,
      width,
      containerPadding,
      transformScale
    } = this.props;
    // Allow user to customize the dropping item or short-circuit the drop based on the results
    // of the `onDragOver(e: Event)` callback.
    const onDragOverResult = onDropDragOver?.(e);
    if (onDragOverResult === false) {
      if (this.state.droppingDOMNode) {
        this.removeDroppingPlaceholder();
      }
      return false;
    }
    const finalDroppingItem = { ...droppingItem, ...onDragOverResult };

    const { layout } = this.state;

    // $FlowIgnore missing def
    const gridRect = e.currentTarget.getBoundingClientRect(); // The grid's position in the viewport

    // Calculate the mouse position relative to the grid
    const layerX = e.clientX - gridRect.left;
    const layerY = e.clientY - gridRect.top;
    const droppingPosition = {
      left: layerX / transformScale,
      top: layerY / transformScale,
      e
    };

    if (!this.state.droppingDOMNode) {
      const positionParams: PositionParams = {
        cols,
        margin,
        maxRows,
        rowHeight,
        containerWidth: width,
        containerPadding: containerPadding || margin
      };

      const calculatedPosition = calcXY(
        positionParams,
        layerY,
        layerX,
        finalDroppingItem.w,
        finalDroppingItem.h
      );

      this.setState({
        droppingDOMNode: <div key={finalDroppingItem.i} />,
        droppingPosition,
        layout: [
          ...layout,
          {
            ...finalDroppingItem,
            x: calculatedPosition.x,
            y: calculatedPosition.y,
            static: false,
            isDraggable: true
          }
        ]
      });
    } else if (this.state.droppingPosition) {
      const { left, top } = this.state.droppingPosition;
      const shouldUpdatePosition = left != layerX || top != layerY;
      if (shouldUpdatePosition) {
        this.setState({ droppingPosition });
      }
    }
  };

  removeDroppingPlaceholder: () => void = () => {
    const { droppingItem, cols } = this.props;
    const { layout } = this.state;

    const newLayout = compact(
      layout.filter(l => l.i !== droppingItem.i),
      compactType(this.props),
      cols,
      this.props.allowOverlap
    );

    this.setState({
      layout: newLayout,
      droppingDOMNode: null,
      activeDrag: null,
      droppingPosition: undefined
    });
  };

  onDragLeave: EventHandler = e => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();
    this.dragEnterCounter--;

    // onDragLeave can be triggered on each layout's child.
    // But we know that count of dragEnter and dragLeave events
    // will be balanced after leaving the layout's container
    // so we can increase and decrease count of dragEnter and
    // when it'll be equal to 0 we'll remove the placeholder
    if (this.dragEnterCounter === 0) {
      this.removeDroppingPlaceholder();
    }
  };

  onDragEnter: EventHandler = e => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();
    this.dragEnterCounter++;
  };

  onDrop: EventHandler = (e: Event) => {
    e.preventDefault(); // Prevent any browser native action
    e.stopPropagation();
    const { droppingItem } = this.props;
    const { layout } = this.state;
    const item = layout.find(l => l.i === droppingItem.i);

    // reset dragEnter counter on drop
    this.dragEnterCounter = 0;

    this.removeDroppingPlaceholder();

    this.props.onDrop(layout, item, e);
  };

  /**
   * 드래그 중인 아이템이 어떤 다른 아이템 위에 있는지 감지하고 그룹화 타겟을 추적
   */
  handleGroupingTarget = (
    draggedItemId: string,
    mouseEvent: MouseEvent,
    node: HTMLElement
  ) => {
    const { layout } = this.state;
    const draggedItem = getLayoutItem(layout, draggedItemId);
    if (!draggedItem) return;

    // 마우스 포인터 위치에서 겹치는 다른 아이템 찾기
    const targetItem = this.findItemAtMousePosition(
      mouseEvent,
      draggedItem,
      node
    );
    const newTargetId = targetItem ? targetItem.i : null;
    const currentTargetId = this.state.groupingTarget;

    // 타겟이 변경되었거나 없어진 경우만 처리
    if (newTargetId !== currentTargetId) {
      // 기존 타이머 제거
      if (this.state.groupingTimer) {
        clearTimeout(this.state.groupingTimer);
      }

      if (newTargetId === null) {
        // 타겟이 없는 경우: 한 번에 모든 상태 초기화
        this.setState({
          groupingTarget: null,
          groupingTimer: null,
          isGroupDroppable: false
        });
      } else {
        // 새로운 타겟인 경우: 타이머 설정과 함께 상태 업데이트
        const newTimer = setTimeout(() => {
          // 컴포넌트가 언마운트되었거나 타겟이 변경된 경우 무시
          if (this.state.groupingTarget === newTargetId) {
            this.setState({
              isGroupDroppable: true
            });
          }
        }, 1000);

        this.setState({
          groupingTarget: newTargetId,
          groupingTimer: newTimer,
          isGroupDroppable: false
        });
      }
    }
  };

  /**
   * 마우스 포인터 위치를 기반으로 해당 위치의 아이템을 찾음 (하이브리드 접근법)
   */
  findItemAtMousePosition = (
    mouseEvent: MouseEvent,
    draggedItem: LayoutItem,
    node: HTMLElement
  ) => {
    const { layout } = this.state;

    // 그리드 컨테이너 찾기 (.react-grid-layout 클래스를 가진 요소)
    const gridContainer = node.closest(".react-grid-layout");
    if (!gridContainer) return null;

    const gridRect = gridContainer.getBoundingClientRect();
    const mouseX = mouseEvent.clientX - gridRect.left;
    const mouseY = mouseEvent.clientY - gridRect.top;

    // 1단계: 마우스 위치를 그리드 좌표로 변환하여 대략적인 후보 찾기
    const { cols, margin, maxRows, rowHeight, width, containerPadding } =
      this.props;
    const positionParams: PositionParams = {
      cols,
      margin,
      maxRows,
      rowHeight,
      containerWidth: width,
      containerPadding: containerPadding || margin
    };

    const gridPos = calcXY(positionParams, mouseY, mouseX, 1, 1);

    const candidates = [];
    for (const item of layout) {
      if (item.i === draggedItem.i) continue; // 드래그 중인 아이템 제외
      if (item.static) continue; // 정적 아이템 제외

      // 그리드 좌표 기반 충돌 확인 (여유 마진 포함)
      if (
        !(
          gridPos.x > item.x + item.w ||
          item.x > gridPos.x + 1 ||
          gridPos.y > item.y + item.h ||
          item.y > gridPos.y + 1
        )
      ) {
        candidates.push(item);
      }
    }

    // 2단계: 픽셀 단위로 정확한 충돌 감지
    for (const candidate of candidates) {
      const pixelPos = calcGridItemPosition(
        positionParams,
        candidate.x,
        candidate.y,
        candidate.w,
        candidate.h,
        this.state
      );

      // 마우스가 아이템의 픽셀 경계 내에 있는지 확인
      if (
        mouseX >= pixelPos.left &&
        mouseX <= pixelPos.left + pixelPos.width &&
        mouseY >= pixelPos.top &&
        mouseY <= pixelPos.top + pixelPos.height
      ) {
        return candidate;
      }
    }

    return null;
  };

  /**
   * 두 아이템이 겹치는지 확인
   */
  isItemsOverlapping = (item1: LayoutItem, item2: LayoutItem) => {
    return !(
      (
        item1.x + item1.w <= item2.x || // item1이 item2 왼쪽에 있음
        item2.x + item2.w <= item1.x || // item2가 item1 왼쪽에 있음
        item1.y + item1.h <= item2.y || // item1이 item2 위에 있음
        item2.y + item2.h <= item1.y
      ) // item2가 item1 위에 있음
    );
  };

  /**
   * 컴포넌트 언마운트 시 타이머 정리
   */
  componentWillUnmount() {
    if (this.state.groupingTimer) {
      clearTimeout(this.state.groupingTimer);
    }
  }

  /**
   * 그룹화 로직을 한 번에 처리하는 최적화된 메서드
   */
  performGrouping = (
    layout: Layout,
    draggedItemId: string,
    targetId: string,
    _cols: number,
    _allowOverlap: boolean
  ): Layout => {
    const draggingTarget = layout.find(item => item.i === draggedItemId);
    const droppingTarget = layout.find(item => item.i === targetId);

    if (!draggingTarget || !droppingTarget) {
      return layout;
    }

    // 일반 -> 일반: 새 그룹 생성
    if (!draggingTarget.isGroup && !droppingTarget.isGroup) {
      return this.createNewGroup(layout, draggingTarget, droppingTarget);
    }

    // 일반 -> 그룹: 기존 그룹에 추가
    if (!draggingTarget.isGroup && droppingTarget.isGroup) {
      return this.addToExistingGroup(layout, draggingTarget, droppingTarget);
    }

    return layout;
  };

  /**
   * 새로운 그룹 생성 (최적화된 버전)
   */
  createNewGroup = (
    layout: Layout,
    draggingItem: LayoutItem,
    targetItem: LayoutItem
  ): Layout => {
    const groupId = `group-${Date.now()}`;

    // 기존 아이템들 제거
    const newLayout = layout.filter(
      item => item.i !== draggingItem.i && item.i !== targetItem.i
    );

    // 그룹 레이아웃 계산
    const groupLayout = this.createOptimalGroupLayout(draggingItem, targetItem);

    // 그룹 아이템 생성하고 바로 추가
    newLayout.push({
      i: groupId,
      x: groupLayout.groupPosition.x,
      y: groupLayout.groupPosition.y,
      w: groupLayout.groupSize.w,
      h: groupLayout.groupSize.h,
      isGroup: true,
      children: groupLayout.children
    });

    return newLayout;
  };

  /**
   * 기존 그룹에 아이템 추가 (최적화된 버전)
   */
  addToExistingGroup = (
    layout: Layout,
    draggingItem: LayoutItem,
    targetGroup: LayoutItem
  ): Layout => {
    const newLayout = layout.filter(item => item.i !== draggingItem.i);
    const groupIndex = newLayout.findIndex(item => item.i === targetGroup.i);

    if (groupIndex === -1) return layout;

    // 그룹 업데이트 (불변성 유지)
    const allWidgets = [...targetGroup.children, draggingItem];
    const expandedLayout = this.calculateExpandedGroupLayout(
      allWidgets,
      targetGroup
    );

    newLayout[groupIndex] = {
      ...targetGroup,
      children: expandedLayout.children,
      w: expandedLayout.w,
      h: expandedLayout.h
    };

    return newLayout;
  };

  /**
   * React child key와 layout item id를 매칭하는 헬퍼 함수
   * React는 key에 ".$" prefix를 붙이므로 이를 고려한 매칭
   */
  matchChildWithLayoutItem = (
    child: ReactElement<any>,
    layoutItemId: string
  ): boolean => {
    const childKey = child.key;
    if (!childKey) return false;

    // React key prefix ".$"를 제거하고 비교
    const cleanKey = this.getCleanedKey(childKey);
    return cleanKey === layoutItemId;
  };

  getCleanedKey(key: string) {
    // React는 key에 다양한 prefix를 붙일 수 있음 (".$", "." 등)
    // 이런 prefix들을 모두 제거하고 원래 key만 반환
    return String(key).replace(/^\.(\$)?/, "");
  }

  /**
   * 두 아이템으로부터 최적의 그룹 레이아웃을 생성
   * 그룹 위치는 타겟 아이템(드롭된 위치)의 위치를 우선으로 함
   */
  createOptimalGroupLayout(draggingItem: LayoutItem, targetItem: LayoutItem) {
    // 타겟 아이템의 위치를 그룹 위치로 사용 (상호작용 우선권)
    const groupX = targetItem.x;
    const groupY = targetItem.y;

    // 두 아이템을 효율적으로 배치하는 알고리즘
    // 가로 배치를 우선으로 시도 (동일한 열에 배치하기 위해)
    const horizontalLayout = this.calculateHorizontalLayout(
      draggingItem,
      targetItem
    );
    const verticalLayout = this.calculateVerticalLayout(
      draggingItem,
      targetItem
    );

    // 가로 배치가 그리드 너비를 넘지 않으면 가로 배치 우선
    const horizontalFitsInGrid = groupX + horizontalLayout.w <= this.props.cols;
    const selectedLayout = horizontalFitsInGrid
      ? horizontalLayout
      : verticalLayout;

    return {
      groupPosition: { x: groupX, y: groupY },
      groupSize: { w: selectedLayout.w, h: selectedLayout.h },
      children: selectedLayout.children
    };
  }

  /**
   * 두 아이템을 가로로 배치하는 레이아웃 계산
   */
  calculateHorizontalLayout(item1: LayoutItem, item2: LayoutItem) {
    const totalWidth = item1.w + item2.w;
    const maxHeight = Math.max(item1.h, item2.h);

    return {
      w: totalWidth,
      h: maxHeight,
      children: [
        {
          ...item1,
          x: 0,
          y: 0
        },
        {
          ...item2,
          x: item1.w,
          y: 0
        }
      ]
    };
  }

  /**
   * 두 아이템을 세로로 배치하는 레이아웃 계산
   */
  calculateVerticalLayout(item1: LayoutItem, item2: LayoutItem) {
    const maxWidth = Math.max(item1.w, item2.w);
    const totalHeight = item1.h + item2.h;

    return {
      w: maxWidth,
      h: totalHeight,
      children: [
        {
          ...item1,
          x: 0,
          y: 0
        },
        {
          ...item2,
          x: 0,
          y: item1.h
        }
      ]
    };
  }

  /**
   * 기존 그룹에 새로운 위젯을 추가할 때 확장된 그룹 레이아웃을 계산
   * 가로 배치를 우선으로 하되, 그리드 너비를 초과하면 다음 줄로 배치
   */
  calculateExpandedGroupLayout(
    allWidgets: LayoutItem[],
    existingGroup: LayoutItem
  ) {
    const maxCols = this.props.cols;
    const groupStartX = existingGroup.x;

    // 위젯들을 가로 우선으로 배치
    let currentX = 0;
    let currentY = 0;
    let maxWidth = 0;
    let maxHeight = 0;

    const arrangedChildren = allWidgets.map(widget => {
      // 현재 위젯이 현재 줄에 들어갈 수 있는지 확인
      // 그룹의 시작 위치 + 현재 X + 위젯 너비가 전체 컬럼을 넘지 않아야 함
      const wouldFitInCurrentRow = groupStartX + currentX + widget.w <= maxCols;

      if (!wouldFitInCurrentRow && currentX > 0) {
        // 다음 줄로 이동
        currentX = 0;
        currentY += 2; // 일반적인 위젯 높이를 2로 가정 (또는 이전 줄의 최대 높이 사용)
      }

      const arrangedWidget = {
        ...widget,
        x: currentX,
        y: currentY
      };

      // 다음 위젯을 위해 X 위치 업데이트
      currentX += widget.w;

      // 전체 그룹 크기 추적
      maxWidth = Math.max(maxWidth, currentX);
      maxHeight = Math.max(maxHeight, currentY + widget.h);

      return arrangedWidget;
    });

    return {
      w: maxWidth,
      h: maxHeight,
      children: arrangedChildren
    };
  }

  processGroupItem(
    key: string,
    children: ReactElement<any>[],
    layout: LayoutChild[]
  ) {
    // 그룹 내부 레이아웃의 최대 너비 계산 (두 위젯이 나란히 배치될 수 있도록)
    const groupCols = layout.reduce((maxCols, item) => {
      return Math.max(maxCols, item.x + item.w);
    }, 1);

    // 그룹 내부 그리드의 너비를 실제 필요한 만큼 계산
    const groupWidth = this.props.width * (groupCols / this.props.cols);

    // 그룹 컨테이너를 위한 child 생성
    const groupChild = (
      <div
        key={key}
        className="react-grid-group-container"
        style={{
          width: "100%",
          height: "100%",
          overflow: "auto"
        }}
      >
        <ReactGridLayout
          style={{
            margin: 0
          }}
          layout={layout}
          cols={groupCols}
          width={groupWidth}
          rowHeight={this.props.rowHeight || 150}
          margin={[0, 0]}
          containerPadding={[0, 0]}
          isDraggable={true}
          isResizable={true}
          autoSize={true}
        >
          {layout.map(item => {
            const targetElement = children.find(element =>
              this.matchChildWithLayoutItem(element, item.i)
            );
            return targetElement ? (
              <div
                key={item.i}
                style={{ width: "100%", height: "100%", overflow: "hidden" }}
              >
                {targetElement}
              </div>
            ) : (
              <div
                key={item.i}
                style={{
                  background: "#f0f0f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  color: "#666"
                }}
              >
                Missing: {item.i}
              </div>
            );
          })}
        </ReactGridLayout>
      </div>
    );

    return this.processGridItem(groupChild);
  }

  render(): React.Element<"div"> {
    const { className, style, isDroppable, innerRef } = this.props;

    const mergedClassName = clsx(layoutClassName, className);
    const mergedStyle = {
      height: this.containerHeight(),
      ...style
    };

    return (
      <div
        ref={innerRef}
        className={mergedClassName}
        style={mergedStyle}
        onDrop={isDroppable ? this.onDrop : noop}
        onDragLeave={isDroppable ? this.onDragLeave : noop}
        onDragEnter={isDroppable ? this.onDragEnter : noop}
        onDragOver={isDroppable ? this.onDragOver : noop}
      >
        {this.state.layout.map(layoutItem => {
          const childrenArray = React.Children.toArray(this.props.children);

          if (layoutItem.isGroup) {
            // 그룹의 경우
            const childrenIds = layoutItem.children.map(child => child.i);
            const groupChildren = childrenArray.filter(child => {
              return childrenIds.some(childId =>
                this.matchChildWithLayoutItem(child, childId)
              );
            });

            return this.processGroupItem(
              layoutItem.i,
              groupChildren,
              layoutItem.children
            );
          } else {
            // 일반 아이템의 경우
            const targetChild = childrenArray.find(child => {
              return this.matchChildWithLayoutItem(child, layoutItem.i);
            });

            return targetChild ? this.processGridItem(targetChild) : null;
          }
        })}
        {isDroppable &&
          this.state.droppingDOMNode &&
          this.processGridItem(this.state.droppingDOMNode, true)}
        {this.placeholder()}
      </div>
    );
  }
}
