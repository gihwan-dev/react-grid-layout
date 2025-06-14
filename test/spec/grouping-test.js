// @flow
/* eslint-env jest */

import React from "react";
import { mount } from "enzyme";
import ReactGridLayout from "../../lib/ReactGridLayout";
import { moveElement, compact, compactType, getAllCollisions } from "../../lib/utils";

describe("Grouping functionality", () => {
  let mockLayout, mockChildren, defaultProps;

  beforeEach(() => {
    mockLayout = [
      { i: "a", x: 0, y: 0, w: 2, h: 2 },
      { i: "b", x: 2, y: 0, w: 2, h: 2 },
      { i: "c", x: 4, y: 0, w: 2, h: 2 },  // 정확히 맞는 상황
      { i: "d", x: 0, y: 2, w: 2, h: 2 }
    ];

    mockChildren = [
      <div key="a">A</div>,
      <div key="b">B</div>, 
      <div key="c">C</div>,
      <div key="d">D</div>
    ];

    defaultProps = {
      className: "layout",
      layout: mockLayout,
      cols: 6,  // 정확히 3개 위젯이 가로로 맞는 크기
      rowHeight: 150,
      width: 600,
      margin: [10, 10],
      containerPadding: [10, 10],
      isDraggable: true,
      isResizable: true,
      compactType: "vertical"
    };
  });

  describe("createOptimalGroupLayout", () => {
    it("should prioritize horizontal layout when it fits in grid", () => {
      const wrapper = mount(
        <ReactGridLayout {...defaultProps}>
          {mockChildren}
        </ReactGridLayout>
      );
      
      const instance = wrapper.instance();
      const draggingItem = { i: "a", x: 0, y: 0, w: 2, h: 2 };
      const targetItem = { i: "b", x: 2, y: 0, w: 2, h: 2 };
      
      const result = instance.createOptimalGroupLayout(draggingItem, targetItem);
      
      // 타겟 위치를 사용해야 함
      expect(result.groupPosition.x).toBe(2);
      expect(result.groupPosition.y).toBe(0);
      
      // 가로 배치여야 함 (w=4, h=2)
      expect(result.groupSize.w).toBe(4);
      expect(result.groupSize.h).toBe(2);
      
      // 첫 번째 아이템은 (0,0), 두 번째는 (2,0)에 배치
      expect(result.children[0].x).toBe(0);
      expect(result.children[0].y).toBe(0);
      expect(result.children[1].x).toBe(2);
      expect(result.children[1].y).toBe(0);
    });

    it("should fall back to vertical layout when horizontal doesn't fit", () => {
      const wrapper = mount(
        <ReactGridLayout {...defaultProps}>
          {mockChildren}
        </ReactGridLayout>
      );
      
      const instance = wrapper.instance();
      const draggingItem = { i: "a", x: 0, y: 0, w: 2, h: 2 };
      const targetItem = { i: "c", x: 4, y: 0, w: 2, h: 2 }; // 끝에 있는 위젯
      
      const result = instance.createOptimalGroupLayout(draggingItem, targetItem);
      
      // 타겟 위치를 사용해야 함
      expect(result.groupPosition.x).toBe(4);
      expect(result.groupPosition.y).toBe(0);
      
      // 가로 배치가 그리드를 넘으므로 세로 배치여야 함 (w=2, h=4)
      expect(result.groupSize.w).toBe(2);
      expect(result.groupSize.h).toBe(4);
    });
  });

  describe("collision handling with getAllCollisions and moveElementAwayFromCollision", () => {
    it("should detect collisions when group overlaps with existing widgets", () => {
      const layout = [
        { i: "c", x: 4, y: 0, w: 2, h: 2 }
      ];
      
      const groupItem = {
        i: "group-1",
        x: 2,
        y: 0,
        w: 4,  // x:2~5 범위를 차지하므로 c(x:4~5)와 겹침
        h: 2,
        isGroup: true
      };
      
      // getAllCollisions로 충돌 감지
      const collisions = getAllCollisions([...layout, groupItem], groupItem);
      expect(collisions.length).toBe(1);
      expect(collisions[0].i).toBe("c");
    });
  });

  describe("full grouping workflow simulation", () => {
    it("should maintain group position when compactType is null", () => {
      const propsWithNoCompact = {
        ...defaultProps,
        compactType: null  // compactType 없음
      };
      
      const wrapper = mount(
        <ReactGridLayout {...propsWithNoCompact}>
          {mockChildren}
        </ReactGridLayout>
      );
      
      const instance = wrapper.instance();
      
      // 그룹화 상태 설정
      instance.setState({
        groupingTarget: "b",
        isGroupDroppable: true,
        activeDrag: { i: "a", x: 0, y: 0, w: 2, h: 2 },
        oldDragItem: { i: "a", x: 0, y: 0, w: 2, h: 2 }
      });
      
      // onDragStop 호출하여 실제 그룹화 로직 실행
      instance.onDragStop("a", 2, 0, { e: {}, node: {} });
      
      const finalLayout = instance.state.layout;
      const group = finalLayout.find(item => item.isGroup);
      
      console.log("Final layout with compactType=null:", finalLayout);
      console.log("Group position with compactType=null:", group);
      
      expect(group).toBeTruthy();
      // 그룹이 타겟(b)의 원래 위치(x:2, y:0)에 있어야 함
      expect(group.x).toBe(2);
      expect(group.y).toBe(0);
    });

    it("should handle complex collision scenario with compactType null", () => {
      // 더 복잡한 레이아웃으로 문제 재현 시도
      const complexLayout = [
        { i: "a", x: 0, y: 0, w: 2, h: 2 },
        { i: "b", x: 2, y: 0, w: 2, h: 2 },
        { i: "c", x: 4, y: 0, w: 2, h: 2 },  
        { i: "d", x: 0, y: 2, w: 2, h: 2 },
        { i: "e", x: 2, y: 2, w: 2, h: 2 },  // b 아래에 위치
        { i: "f", x: 4, y: 2, w: 2, h: 2 }   // c 아래에 위치
      ];

      const complexChildren = [
        <div key="a">A</div>,
        <div key="b">B</div>, 
        <div key="c">C</div>,
        <div key="d">D</div>,
        <div key="e">E</div>,
        <div key="f">F</div>
      ];

      const propsWithNoCompact = {
        ...defaultProps,
        layout: complexLayout,
        compactType: null
      };
      
      const wrapper = mount(
        <ReactGridLayout {...propsWithNoCompact}>
          {complexChildren}
        </ReactGridLayout>
      );
      
      const instance = wrapper.instance();
      
      // 그룹화 상태 설정 - a를 b에 드롭
      instance.setState({
        groupingTarget: "b",
        isGroupDroppable: true,
        activeDrag: { i: "a", x: 0, y: 0, w: 2, h: 2 },
        oldDragItem: { i: "a", x: 0, y: 0, w: 2, h: 2 }
      });
      
      console.log("Before grouping (complex):", instance.state.layout);
      
      // onDragStop 호출
      instance.onDragStop("a", 2, 0, { e: {}, node: {} });
      
      const finalLayout = instance.state.layout;
      const group = finalLayout.find(item => item.isGroup);
      
      console.log("After grouping (complex):", finalLayout);
      console.log("Group position (complex):", group);
      
      expect(group).toBeTruthy();
      
      // 그룹이 예상 위치에 있는지 확인
      console.log(`Expected group at x:2, y:0 but got x:${group.x}, y:${group.y}`);
    });

    it("should create group and handle displacement correctly with onDragStop", () => {
      const wrapper = mount(
        <ReactGridLayout {...defaultProps}>
          {mockChildren}
        </ReactGridLayout>
      );
      
      const instance = wrapper.instance();
      
      // 그룹화 상태 설정
      instance.setState({
        groupingTarget: "b",  // b를 타겟으로 설정
        isGroupDroppable: true,  // 그룹화 가능 상태
        activeDrag: { i: "a", x: 0, y: 0, w: 2, h: 2 },  // 활성 드래그 설정
        oldDragItem: { i: "a", x: 0, y: 0, w: 2, h: 2 }  // 이전 드래그 아이템
      });
      
      // onDragStop 호출하여 실제 그룹화 로직 실행
      instance.onDragStop("a", 2, 0, { e: {}, node: {} });
      
      // 최종 레이아웃 확인
      const finalLayout = instance.state.layout;
      
      console.log("Final layout after onDragStop:", finalLayout);
      
      // 그룹이 생성되었는지 확인
      const group = finalLayout.find(item => item.isGroup);
      expect(group).toBeTruthy();
      
      if (group) {
        console.log("Group created:", group);
        
        // c 위젯이 적절히 이동되었는지 확인
        const cItem = finalLayout.find(item => item.i === "c");
        expect(cItem).toBeTruthy();
        
        console.log("C item after grouping:", cItem);
        
        // 그룹과 c가 겹치지 않는지 확인
        const groupOccupiesX = group.x;
        const groupOccupiesXEnd = group.x + group.w;
        const cPosition = cItem.x;
        const cPositionEnd = cItem.x + cItem.w;
        
        // 같은 y 레벨에서 겹치는지 확인
        if (group.y === cItem.y) {
          const noOverlap = (cPositionEnd <= groupOccupiesX) || (cPosition >= groupOccupiesXEnd);
          console.log(`Group occupies x:${groupOccupiesX}-${groupOccupiesXEnd}, C occupies x:${cPosition}-${cPositionEnd}`);
          expect(noOverlap).toBe(true);
        }
      }
    });
  });

  describe("adding widget to existing group", () => {
    it("should expand group horizontally when adding third widget to existing group", () => {
      // 초기 레이아웃: 위젯 5, 1, 0
      const initialLayout = [
        { i: "5", x: 6, y: 0, w: 2, h: 4 },  // 위젯 5
        { i: "1", x: 8, y: 2, w: 2, h: 2 },  // 위젯 1  
        { i: "0", x: 8, y: 0, w: 2, h: 2 }   // 위젯 0
      ];

      const children = [
        <div key="5">5</div>,
        <div key="1">1</div>,
        <div key="0">0</div>
      ];

      const props = {
        ...defaultProps,
        layout: initialLayout,
        cols: 12,  // 최대 12 columns
        compactType: null
      };

      const wrapper = mount(
        <ReactGridLayout {...props}>
          {children}
        </ReactGridLayout>
      );

      const instance = wrapper.instance();

      console.log("=== 1단계: 5번과 1번 그룹화 ===");
      console.log("Before 5-1 grouping:", instance.state.layout);

      // 1단계: 5번과 1번 그룹화
      instance.setState({
        groupingTarget: "5",
        isGroupDroppable: true,
        activeDrag: { i: "1", x: 8, y: 2, w: 2, h: 2 },
        oldDragItem: { i: "1", x: 8, y: 2, w: 2, h: 2 }
      });

      instance.onDragStop("1", 6, 0, { e: {}, node: {} });

      const afterFirstGrouping = instance.state.layout;
      console.log("After 5-1 grouping:", afterFirstGrouping);

      const firstGroup = afterFirstGrouping.find(item => item.isGroup);
      expect(firstGroup).toBeTruthy();
      
      if (firstGroup) {
        console.log("First group:", firstGroup);
        // 첫 번째 그룹화 후 그룹은 [6, 0, 4, 4]여야 함
        expect(firstGroup.x).toBe(6);
        expect(firstGroup.y).toBe(0);
        expect(firstGroup.w).toBe(4);
        expect(firstGroup.h).toBe(4);
      }

      // 0번 위젯 위치 확인 (충돌로 인해 아래로 이동해야 함)
      const widget0AfterFirst = afterFirstGrouping.find(item => item.i === "0");
      console.log("Widget 0 after first grouping:", widget0AfterFirst);
      expect(widget0AfterFirst.y).toBe(4); // 그룹 아래로 이동

      console.log("=== 2단계: 그룹에 0번 추가 ===");

      // 2단계: 기존 그룹에 0번 추가
      instance.setState({
        groupingTarget: firstGroup.i,  // 기존 그룹을 타겟으로
        isGroupDroppable: true,
        activeDrag: { i: "0", x: 8, y: 4, w: 2, h: 2 },
        oldDragItem: { i: "0", x: 8, y: 4, w: 2, h: 2 }
      });

      instance.onDragStop("0", 6, 0, { e: {}, node: {} });

      const finalLayout = instance.state.layout;
      console.log("After adding 0 to group:", finalLayout);

      const finalGroup = finalLayout.find(item => item.isGroup);
      console.log("Final group:", finalGroup);

      expect(finalGroup).toBeTruthy();
      
      if (finalGroup) {
        // 3개 위젯이 가로로 배치되려면 그룹 너비가 6이 되어야 함
        console.log(`Expected group width: 6, actual: ${finalGroup.w}`);
        console.log(`Expected group position: [6, 0, 6, 4], actual: [${finalGroup.x}, ${finalGroup.y}, ${finalGroup.w}, ${finalGroup.h}]`);
        
        expect(finalGroup.x).toBe(6);
        expect(finalGroup.y).toBe(0);
        expect(finalGroup.w).toBe(6); // 3개 위젯이 가로로 배치되므로 너비 6
        expect(finalGroup.h).toBe(4);

        // 그룹 내부 위젯들도 확인
        console.log("Group children:", finalGroup.children);
        expect(finalGroup.children.length).toBe(3);
      }
    });
  });

  describe("compactType null collision handling", () => {
    it("should move widgets horizontally when there are collisions with compactType null", () => {
      const initialLayout = [
        { i: "a", x: 0, y: 0, w: 2, h: 2 },
        { i: "b", x: 3, y: 0, w: 2, h: 2 }  // 약간 떨어진 위치
      ];

      const children = [
        <div key="a">A</div>,
        <div key="b">B</div>
      ];

      const props = {
        ...defaultProps,
        layout: initialLayout,
        cols: 8,  // 더 넓은 그리드
        compactType: null
      };

      const wrapper = mount(
        <ReactGridLayout {...props}>
          {children}
        </ReactGridLayout>
      );

      const instance = wrapper.instance();

      console.log("=== compactType null 충돌 처리 테스트 ===");
      console.log("Before move:", instance.state.layout);

      // a 위젯을 b와 겹치는 위치로 드래그
      instance.setState({
        activeDrag: { i: "a", x: 0, y: 0, w: 2, h: 2 },
        oldDragItem: { i: "a", x: 0, y: 0, w: 2, h: 2 }
      });

      // a를 b와 겹치는 위치로 이동
      instance.onDragStop("a", 2, 0, { e: {}, node: {} });

      const finalLayout = instance.state.layout;
      console.log("After move:", finalLayout);

      const itemA = finalLayout.find(item => item.i === "a");
      const itemB = finalLayout.find(item => item.i === "b");

      console.log("Item A final:", itemA);
      console.log("Item B final:", itemB);

      // 충돌 처리가 발생했는지 확인
      // A가 이동했고 B도 영향을 받았는지 확인
      const originalBPosition = 3;
      const aMovedFromOrigin = itemA.x !== 0;
      const bMovedFromOrigin = itemB.x !== originalBPosition;

      console.log("A moved from origin:", aMovedFromOrigin);
      console.log("B moved from origin:", bMovedFromOrigin);

      // 최소한 하나는 이동했어야 함 (충돌 처리 발생)
      expect(aMovedFromOrigin || bMovedFromOrigin).toBe(true);

      // A와 B가 겹치지 않아야 함
      const noOverlap = (itemA.x + itemA.w <= itemB.x) || (itemB.x + itemB.w <= itemA.x);
      expect(noOverlap).toBe(true);
    });

    it("should demonstrate collision behavior with compactType horizontal vs null", () => {
      const initialLayout = [
        { i: "a", x: 0, y: 0, w: 2, h: 2 },
        { i: "b", x: 3, y: 0, w: 2, h: 2 }
      ];

      const children = [
        <div key="a">A</div>,
        <div key="b">B</div>
      ];

      // 먼저 horizontal로 테스트
      const horizontalProps = {
        ...defaultProps,
        layout: initialLayout,
        cols: 8,
        compactType: "horizontal"
      };

      const horizontalWrapper = mount(
        <ReactGridLayout {...horizontalProps}>
          {children}
        </ReactGridLayout>
      );

      const horizontalInstance = horizontalWrapper.instance();

      console.log("=== Horizontal compactType 테스트 ===");
      horizontalInstance.setState({
        activeDrag: { i: "a", x: 0, y: 0, w: 2, h: 2 },
        oldDragItem: { i: "a", x: 0, y: 0, w: 2, h: 2 }
      });

      horizontalInstance.onDragStop("a", 2, 0, { e: {}, node: {} });
      const horizontalResult = horizontalInstance.state.layout;
      console.log("Horizontal result:", horizontalResult);

      // 이제 null로 테스트
      const nullProps = {
        ...defaultProps,
        layout: initialLayout,
        cols: 8,
        compactType: null
      };

      const nullWrapper = mount(
        <ReactGridLayout {...nullProps}>
          {children}
        </ReactGridLayout>
      );

      const nullInstance = nullWrapper.instance();

      console.log("=== Null compactType 테스트 ===");
      nullInstance.setState({
        activeDrag: { i: "a", x: 0, y: 0, w: 2, h: 2 },
        oldDragItem: { i: "a", x: 0, y: 0, w: 2, h: 2 }
      });

      nullInstance.onDragStop("a", 2, 0, { e: {}, node: {} });
      const nullResult = nullInstance.state.layout;
      console.log("Null result:", nullResult);

      // 두 결과가 유사한 충돌 처리를 보여야 함
      const horizontalA = horizontalResult.find(item => item.i === "a");
      const horizontalB = horizontalResult.find(item => item.i === "b");
      const nullA = nullResult.find(item => item.i === "a");
      const nullB = nullResult.find(item => item.i === "b");

      console.log("Horizontal A:", horizontalA);
      console.log("Horizontal B:", horizontalB);
      console.log("Null A:", nullA);
      console.log("Null B:", nullB);

      // null도 충돌 처리가 되어야 함
      const nullHasCollisionHandling = nullA.x !== 0 || nullB.x !== 3;
      expect(nullHasCollisionHandling).toBe(true);
    });
  });

  describe("specific case: widget 11 and 8 collision test", () => {
    it("should handle collision between widget 11[6,0,2,3] and widget 8[8,0,2,2] when moving 11 to 8's position", () => {
      const specificLayout = [
        { i: "11", x: 6, y: 0, w: 2, h: 3 },  // 위젯 11
        { i: "8", x: 8, y: 0, w: 2, h: 2 }    // 위젯 8
      ];

      const children = [
        <div key="11">11</div>,
        <div key="8">8</div>
      ];

      const props = {
        className: "layout",
        layout: specificLayout,
        cols: 12,
        rowHeight: 30,
        width: 1200,
        margin: [10, 10],
        containerPadding: [10, 10],
        isDraggable: true,
        isResizable: true,
        compactType: null,
        allowOverlap: false
      };

      const wrapper = mount(
        <ReactGridLayout {...props}>
          {children}
        </ReactGridLayout>
      );

      const instance = wrapper.instance();

      console.log("=== 구체적 케이스: 11번 → 8번 위치로 이동 ===");
      console.log("Before move:", instance.state.layout);

      // 11번 위젯을 8번 위치 (8, 0)로 드래그
      instance.setState({
        activeDrag: { i: "11", x: 6, y: 0, w: 2, h: 3 },
        oldDragItem: { i: "11", x: 6, y: 0, w: 2, h: 3 }
      });

      // onDragStop 호출 - 11번을 (8, 0) 위치로 이동
      instance.onDragStop("11", 8, 0, { e: {}, node: {} });

      const finalLayout = instance.state.layout;
      console.log("After move:", finalLayout);

      const widget11 = finalLayout.find(item => item.i === "11");
      const widget8 = finalLayout.find(item => item.i === "8");

      console.log("Widget 11 final position:", widget11);
      console.log("Widget 8 final position:", widget8);

      // 예상 결과 검증
      expect(widget11).toBeTruthy();
      expect(widget8).toBeTruthy();

      if (widget11 && widget8) {
        // 11번은 목표 위치 [8, 0, 2, 3]에 있어야 함
        expect(widget11.x).toBe(8);
        expect(widget11.y).toBe(0);
        expect(widget11.w).toBe(2);
        expect(widget11.h).toBe(3);

        // 8번은 밀려나서 [10, 0, 2, 2]에 있어야 함
        expect(widget8.x).toBe(10);
        expect(widget8.y).toBe(0);
        expect(widget8.w).toBe(2);
        expect(widget8.h).toBe(2);

        console.log("✅ 예상 결과와 일치함");
        console.log(`11번: [${widget11.x}, ${widget11.y}, ${widget11.w}, ${widget11.h}] (예상: [8, 0, 2, 3])`);
        console.log(`8번: [${widget8.x}, ${widget8.y}, ${widget8.w}, ${widget8.h}] (예상: [10, 0, 2, 2])`);
      }
    });

    it("should test the same scenario with moveElement utility function directly", () => {
      const layout = [
        { i: "11", x: 6, y: 0, w: 2, h: 3 },
        { i: "8", x: 8, y: 0, w: 2, h: 2 }
      ];

      console.log("=== moveElement 함수 직접 테스트 ===");
      console.log("Initial layout:", layout);

      // 11번을 (8, 0) 위치로 이동
      const movedLayout = moveElement(
        layout,
        { i: "11", x: 6, y: 0, w: 2, h: 3 }, // old item
        8, 0, // new x, y
        true, // isUserAction
        null, // compactType
        12 // cols
      );

      console.log("After moveElement:", movedLayout);

      const widget11 = movedLayout.find(item => item.i === "11");
      const widget8 = movedLayout.find(item => item.i === "8");

      console.log("Direct moveElement - Widget 11:", widget11);
      console.log("Direct moveElement - Widget 8:", widget8);

      expect(widget11.x).toBe(8);
      expect(widget11.y).toBe(0);
      expect(widget8.x).toBe(10); // 밀려난 위치
      expect(widget8.y).toBe(0);
    });
  });
});