// 구체적인 충돌 테스트 - 11번과 8번 위젯
/* eslint-env jest */
const { moveElement } = require("../../lib/utils");

describe("Widget 11 and 8 collision test", () => {
  it("should move widget 8 to [10,0,2,2] when widget 11 moves to [8,0,2,3]", () => {
    const layout = [
      { i: "11", x: 6, y: 0, w: 2, h: 3 },  // 위젯 11
      { i: "8", x: 8, y: 0, w: 2, h: 2 }    // 위젯 8
    ];

    console.log("=== moveElement 직접 테스트 ===");
    console.log("초기 레이아웃:", layout);

    // 11번을 (8, 0) 위치로 이동 - compactType null
    const oldItem = layout.find(item => item.i === "11");
    console.log("Old item before moveElement:", oldItem);
    
    const result = moveElement(
      layout,
      oldItem, // old item (실제 layout에서 가져온 객체)
      8, 0, // new x, y
      true, // isUserAction
      false, // preventCollision = false (충돌 방지 안함)
      null, // compactType = null
      12, // cols
      false // allowOverlap = false
    );

    console.log("moveElement 결과:", result);

    const widget11 = result.find(item => item.i === "11");
    const widget8 = result.find(item => item.i === "8");

    console.log("위젯 11 최종 위치:", widget11);
    console.log("위젯 8 최종 위치:", widget8);

    // 검증
    expect(widget11.x).toBe(8);
    expect(widget11.y).toBe(0);
    expect(widget11.w).toBe(2);
    expect(widget11.h).toBe(3);

    // 8번은 밀려나서 x=10 위치로 가야 함
    expect(widget8.x).toBe(10);
    expect(widget8.y).toBe(0);
    expect(widget8.w).toBe(2);
    expect(widget8.h).toBe(2);

    console.log("✅ 테스트 통과!");
    console.log(`11번: [${widget11.x}, ${widget11.y}, ${widget11.w}, ${widget11.h}] (예상: [8, 0, 2, 3])`);
    console.log(`8번: [${widget8.x}, ${widget8.y}, ${widget8.w}, ${widget8.h}] (예상: [10, 0, 2, 2])`);
  });
});