export interface PropertyMediaItem {
  id: string;
  ref?: string; // IndexedDB blob hash/reference
  url: string;
  caption: string;
  type: 'photo' | 'drone' | 'video';
  isHelicopterShot?: boolean;
  isCover?: boolean;
}

export interface PropertyDocumentItem {
  id: string;
  name: string;
  type?: string; // MIME type or extension
  sizeBytes?: number;
  ref?: string; // IndexedDB blob hash/reference
  size: string;
  status: 'تایید شده' | 'در حال پردازش OCR' | 'آماده بارگذاری';
  url?: string;
  isConfidential?: boolean;
  autoAttach?: boolean;
}

export interface PropertyVoiceNote {
  audioRef?: string; // IndexedDB blob hash/reference
  transcriptText?: string;
  durationSeconds?: number;
}

export interface TarhHadiCheckResult {
  checkedAt: string;
  isInsideBoundary: boolean;
  isOutsideImageFrame?: boolean;
  boundaryStatus: 'inside' | 'border' | 'outside';
  boundaryStatusText: string;
  subZoneLabel: string;
  landUseCode: string;
  landUseTitle: string;
  landUseColor: string;
  landUseDescription: string;
  imageUV: { u: number; v: number };
  rawImageUV?: { u: number; v: number };
  coordinates: { lat: number; lng: number };
  snapshotBlobRef?: string;
  notes?: string;
}

export interface Property {
  id: string;
  code: string; // e.g. F-001
  title: string;
  propertyType: 'زمین' | 'ویلا' | 'آپارتمان' | 'مغازه و تجاری' | 'باغ' | 'شهرک برند';
  status: 'فعال' | 'در مذاکره' | 'رزرو شده' | 'فروخته‌شده' | 'غیرفعال';
  registrationDate: string; // Jalali e.g. ۱۴۰۵/۰۷/۱۴
  registrationDateIso: string;
  province: string;
  city: string;
  district: string;
  accessPath?: string;
  accessRoute?: string;
  lotLabel?: string;
  deedType: string;
  deedCustomText?: string;
  zoningStatus: string;
  zoningCustomText?: string;
  area: number; // m2
  pricePerMeter: number; // Toman
  totalPrice: number; // Toman
  isNegotiable: boolean;
  length?: number;
  width?: number;
  lotShape?: string;
  frontageCount?: string;
  passageWidth?: number;
  orientation?: string;
  landUsage?: string;
  structureStatus?: string;
  zoningAuthorities?: string[];
  fencingNotes?: string;
  densityPercent?: string;
  maxLotCoverage?: string;
  floorsCount?: string;
  permitStageType?: string;
  permitPotential?: string;
  utilitiesLocation?: string;
  utilities?: {
    water?: boolean;
    electricity?: boolean;
    power?: boolean;
    gas?: boolean;
    phone?: boolean;
    fiber?: boolean;
  };
  utilityNotes?: string;
  permitStatus?: string;
  permitNumber?: string;
  substructureArea?: number;
  permitIssueDate?: string;
  permitExpiryDate?: string;
  commissionRate?: string;
  commissionText?: string;
  paymentMethod?: string;
  settlementMethod?: string;
  paymentTerms?: string;
  contactPartner?: string;
  contactSource?: string;
  lastContactDate?: string;
  nextFollowupDate?: string;
  internalNotes?: string; // admin only
  coordinates?: {
    lat: number;
    lng: number;
  };
  tarhHadiCheck?: TarhHadiCheckResult;
  address?: string;
  advisorVoiceTranscript?: string;
  voiceNote?: PropertyVoiceNote;
  media: PropertyMediaItem[];
  images?: PropertyMediaItem[];
  documents: PropertyDocumentItem[];
  ownerName: string; // admin only
  ownerPhone: string; // admin only
  assignedAdvisor?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  deleted?: boolean;
}

export interface Applicant {
  id: string;
  code: string; // e.g. C-001
  fullName: string;
  phone: string;
  priority: 'خریدار VIP' | 'سرمایه‌گذار نقدی' | 'ضرب‌الاجل' | 'عادی';
  creditLevel: 'عالی' | 'خوب' | 'عادی' | 'ضعیف';
  gender: 'آقا' | 'خانم';
  referralSource?: string;
  confidentialNotes?: string; // admin only
  dealTypes: string[];
  primaryCity: string;
  preferredNeighborhoods: string[];
  environmentProximity: string[];
  minArea: number;
  maxArea: number;
  minBudget: number; // Toman
  maxBudget: number; // Toman
  liquidityPercent: number;
  canBarter: boolean;
  barterDesc?: string;
  settlementMaxDays: number;
  deedTypes: string[];
  zoningTypes: string[];
  followUpStatus: 'جدید' | 'در حال پیگیری' | 'بازدید' | 'معامله‌شده';
  lastContactDate?: string;
  nextFollowUpDate?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  deleted?: boolean;
}

export interface Collaborator {
  id: string;
  code: string; // e.g. H-001
  fullName: string;
  phone: string;
  agencyName: string;
  role: 'مدیر آژانس' | 'سرپرست رنج' | 'مشاور مستقل' | 'سرمایه‌گذار سازنده';
  gender: 'آقا' | 'خانم';
  performanceLevel: 'عالی' | 'خوب' | 'عادی' | 'ضعیف';
  primaryCity: string;
  coverageNeighborhoods: string[];
  specialties: string[];
  landformMastery: string[];
  commissionFormula: 'نصف کمیسیون (۵۰/۵۰)' | 'شیرینی توافقی بر مبنای قرارداد';
  commissionNotes?: string;
  cooperationStatus: 'همکاری فعال (VIP)' | 'تازه آشنا / جدید' | 'در حال ارزیابی' | 'غیرفعال / راکد';
  nextFollowUpDate?: string;
  privateNotes?: string; // admin only
  createdAt: string;
  updatedAt: string;
  version: number;
  deleted?: boolean;
}

export interface ReminderTask {
  id: string;
  title: string;
  category: 'تماس تلفنی' | 'استعلام سند' | 'بازدید حضوری' | 'پیگیری مالی' | 'تسویه و کمیسیون';
  priority: 'فوری و بحرانی' | 'عادی' | 'کم‌اهمیت';
  dateJalali: string;
  timeStr: string;
  dueDateTimeIso: string;
  linkedPropertyCode?: string;
  linkedPropertyId?: string;
  linkedPersonName?: string;
  linkedPersonCode?: string;
  linkedPersonPhone?: string;
  status: 'pending' | 'completed' | 'snoozed';
  isSnoozed?: boolean;
  notifySms?: boolean;
  notifyPush?: boolean;
  transcript?: string;
  audioBlobUrl?: string;
  gcalEventId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriveSnapshot {
  id: string;
  dateStr: string;
  timestamp: number;
  user: string;
  deviceId: string;
  recordCount: {
    properties: number;
    applicants: number;
    collaborators: number;
    reminders: number;
  };
  sizeKb: number;
  checksum: string;
  data: any;
}

export interface MatchResult {
  property: Property;
  applicant: Applicant;
  percentage: number;
  reasons: string[];
}
