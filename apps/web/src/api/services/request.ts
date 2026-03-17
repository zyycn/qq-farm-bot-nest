import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import axios from 'axios'
import { useUserStore } from '@/stores/modules/user'
import message from '@/utils/message'

const IGNORABLE_ERRORS = ['账号未运行', 'API Timeout']

interface NestResponse<T = unknown> {
  code: number
  message: string
  data: T
}

const api = axios.create({
  baseURL: '/',
  timeout: 10_000
})

api.interceptors.request.use((config) => {
  const token = useUserStore().adminToken
  if (token)
    config.headers.Authorization = `Bearer ${token}`
  return config
}, error => Promise.reject(error))

function unwrapResponse<T>(response: AxiosResponse<NestResponse<T> | unknown>): T | AxiosResponse<NestResponse<T> | unknown> {
  const body = response.data as NestResponse | undefined
  const isNest = body && typeof body.code === 'number'
  if (!isNest)
    return response
  if (body.code >= 200 && body.code < 300) {
    if (body.code !== 200 && body.message && body.message !== 'ok')
      message.warning(body.message)
    return body.data as T
  }
  throw new Error(body.message || '请求失败')
}

type NotifyResult = { msg: string, type: 'error' | 'warning' } | null

function pickErrorNotify(error: AxiosError<{ message?: string, error?: string }>): NotifyResult {
  const { response, request, message: errorMsg } = error

  if (!response) {
    const msg = request
      ? '网络错误，无法连接到服务器'
      : `错误: ${errorMsg}`
    return { msg, type: 'error' }
  }

  const { status, statusText, data } = response

  if (status === 401)
    return null

  const text = data?.message ?? data?.error ?? errorMsg
  const displayMsg = data?.message
    ? `${data.message}`
    : (text ? `请求失败: ${text}` : `请求失败: ${status} ${statusText}`)

  if (status >= 500 && IGNORABLE_ERRORS.includes(text))
    return null

  if (status >= 500)
    return { msg: `服务器错误: ${status} ${statusText}`, type: 'error' }

  return { msg: displayMsg, type: 'warning' }
}

api.interceptors.response.use(
  unwrapResponse,
  (error) => {
    const backendMsg = error.response?.data?.message || error.response?.data?.error
    if (backendMsg)
      error.message = backendMsg
    const result = pickErrorNotify(error)
    if (error.response?.status === 401) {
      handleUnauthorized()
    } else if (result) {
      message[result.type](result.msg)
    }
    return Promise.reject(error)
  }
)

function handleUnauthorized() {
  if (window.location.pathname.includes('/login'))
    return
  useUserStore().clearToken()
  window.location.href = '/login'
  message.warning('登录已过期，请重新登录')
}

interface ApiInstance {
  get: <T = unknown>(url: string, config?: AxiosRequestConfig) => Promise<T>
  post: <T = unknown, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>) => Promise<T>
  put: <T = unknown, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>) => Promise<T>
  delete: <T = unknown>(url: string, config?: AxiosRequestConfig) => Promise<T>
  patch: <T = unknown, D = unknown>(url: string, data?: D, config?: AxiosRequestConfig<D>) => Promise<T>
}

export default api as unknown as ApiInstance
