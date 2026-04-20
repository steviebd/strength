import { describe, it, expect } from 'vitest';
import {
  convertToDisplayWeight,
  convertToStorageWeight,
  formatWeight,
  getWeightIncrement,
  KG_TO_LBS,
  LBS_TO_KG,
} from './units';

describe('units', () => {
  describe('KG_TO_LBS', () => {
    it('should be approximately 2.20462', () => {
      expect(KG_TO_LBS).toBeCloseTo(2.20462, 5);
    });
  });

  describe('LBS_TO_KG', () => {
    it('should be approximately 0.453592', () => {
      expect(LBS_TO_KG).toBeCloseTo(0.453592, 5);
    });
  });

  describe('convertToDisplayWeight', () => {
    it('should convert kg to kg unchanged', () => {
      expect(convertToDisplayWeight(100, 'kg')).toBe(100);
    });

    it('should convert lbs to kg multiplied by KG_TO_LBS', () => {
      expect(convertToDisplayWeight(100, 'lbs')).toBeCloseTo(220.462, 3);
    });
  });

  describe('convertToStorageWeight', () => {
    it('should convert lbs to kg multiplied by LBS_TO_KG', () => {
      expect(convertToStorageWeight(220.462, 'lbs')).toBeCloseTo(100, 1);
    });

    it('should convert kg to kg unchanged', () => {
      expect(convertToStorageWeight(100, 'kg')).toBe(100);
    });
  });

  describe('formatWeight', () => {
    it('should format weight in kg', () => {
      expect(formatWeight(100, 'kg')).toBe('100.0 kg');
    });

    it('should format weight in lbs with one decimal', () => {
      expect(formatWeight(100, 'lbs')).toBe('220.5 lbs');
    });
  });

  describe('getWeightIncrement', () => {
    it('should return 1.0 for kg', () => {
      expect(getWeightIncrement('kg')).toBe(1.0);
    });

    it('should return 2.5 for lbs', () => {
      expect(getWeightIncrement('lbs')).toBe(2.5);
    });
  });
});
