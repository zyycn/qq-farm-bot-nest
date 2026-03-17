export interface BagItem {
  id: number | string
  name?: string
  count?: number
  image?: string
  hoursText?: string
  price?: number
  category?: string
  [key: string]: unknown
}
