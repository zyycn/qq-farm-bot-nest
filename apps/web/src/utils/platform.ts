export function getPlatformIcon(p?: string): string {
  if (p === 'qq')
    return 'i-icon-park-solid-tencent-qq'
  if (p === 'wx')
    return 'i-icon-park-solid-wechat'
  return ''
}
