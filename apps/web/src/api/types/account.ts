export interface QrCreateResponse {
  image?: string
  code: string
  qrcode?: string
  url?: string
}

export interface QrCheckSuccessResponse {
  status: 'OK'
  code: string
  uin: string
  avatar?: string
  nickname?: string
}

export interface QrCheckWaitingResponse {
  status: 'Used' | 'Wait'
}

export interface QrCheckErrorResponse {
  status: 'Error'
  error?: string
}

export type QrCheckResponse = QrCheckSuccessResponse | QrCheckWaitingResponse | QrCheckErrorResponse

export interface AccountMutationPayload {
  id?: string
  uin?: string | number
  code?: string
  loginType?: 'manual' | 'qr'
  name?: string
  nick?: string
  avatar?: string
  platform?: string
  skipAutoStart?: boolean
}
