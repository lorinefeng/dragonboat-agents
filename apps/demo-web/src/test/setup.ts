import "@testing-library/jest-dom/vitest";

function testRect(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({})
  };
}

if (typeof Element !== "undefined") {
  const getBoundingClientRect = Element.prototype.getBoundingClientRect;

  Element.prototype.getBoundingClientRect = function () {
    const rect = getBoundingClientRect.call(this);

    if (rect.width > 0 || rect.height > 0) {
      return rect;
    }

    if (this.classList.contains("graph-steerer-card")) {
      return testRect(340, 210);
    }

    if (this.classList.contains("graph-agent-card")) {
      return testRect(282, 176);
    }

    if (this.classList.contains("react-flow__handle")) {
      return testRect(8, 8);
    }

    if (this.classList.contains("crew-flow-stage") || this.classList.contains("react-flow")) {
      return testRect(1200, 620);
    }

    return rect;
  };
}

class TestResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    const rect = target.getBoundingClientRect();
    this.callback(
      [
        {
          target,
          contentRect: rect
        } as ResizeObserverEntry
      ],
      this
    );

    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

globalThis.ResizeObserver = TestResizeObserver;

class TestDOMMatrixReadOnly {
  m22 = 1;

  constructor(transform?: string) {
    const matrix = transform?.match(/matrix\(([^)]+)\)/)?.[1];
    const scale = transform?.match(/scale\(([^)]+)\)/)?.[1];

    if (matrix) {
      const parts = matrix.split(",").map((part) => Number(part.trim()));
      this.m22 = Number.isFinite(parts[3]) ? parts[3] : 1;
    } else if (scale) {
      const value = Number(scale.split(",").at(-1)?.trim());
      this.m22 = Number.isFinite(value) ? value : 1;
    }
  }
}

Object.defineProperty(globalThis, "DOMMatrixReadOnly", {
  configurable: true,
  value: TestDOMMatrixReadOnly
});
