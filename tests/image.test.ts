import { describe, it, expect } from 'vitest';
import { calculateTargetDimensions } from '../src/lib/image';

describe('calculateTargetDimensions', () => {
  it('preserves dimensions when both width and height are below maxEdge', () => {
    const result = calculateTargetDimensions(800, 600, 1024);
    expect(result).toEqual({ width: 800, height: 600 });
  });

  it('preserves dimensions when long edge is exactly maxEdge', () => {
    const result = calculateTargetDimensions(1024, 768, 1024);
    expect(result).toEqual({ width: 1024, height: 768 });
  });

  it('scales down landscape smartphone photos (4032 x 3024) to 1024 long edge', () => {
    const result = calculateTargetDimensions(4032, 3024, 1024);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
  });

  it('scales down portrait smartphone photos (3024 x 4032) to 1024 long edge', () => {
    const result = calculateTargetDimensions(3024, 4032, 1024);
    expect(result.width).toBe(768);
    expect(result.height).toBe(1024);
  });

  it('scales down high-res square photos (2400 x 2400) to 1024 x 1024', () => {
    const result = calculateTargetDimensions(2400, 2400, 1024);
    expect(result).toEqual({ width: 1024, height: 1024 });
  });

  it('handles extreme panoramic aspect ratios cleanly', () => {
    const result = calculateTargetDimensions(5000, 500, 1024);
    expect(result.width).toBe(1024);
    expect(result.height).toBe(102);
  });

  it('throws an error for non-positive dimensions', () => {
    expect(() => calculateTargetDimensions(0, 100)).toThrow('dimensions must be positive');
    expect(() => calculateTargetDimensions(-50, -50)).toThrow('dimensions must be positive');
  });
});
