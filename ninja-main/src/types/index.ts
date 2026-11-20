export type UserRole = 'owner' | 'tenant' | 'builder' | 'craftsman';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  roleTitle: string;
  apartmentNumber?: string;
  apartmentId?: string;
  buildingId: string;
  companyName?: string;
  avatarUrl: string;
}

export interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  totalFloors: number;
  totalApartments: number;
  occupiedApartments: number;
  yearBuilt: number;
  reserveFundBalance: number; // in EUR
  monthlyCollectionRate: number; // in %
  exteriorImage: string;
  lobbyImage: string;
  facilities: string[];
  contactManager: string;
  phoneManager: string;
  iban?: string;
  bankName?: string;
}

export interface Apartment {
  id: string;
  buildingId: string;
  number: string;
  floor: number;
  entrance?: string;
  areaSqM: number;
  rooms: number;
  tenantId?: string;
  tenantName?: string;
  tenantPhone?: string;
  status: 'occupied' | 'vacant' | 'under_repair';
  monthlyRent: number;
  monthlyMaintenanceFee: number;
  waterMeterReading: number; // m3
  electricMeterReading: number; // kWh
  lastMeterUpdate: string;
}

export type PaymentStatus = 
  | 'unpaid' 
  | 'declared_paid' 
  | 'pending_verification' 
  | 'confirmed_paid' 
  | 'partially_paid' 
  | 'overdue';

export interface PaymentObligation {
  id: string;
  buildingId: string;
  apartmentId: string;
  apartmentNumber: string;
  tenantId: string;
  tenantName: string;
  title: string;
  type: 'rent' | 'electricity' | 'water' | 'common_fund' | 'repair_fund';
  amount: number;
  dueDate: string;
  period: string;
  status: PaymentStatus;
  paidAmount?: number;
  paidAt?: string;
  proofUrl?: string;
  proofType?: 'image' | 'pdf';
  proofExtractedData?: {
    detectedAmount?: number;
    detectedDate?: string;
    senderName?: string;
    recipientIban?: string;
    referenceNumber?: string;
    paymentReason?: string;
    notes?: string;
  };
  confirmedByOwnerAt?: string;
  rejectedReason?: string;
  notes?: string;
}

export interface Appliance {
  id: string;
  buildingId: string;
  apartmentId?: string; // empty if common area
  locationName: string;
  name: string;
  category: 'hvac' | 'boiler' | 'elevator' | 'intercom' | 'hydrophore' | 'generator';
  model: string;
  manufacturer: string;
  serialNumber: string;
  installationDate: string;
  warrantyExpiryDate: string;
  status: 'operational' | 'needs_service' | 'critical_issue' | 'decommissioned';
  lastServicedAt: string;
  nextMaintenanceDue: string;
  photoUrl: string;
  manualUrl?: string;
  energyClass?: string;
  serviceHistory: Array<{
    id: string;
    date: string;
    technicianName: string;
    description: string;
    cost: number;
  }>;
}

export type RepairPriority = 'urgent' | 'high' | 'medium' | 'low';
export type RepairStatus = 'reported' | 'approved' | 'scheduled' | 'in_progress' | 'completed' | 'rejected';

export interface RepairTicket {
  id: string;
  ticketNumber: string; // e.g. "REM-2026-042"
  title: string;
  description: string;
  category: 'plumbing' | 'electrical' | 'hvac' | 'common_area' | 'construction_defect' | 'elevator';
  priority: RepairPriority;
  status: RepairStatus;
  buildingId: string;
  apartmentId?: string;
  apartmentNumber?: string;
  reporterRole: UserRole;
  reporterName: string;
  assignedCraftsmanId?: string;
  assignedCraftsmanName?: string;
  assignedBuilderName?: string;
  estimatedBudget: number;
  approvedBudget?: number;
  actualCost?: number;
  reportedDate: string;
  deadlineDate: string;
  scheduledVisitDate?: string;
  completedDate?: string;
  locationDetail: string;
  beforePhotos: string[];
  afterPhotos: string[];
  materialsUsed?: string[];
  technicianNotes?: string;
  ownerApprovalNotes?: string;
}

export interface ConstructionDefect {
  id: string;
  defectNumber: string; // e.g. "DEF-2026-014"
  buildingId: string;
  title: string;
  location: string;
  severity: 'cosmetic' | 'structural' | 'isolation' | 'finishing';
  status: 'open' | 'fixing' | 'verified_fixed';
  reportedBy: string;
  reportedAt: string;
  deadline: string;
  contractorName: string;
  photos: string[];
  actionPlan: string;
  verifiedAt?: string;
}

export type EventCategory = 
  | 'rent_deadline' 
  | 'repair' 
  | 'construction' 
  | 'inspection' 
  | 'maintenance' 
  | 'cleaning' 
  | 'meeting';

export interface CalendarEvent {
  id: string;
  title: string;
  category: EventCategory;
  startDateTime: string; // ISO string or YYYY-MM-DDTHH:mm
  endDateTime: string;
  buildingId: string;
  apartmentNumber?: string;
  assignedToName: string;
  assignedRole: UserRole | 'all';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  description: string;
  priority: 'urgent' | 'high' | 'normal';
  isRecurring?: boolean;
  recurrenceRule?: string;
}

export interface ExpenseRecord {
  id: string;
  buildingId: string;
  title: string;
  category: 'cleaning' | 'elevator_service' | 'landscaping' | 'security' | 'repair' | 'utilities';
  amount: number;
  date: string;
  vendor: string;
  invoiceNumber: string;
  status: 'pending_approval' | 'approved' | 'paid';
  approvedByOwner: boolean;
  documentUrl?: string;
}

export interface AIDailySummary {
  headline: string;
  keyMetrics: Array<{
    label: string;
    value: string | number;
    change?: string;
    alert?: boolean;
  }>;
  urgentItems: Array<{
    id: string;
    type: 'payment' | 'repair' | 'calendar' | 'defect';
    title: string;
    subtitle: string;
    actionLabel: string;
    targetTab: string;
  }>;
  insights: string[];
  upcomingToday: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  isActionProposal?: boolean;
  actionDetails?: {
    type: string;
    title: string;
    description: string;
    data: any;
  };
}
