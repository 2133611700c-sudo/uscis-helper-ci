import {
  Briefcase,
  CarFront,
  FileText,
  Files,
  GraduationCap,
  Heart,
  Home,
  IdCard,
  ScrollText,
  Shield,
  Stethoscope,
  UserCheck,
  UserPen,
  type LucideIcon,
} from 'lucide-react'

export type TranslationDocumentType =
  | 'passport'
  | 'birth-certificate'
  | 'marriage-certificate'
  | 'divorce-certificate'
  | 'diploma-transcript'
  | 'military-document'
  | 'driver-license'
  | 'death-certificate'
  | 'adoption-certificate'
  | 'name-change-certificate'
  | 'police-record'
  | 'medical-record'
  | 'property-document'
  | 'employment-record'
  | 'other-document'

export interface TranslationDocumentConfig {
  id: TranslationDocumentType
  icon: LucideIcon
  titleKey: string
  descriptionKey: string
  fieldsIncludedKey: string
  uploadInstructionsKey: string
  riskNoteKey: string
}

export const translationDocuments: TranslationDocumentConfig[] = [
  {
    id: 'passport',
    icon: IdCard,
    titleKey: 'translationService.documents.passport.title',
    descriptionKey: 'translationService.documents.passport.description',
    fieldsIncludedKey: 'translationService.documents.passport.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.passport.uploadInstructions',
    riskNoteKey: 'translationService.documents.passport.riskNote',
  },
  {
    id: 'birth-certificate',
    icon: FileText,
    titleKey: 'translationService.documents.birthCertificate.title',
    descriptionKey: 'translationService.documents.birthCertificate.description',
    fieldsIncludedKey: 'translationService.documents.birthCertificate.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.birthCertificate.uploadInstructions',
    riskNoteKey: 'translationService.documents.birthCertificate.riskNote',
  },
  {
    id: 'marriage-certificate',
    icon: ScrollText,
    titleKey: 'translationService.documents.marriageCertificate.title',
    descriptionKey: 'translationService.documents.marriageCertificate.description',
    fieldsIncludedKey: 'translationService.documents.marriageCertificate.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.marriageCertificate.uploadInstructions',
    riskNoteKey: 'translationService.documents.marriageCertificate.riskNote',
  },
  {
    id: 'divorce-certificate',
    icon: ScrollText,
    titleKey: 'translationService.documents.divorceCertificate.title',
    descriptionKey: 'translationService.documents.divorceCertificate.description',
    fieldsIncludedKey: 'translationService.documents.divorceCertificate.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.divorceCertificate.uploadInstructions',
    riskNoteKey: 'translationService.documents.divorceCertificate.riskNote',
  },
  {
    id: 'diploma-transcript',
    icon: GraduationCap,
    titleKey: 'translationService.documents.diplomaTranscript.title',
    descriptionKey: 'translationService.documents.diplomaTranscript.description',
    fieldsIncludedKey: 'translationService.documents.diplomaTranscript.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.diplomaTranscript.uploadInstructions',
    riskNoteKey: 'translationService.documents.diplomaTranscript.riskNote',
  },
  {
    id: 'military-document',
    icon: Shield,
    titleKey: 'translationService.documents.militaryDocument.title',
    descriptionKey: 'translationService.documents.militaryDocument.description',
    fieldsIncludedKey: 'translationService.documents.militaryDocument.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.militaryDocument.uploadInstructions',
    riskNoteKey: 'translationService.documents.militaryDocument.riskNote',
  },
  {
    id: 'driver-license',
    icon: CarFront,
    titleKey: 'translationService.documents.driverLicense.title',
    descriptionKey: 'translationService.documents.driverLicense.description',
    fieldsIncludedKey: 'translationService.documents.driverLicense.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.driverLicense.uploadInstructions',
    riskNoteKey: 'translationService.documents.driverLicense.riskNote',
  },
  {
    id: 'death-certificate',
    icon: ScrollText,
    titleKey: 'translationService.documents.deathCertificate.title',
    descriptionKey: 'translationService.documents.deathCertificate.description',
    fieldsIncludedKey: 'translationService.documents.deathCertificate.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.deathCertificate.uploadInstructions',
    riskNoteKey: 'translationService.documents.deathCertificate.riskNote',
  },
  {
    id: 'adoption-certificate',
    icon: Heart,
    titleKey: 'translationService.documents.adoptionCertificate.title',
    descriptionKey: 'translationService.documents.adoptionCertificate.description',
    fieldsIncludedKey: 'translationService.documents.adoptionCertificate.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.adoptionCertificate.uploadInstructions',
    riskNoteKey: 'translationService.documents.adoptionCertificate.riskNote',
  },
  {
    id: 'name-change-certificate',
    icon: UserPen,
    titleKey: 'translationService.documents.nameChangeCertificate.title',
    descriptionKey: 'translationService.documents.nameChangeCertificate.description',
    fieldsIncludedKey: 'translationService.documents.nameChangeCertificate.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.nameChangeCertificate.uploadInstructions',
    riskNoteKey: 'translationService.documents.nameChangeCertificate.riskNote',
  },
  {
    id: 'police-record',
    icon: UserCheck,
    titleKey: 'translationService.documents.policeRecord.title',
    descriptionKey: 'translationService.documents.policeRecord.description',
    fieldsIncludedKey: 'translationService.documents.policeRecord.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.policeRecord.uploadInstructions',
    riskNoteKey: 'translationService.documents.policeRecord.riskNote',
  },
  {
    id: 'medical-record',
    icon: Stethoscope,
    titleKey: 'translationService.documents.medicalRecord.title',
    descriptionKey: 'translationService.documents.medicalRecord.description',
    fieldsIncludedKey: 'translationService.documents.medicalRecord.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.medicalRecord.uploadInstructions',
    riskNoteKey: 'translationService.documents.medicalRecord.riskNote',
  },
  {
    id: 'property-document',
    icon: Home,
    titleKey: 'translationService.documents.propertyDocument.title',
    descriptionKey: 'translationService.documents.propertyDocument.description',
    fieldsIncludedKey: 'translationService.documents.propertyDocument.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.propertyDocument.uploadInstructions',
    riskNoteKey: 'translationService.documents.propertyDocument.riskNote',
  },
  {
    id: 'employment-record',
    icon: Briefcase,
    titleKey: 'translationService.documents.employmentRecord.title',
    descriptionKey: 'translationService.documents.employmentRecord.description',
    fieldsIncludedKey: 'translationService.documents.employmentRecord.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.employmentRecord.uploadInstructions',
    riskNoteKey: 'translationService.documents.employmentRecord.riskNote',
  },
  {
    id: 'other-document',
    icon: Files,
    titleKey: 'translationService.documents.otherDocument.title',
    descriptionKey: 'translationService.documents.otherDocument.description',
    fieldsIncludedKey: 'translationService.documents.otherDocument.fieldsIncluded',
    uploadInstructionsKey: 'translationService.documents.otherDocument.uploadInstructions',
    riskNoteKey: 'translationService.documents.otherDocument.riskNote',
  },
]
