/**
 * Origin Energy Bill Sender Configuration
 * Phase 2 - Gmail Agent Implementation
 */

export type BillType = 'electricity' | 'hot_water' | 'water' | 'internet';

interface SubjectKeywords {
  electricity: string[];
  hot_water: string[];
  water: string[];
  internet: string[];
}

interface BillSenderConfig {
  sender: string;
  timezone: string;
  requirePDF: boolean;
  subjectKeywords: SubjectKeywords;
}

export const ORIGIN_CONFIG: BillSenderConfig = {
  sender: 'hello@origin.com.au',
  timezone: 'Australia/Melbourne',
  requirePDF: true,
  subjectKeywords: {
    electricity: ['electricity', 'power', 'energy bill'],
    hot_water: ['hot water', 'gas', 'heating'],
    water: ['water bill', 'water usage'],
    internet: ['internet', 'broadband', 'nbn'],
  },
};

/**
 * Categorizes an email subject line into a bill type based on keywords
 * @param subject - The email subject line to categorize
 * @returns The matching BillType or null if no match found
 */
export function categorizeBySubject(subject: string): BillType | null {
  const normalizedSubject = subject.toLowerCase();

  // Check each bill type's keywords
  for (const [billType, keywords] of Object.entries(ORIGIN_CONFIG.subjectKeywords)) {
    for (const keyword of keywords) {
      if (normalizedSubject.includes(keyword.toLowerCase())) {
        return billType as BillType;
      }
    }
  }

  return null;
}
