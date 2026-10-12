import { Property, Applicant, MatchResult } from '../types';

export function calculateMatchScore(property: Property, applicant: Applicant): { percentage: number; reasons: string[] } {
  if (property.deleted || applicant.deleted) {
    return { percentage: 0, reasons: [] };
  }

  let totalScore = 0;
  let maxPossible = 0;
  const reasons: string[] = [];

  // 1. Budget Fit (Weight: 35)
  maxPossible += 35;
  if (property.totalPrice > 0) {
    const minB = applicant.minBudget || 0;
    const maxB = applicant.maxBudget || Infinity;
    if (property.totalPrice >= minB && property.totalPrice <= maxB) {
      totalScore += 35;
      reasons.push('بودجه کاملاً منطبق');
    } else if (property.totalPrice <= maxB * 1.15 && property.totalPrice >= minB * 0.85) {
      totalScore += 22;
      reasons.push('نزدیک به بازه بودجه');
    }
  }

  // 2. Area Range Fit (Weight: 25)
  maxPossible += 25;
  if (property.area > 0) {
    const minA = applicant.minArea || 0;
    const maxA = applicant.maxArea || Infinity;
    if (property.area >= minA && property.area <= maxA) {
      totalScore += 25;
      reasons.push('متراژ کاملاً در بازه درخواستی');
    } else if (property.area >= minA * 0.85 && property.area <= maxA * 1.15) {
      totalScore += 16;
      reasons.push('متراژ نزدیک به درخواست');
    }
  }

  // 3. Location / City & Neighborhood (Weight: 20)
  maxPossible += 20;
  if (applicant.primaryCity) {
    const cityMatch = property.city && property.city.includes(applicant.primaryCity);
    const hoodMatch = applicant.preferredNeighborhoods?.some(
      n => (property.district && property.district.includes(n)) || (property.address && property.address.includes(n))
    );

    if (cityMatch && hoodMatch) {
      totalScore += 20;
      reasons.push('شهر و محله منطبق');
    } else if (cityMatch) {
      totalScore += 14;
      reasons.push('شهر منطبق');
    }
  } else {
    totalScore += 10;
  }

  // 4. Deed Type Fit (Weight: 10)
  maxPossible += 10;
  if (applicant.deedTypes && applicant.deedTypes.length > 0) {
    const deedMatch = applicant.deedTypes.some(d => property.deedType && property.deedType.includes(d));
    if (deedMatch) {
      totalScore += 10;
      reasons.push('نوع سند متناسب');
    }
  } else {
    totalScore += 10;
  }

  // 5. Zoning / Texture Fit (Weight: 10)
  maxPossible += 10;
  if (applicant.zoningTypes && applicant.zoningTypes.length > 0) {
    const zoneMatch = applicant.zoningTypes.some(z => property.zoningStatus && property.zoningStatus.includes(z));
    if (zoneMatch) {
      totalScore += 10;
      reasons.push('بافت و کاربری تاییدشده');
    }
  } else {
    totalScore += 10;
  }

  const rawPercent = Math.round((totalScore / maxPossible) * 100);
  const percentage = Math.min(100, Math.max(0, rawPercent));
  return { percentage, reasons };
}

// Global cached calculation
const matchCache = new Map<string, { percentage: number; reasons: string[] }>();

export function getCachedMatchScore(property: Property, applicant: Applicant): { percentage: number; reasons: string[] } {
  const cacheKey = `${property.id}_${property.updatedAt}_${applicant.id}_${applicant.updatedAt}`;
  if (matchCache.has(cacheKey)) {
    return matchCache.get(cacheKey)!;
  }
  const result = calculateMatchScore(property, applicant);
  matchCache.set(cacheKey, result);
  return result;
}

export function findMatchesForApplicant(applicant: Applicant, properties: Property[], threshold = 70): MatchResult[] {
  return properties
    .filter(p => !p.deleted && p.status === 'فعال')
    .map(p => {
      const match = getCachedMatchScore(p, applicant);
      return {
        property: p,
        applicant,
        percentage: match.percentage,
        reasons: match.reasons
      };
    })
    .filter(m => m.percentage >= threshold)
    .sort((a, b) => b.percentage - a.percentage);
}

export function findMatchesForProperty(property: Property, applicants: Applicant[], threshold = 70): MatchResult[] {
  return applicants
    .filter(a => !a.deleted && a.followUpStatus !== 'معامله‌شده')
    .map(a => {
      const match = getCachedMatchScore(property, a);
      return {
        property,
        applicant: a,
        percentage: match.percentage,
        reasons: match.reasons
      };
    })
    .filter(m => m.percentage >= threshold)
    .sort((a, b) => b.percentage - a.percentage);
}
