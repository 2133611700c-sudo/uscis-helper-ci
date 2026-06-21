export interface DocumentCard {
  id: string
  iconKey: 'passport' | 'birth' | 'marriage' | 'diploma' | 'military' | 'driver'
  sortOrder: number
}

export const documentCards: DocumentCard[] = [
  { id: 'passport', iconKey: 'passport', sortOrder: 1 },
  { id: 'birth-certificate', iconKey: 'birth', sortOrder: 2 },
  { id: 'marriage-certificate', iconKey: 'marriage', sortOrder: 3 },
  { id: 'diploma', iconKey: 'diploma', sortOrder: 4 },
  { id: 'military-document', iconKey: 'military', sortOrder: 5 },
  { id: 'driver-license', iconKey: 'driver', sortOrder: 6 },
]
